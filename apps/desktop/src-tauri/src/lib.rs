mod git;
pub mod indexer;
mod ipc;
mod keychain;
mod sidecar;

mod orchestrator;
mod pty;

use ipc::PiConnection;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::{Mutex, Notify};
use std::sync::Mutex as StdMutex;

/// Cross-platform home directory helper. Uses the `dirs` crate so it works
/// on macOS (`$HOME`), Windows (`USERPROFILE` / `FOLDERID_Profile`), and Linux.
fn tide_home_dir() -> std::path::PathBuf {
    dirs::home_dir().expect("Could not determine home directory")
}

pub struct AppState {
    pub pi: Arc<Mutex<Option<PiConnection>>>,
    pub workspace_root: Arc<Mutex<Option<String>>>,
    pub _pi_child: Arc<Mutex<Option<tokio::process::Child>>>,
    pub indexer: Arc<Mutex<Option<indexer::IndexerState>>>,
    pub agent_end_notify: Arc<Notify>,
    pub pty_manager: StdMutex<pty::PtyManager>,
    pub orc_cancel: Arc<std::sync::atomic::AtomicBool>,
    pub orc_active: Arc<std::sync::atomic::AtomicBool>,
}

// ── Pi Agent Commands ───────────────────────────────────────

/// Send a prompt to Pi. Response streams back as Tauri events.
/// Accepts optional `images` array of { mediaType, base64 } for multimodal prompts.
#[tauri::command]
async fn send_prompt(
    state: tauri::State<'_, AppState>,
    text: String,
    images: Option<Vec<serde_json::Value>>,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    // Pi RPC protocol: {"type": "prompt", "message": "text", "images": [{type, data, mimeType}]}
    let cmd = if let Some(imgs) = images.filter(|v| !v.is_empty()) {
        let pi_images: Vec<serde_json::Value> = imgs.iter().map(|img| {
            let mime_type = img.get("mediaType").and_then(|v| v.as_str()).unwrap_or("image/png");
            let data = img.get("base64").and_then(|v| v.as_str()).unwrap_or("");
            serde_json::json!({
                "type": "image",
                "data": data,
                "mimeType": mime_type,
            })
        }).collect();
        serde_json::json!({
            "type": "prompt",
            "message": text,
            "images": pi_images,
        })
    } else {
        serde_json::json!({
            "type": "prompt",
            "message": text,
        })
    };

    tracing::info!("Sending prompt to Pi: {} chars", text.len());
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    tracing::info!("Prompt sent to Pi successfully");
    Ok(())
}

/// Abort the current Pi agent operation.
#[tauri::command]
async fn abort_agent(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({ "type": "abort" });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Restart Pi agent (e.g. after changing API keys).
#[tauri::command]
async fn restart_pi(
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // Kill existing Pi process and wait for it to fully exit
    {
        let mut child_guard = state._pi_child.lock().await;
        if let Some(mut child) = child_guard.take() {
            let _ = child.kill().await;
            // Wait for process to be fully reaped so fds are released
            let _ = child.wait().await;
            tracing::info!("Killed existing Pi process");
        }
        let mut pi = state.pi.lock().await;
        *pi = None;
    }

    // Determine workspace root (fall back to cwd)
    let workspace = {
        let root = state.workspace_root.lock().await;
        root.clone().unwrap_or_else(|| {
            std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| ".".to_string())
        })
    };

    let extensions = resolve_extension_paths();
    let pi_state = state.pi.clone();
    let child_state = state._pi_child.clone();

    match sidecar::start_pi(&workspace, &extensions).await {
        Ok((conn, child)) => {
            tracing::info!("Pi agent restarted successfully");

            // Re-wire event forwarding
            let event_rx = conn.event_rx.clone();
            let pending = conn.pending.clone();
            let handle = app_handle.clone();
            let agent_notify = state.agent_end_notify.clone();
            tokio::spawn(async move {
                let mut rx = event_rx.lock().await;
                loop {
                    match rx.recv().await {
                        Some(event) => {
                            let event_type = event
                                .get("type")
                                .and_then(|t| t.as_str())
                                .unwrap_or("unknown");
                            if event_type == "model_select" || event_type.contains("model") {
                                tracing::debug!("Forwarding model event (restart): {} — {}", event_type,
                                    serde_json::to_string(&event).unwrap_or_default().chars().take(200).collect::<String>());
                            }
                            // Route response events to pending request waiters
                            if event_type == "response" {
                                if let Some(id) = event.get("id").and_then(|v| v.as_str()) {
                                    let mut map = pending.lock().await;
                                    if let Some(sender) = map.remove(id) {
                                        let _ = sender.send(event.clone());
                                    }
                                }
                            }
                            if let Err(e) = handle.emit("pi_event", &event) {
                                tracing::error!("Failed to emit pi_event ({}): {}", event_type, e);
                            }
                            if event_type == "extension_ui_request" {
                                let _ = handle.emit("pi_ui_request", &event);
                            }
                            if event_type == "agent_end" {
                                agent_notify.notify_waiters();
                            }
                        }
                        None => {
                            tracing::info!("Pi event channel closed");
                            break;
                        }
                    }
                }
            });

            let mut pi = pi_state.lock().await;
            *pi = Some(conn);
            let mut child_guard = child_state.lock().await;
            *child_guard = Some(child);

            // Notify frontend that Pi is ready
            let _ = app_handle.emit("pi_ready", ());
            tracing::info!("Emitted pi_ready event (restart)");
            Ok(())
        }
        Err(e) => {
            tracing::error!("Failed to restart Pi: {}", e);
            Err(format!("Failed to restart Pi: {}", e))
        }
    }
}

/// Get version info for Tide and Pi.
#[tauri::command]
fn get_version_info() -> Result<serde_json::Value, String> {
    let tide_version = env!("CARGO_PKG_VERSION");

    // Try to read Pi version from node_modules package.json
    let pi_version = ["node_modules/@mariozechner/pi-coding-agent/package.json",
                       "../../node_modules/@mariozechner/pi-coding-agent/package.json",
                       "../../../node_modules/@mariozechner/pi-coding-agent/package.json"]
        .iter()
        .find_map(|p| std::fs::read_to_string(p).ok())
        .and_then(|contents| {
            serde_json::from_str::<serde_json::Value>(&contents)
                .ok()
                .and_then(|v| v["version"].as_str().map(String::from))
        })
        .unwrap_or_else(|| "unknown".to_string());

    Ok(serde_json::json!({
        "tide": tide_version,
        "pi": pi_version,
    }))
}

/// Get Pi connection status.
#[tauri::command]
async fn get_pi_status(
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let pi = state.pi.lock().await;
    if pi.is_some() {
        Ok("connected".to_string())
    } else {
        Ok("disconnected".to_string())
    }
}

/// Request Pi agent state (model, session info).
/// The response arrives as a pi_event.
#[tauri::command]
async fn get_pi_state(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({ "type": "get_state" });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Request available models from Pi. Response arrives as pi_event.
#[tauri::command]
async fn get_available_models(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({ "type": "get_available_models" });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Set the model Pi should use. Requires provider + modelId.
/// Blocked during orchestration to prevent model switching mid-pipeline.
#[tauri::command]
async fn set_pi_model(
    state: tauri::State<'_, AppState>,
    provider: String,
    model_id: String,
) -> Result<(), String> {
    if state.orc_active.load(std::sync::atomic::Ordering::Relaxed) {
        return Err("Cannot change model during orchestration".to_string());
    }

    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({
        "type": "set_model",
        "provider": provider,
        "modelId": model_id,
    });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Set Pi thinking/reasoning level.
#[tauri::command]
async fn set_thinking_level(
    state: tauri::State<'_, AppState>,
    level: String,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({
        "type": "set_thinking_level",
        "level": level,
    });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Get session stats (token usage, costs).
#[tauri::command]
async fn get_session_stats(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({ "type": "get_session_stats" });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Compact the Pi conversation context.
/// Uses send_with_id to wait for Pi's response — Pi docs require awaiting compact completion.
#[tauri::command]
async fn compact_context(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;
    let handle = conn.handle();
    drop(pi_guard); // Release lock before awaiting response

    let mut cmd = serde_json::json!({ "type": "compact" });
    let rx = handle.send_with_id(&mut cmd).await.map_err(|e| e.to_string())?;

    // Wait for response with 30s timeout (same as orchestrator)
    match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
        Ok(Ok(val)) => Ok(val),
        Ok(Err(_)) => Err("Compact response channel closed".to_string()),
        Err(_) => Err("Compact timed out after 30s".to_string()),
    }
}

/// List available Pi sessions by scanning the session directory.
/// Pi stores sessions as .jsonl files. We scan the directory and extract metadata.
#[tauri::command]
async fn list_sessions(
    state: tauri::State<'_, AppState>,
    session_dir: Option<String>,
) -> Result<serde_json::Value, String> {
    // Resolve the session directory:
    // 1. Use provided session_dir (derived from sessionFile in get_state response)
    // 2. Fall back to ~/.pi/agent/sessions/ and scan all workspace subdirectories
    //    Pi stores sessions in ~/.pi/agent/sessions/{workspace-slug}/ where
    //    the slug is the CWD path with "/" replaced by "-" (e.g. --Users-mac-foo--)
    let sessions_root = tide_home_dir().join(".pi").join("agent").join("sessions");

    // Collect directories to scan for .jsonl files
    let dirs_to_scan: Vec<std::path::PathBuf> = if let Some(d) = &session_dir {
        tracing::debug!("[list_sessions] Using provided session_dir: {}", d);
        vec![std::path::PathBuf::from(d)]
    } else {
        let root = state.workspace_root.lock().await;
        let cwd = root.clone().unwrap_or_else(|| {
            std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| ".".to_string())
        });
        drop(root);

        tracing::debug!("[list_sessions] No session_dir provided. workspace/cwd: {}", cwd);
        tracing::debug!("[list_sessions] sessions_root: {}", sessions_root.display());

        let slug = format!("-{}-", cwd.replace('/', "-"));
        let candidate = sessions_root.join(&slug);
        tracing::debug!("[list_sessions] Trying slug candidate: {} (exists: {})", candidate.display(), candidate.exists());

        if candidate.exists() {
            vec![candidate]
        } else {
            // Scan all workspace subdirectories as fallback
            if sessions_root.exists() {
                let mut dirs = Vec::new();
                if let Ok(entries) = std::fs::read_dir(&sessions_root) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_dir() {
                            tracing::debug!("[list_sessions] Found subdirectory: {}", p.display());
                            dirs.push(p);
                        }
                    }
                }
                if dirs.is_empty() {
                    tracing::debug!("[list_sessions] No subdirs found, using sessions_root");
                    vec![sessions_root.clone()]
                } else {
                    tracing::debug!("[list_sessions] Scanning {} subdirectories", dirs.len());
                    dirs
                }
            } else {
                tracing::debug!("[list_sessions] sessions_root does not exist");
                return Ok(serde_json::json!([]));
            }
        }
    };

    let mut sessions = Vec::new();

    tracing::debug!("[list_sessions] Scanning {} directories", dirs_to_scan.len());
    for dir in &dirs_to_scan {
        tracing::debug!("[list_sessions] Scanning dir: {} (exists: {})", dir.display(), dir.exists());
        if !dir.exists() { continue; }
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(err) => {
                tracing::warn!("[list_sessions] Failed to read dir {}: {}", dir.display(), err);
                continue;
            }
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }

            let file_path = path.to_string_lossy().to_string();
            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let modified = metadata.modified().ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);

            // Read first few lines to extract session name and first user message
            let mut name = String::new();
            let mut first_message = String::new();
            let mut message_count = 0u32;

            if let Ok(content) = std::fs::read_to_string(&path) {
                for line in content.lines().take(50) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
                        if let Some(n) = val.get("sessionName").and_then(|v| v.as_str()) {
                            if !n.is_empty() {
                                name = n.to_string();
                            }
                        }
                        if val.get("role").and_then(|v| v.as_str()) == Some("user") {
                            message_count += 1;
                            if first_message.is_empty() {
                                if let Some(text) = val.get("content").and_then(|v| v.as_str()) {
                                    first_message = text.chars().take(100).collect();
                                }
                            }
                        }
                        if val.get("role").and_then(|v| v.as_str()) == Some("assistant") {
                            message_count += 1;
                        }
                    }
                }
            }

            if name.is_empty() && !first_message.is_empty() {
                name = first_message.clone();
            }
            if name.is_empty() {
                name = path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Untitled")
                    .to_string();
            }

            tracing::debug!("[list_sessions] Found session: {} (name: \"{}\", msgs: {})", file_path, name, message_count);
            sessions.push(serde_json::json!({
                "file": file_path,
                "name": name,
                "updatedAt": modified,
                "messageCount": message_count,
            }));
        }
    }

    tracing::debug!("[list_sessions] Total sessions found: {}", sessions.len());

    // Sort by most recently modified first
    sessions.sort_by(|a, b| {
        let a_time = a["updatedAt"].as_u64().unwrap_or(0);
        let b_time = b["updatedAt"].as_u64().unwrap_or(0);
        b_time.cmp(&a_time)
    });

    Ok(serde_json::Value::Array(sessions))
}

/// Start a new Pi session.
#[tauri::command]
async fn new_session(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({ "type": "new_session" });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Get conversation messages from Pi.
#[tauri::command]
async fn get_messages(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({ "type": "get_messages" });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Steer: interrupt the agent mid-run with new instructions.
#[tauri::command]
async fn steer_agent(
    state: tauri::State<'_, AppState>,
    message: String,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({
        "type": "steer",
        "message": message,
    });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Follow-up: queue a message for after the agent finishes.
#[tauri::command]
async fn follow_up(
    state: tauri::State<'_, AppState>,
    message: String,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({
        "type": "follow_up",
        "message": message,
    });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Switch to a different Pi session.
#[tauri::command]
async fn switch_session(
    state: tauri::State<'_, AppState>,
    session_file: String,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({
        "type": "switch_session",
        "sessionPath": session_file,
    });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Fork the current session from this point.
#[tauri::command]
async fn fork_session(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({ "type": "fork" });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Set a human-readable session name.
#[tauri::command]
async fn set_session_name(
    state: tauri::State<'_, AppState>,
    name: String,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({
        "type": "set_session_name",
        "name": name,
    });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Delete a session file from disk.
/// If `is_active` is true, tells Pi to start a fresh session so the deleted
/// one won't be resurrected on next restart via the `-c` flag.
#[tauri::command]
async fn delete_session(
    state: tauri::State<'_, AppState>,
    session_file: String,
    is_active: Option<bool>,
) -> Result<(), String> {
    let path = std::path::PathBuf::from(&session_file);
    if path.exists() && path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }

    // If we just deleted the active session, tell Pi to start a new one
    // so it doesn't try to resume the deleted session on restart.
    if is_active.unwrap_or(false) {
        let pi_guard = state.pi.lock().await;
        if let Some(conn) = pi_guard.as_ref() {
            let cmd = serde_json::json!({ "type": "new_session" });
            conn.send(&cmd).await.map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

/// Read the router config from .tide/router-config.json in the workspace.
#[tauri::command]
async fn read_router_config(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_ref().ok_or("No workspace open")?;

    let config_path = std::path::PathBuf::from(workspace).join(".tide").join("router-config.json");
    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(serde_json::json!({ "enabled": true, "autoSwitch": true }))
    }
}

/// Write the router config to .tide/router-config.json in the workspace.
/// Merges new values into any existing config to preserve fields like tierModels.
#[tauri::command]
async fn write_router_config(
    state: tauri::State<'_, AppState>,
    enabled: bool,
    auto_switch: bool,
    tier_models: Option<serde_json::Value>,
) -> Result<(), String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_ref().ok_or("No workspace open")?;

    let tide_dir = std::path::PathBuf::from(workspace).join(".tide");
    if !tide_dir.exists() {
        std::fs::create_dir_all(&tide_dir).map_err(|e| e.to_string())?;
    }

    let config_path = tide_dir.join("router-config.json");

    // Read existing config to preserve extra fields
    let mut config: serde_json::Value = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    config["enabled"] = serde_json::json!(enabled);
    config["autoSwitch"] = serde_json::json!(auto_switch);
    if let Some(tiers) = tier_models {
        config["tierModels"] = tiers;
    }

    std::fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap())
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Read orchestrator config from .tide/orchestrator-config.json.
#[tauri::command]
async fn read_orchestrator_config(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_ref().ok_or("No workspace open")?;

    let config_path = std::path::PathBuf::from(workspace)
        .join(".tide")
        .join("orchestrator-config.json");
    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        // Return defaults
        Ok(serde_json::json!({
            "reviewMode": "fresh_session",
            "maxReviewIterations": 2,
            "qaCommands": [],
            "clarifyTimeoutSecs": 120,
            "lockModelDuringOrchestration": true
        }))
    }
}

/// Write orchestrator config to .tide/orchestrator-config.json.
#[tauri::command]
async fn write_orchestrator_config(
    state: tauri::State<'_, AppState>,
    config: serde_json::Value,
) -> Result<(), String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_ref().ok_or("No workspace open")?;

    let tide_dir = std::path::PathBuf::from(workspace).join(".tide");
    if !tide_dir.exists() {
        std::fs::create_dir_all(&tide_dir).map_err(|e| e.to_string())?;
    }

    let config_path = tide_dir.join("orchestrator-config.json");
    std::fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap())
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Export session as HTML.
#[tauri::command]
async fn export_session_html(
    state: tauri::State<'_, AppState>,
    output_path: String,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({
        "type": "export_html",
        "outputPath": output_path,
    });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Toggle auto-compaction.
#[tauri::command]
async fn set_auto_compaction(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({
        "type": "set_auto_compaction",
        "enabled": enabled,
    });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Toggle auto-retry.
#[tauri::command]
async fn set_auto_retry(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({
        "type": "set_auto_retry",
        "enabled": enabled,
    });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Get available extension/skill commands.
#[tauri::command]
async fn get_commands(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({ "type": "get_commands" });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Execute a bash command through Pi's context.
#[tauri::command]
async fn pi_bash(
    state: tauri::State<'_, AppState>,
    command: String,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({
        "type": "bash",
        "command": command,
    });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Abort a running bash command.
#[tauri::command]
async fn abort_bash(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({ "type": "abort_bash" });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Abort an in-progress retry.
#[tauri::command]
async fn abort_retry(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({ "type": "abort_retry" });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Get last assistant text (useful for copy-to-clipboard).
#[tauri::command]
async fn get_last_assistant_text(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({ "type": "get_last_assistant_text" });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Start an orchestrated multi-phase pipeline: Route → Plan → Build → Review.
/// Runs in the background. Progress emitted as `orchestration_event` Tauri events.
/// Includes a heartbeat mechanism so the frontend can detect stalls.
#[tauri::command]
async fn orchestrate(
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
    prompt: String,
) -> Result<(), String> {
    let workspace = {
        let root = state.workspace_root.lock().await;
        root.clone().ok_or("No workspace open")?
    };

    let pi_handle = {
        let guard = state.pi.lock().await;
        guard.as_ref().ok_or("Pi not connected")?.handle()
    }; // Lock released here

    let notify = state.agent_end_notify.clone();
    let cancel_flag = state.orc_cancel.clone();
    let active_flag = state.orc_active.clone();
    // Reset cancel flag before starting
    cancel_flag.store(false, std::sync::atomic::Ordering::Relaxed);
    active_flag.store(true, std::sync::atomic::Ordering::Relaxed);
    let handle = app_handle.clone();

    tokio::spawn(async move {
        // Heartbeat: emit periodic events so frontend can detect if orchestration stalls.
        let heartbeat_handle = handle.clone();
        let heartbeat_flag = Arc::new(std::sync::atomic::AtomicBool::new(true));
        let heartbeat_running = heartbeat_flag.clone();
        let heartbeat_task = tokio::spawn(async move {
            while heartbeat_running.load(std::sync::atomic::Ordering::Relaxed) {
                tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
                if !heartbeat_running.load(std::sync::atomic::Ordering::Relaxed) {
                    break;
                }
                let _ = heartbeat_handle.emit("orchestration_heartbeat", serde_json::json!({
                    "timestamp": std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0),
                }));
            }
        });

        let orc = orchestrator::Orchestrator::new(workspace);
        let result = orc.run(prompt, pi_handle, handle.clone(), notify, cancel_flag).await;

        // Stop heartbeat and mark orchestration inactive
        heartbeat_flag.store(false, std::sync::atomic::Ordering::Relaxed);
        heartbeat_task.abort();
        active_flag.store(false, std::sync::atomic::Ordering::Relaxed);

        if let Err(e) = result {
            tracing::error!("Orchestration failed: {}", e);
            let _ = handle.emit(
                "orchestration_event",
                serde_json::json!({
                    "phase": "failed",
                    "planId": serde_json::Value::Null,
                    "currentStep": 0,
                    "totalSteps": 0,
                    "message": e,
                }),
            );
        }
    });

    Ok(())
}

/// Cancel a running orchestration pipeline.
#[tauri::command]
async fn cancel_orchestration(
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    state.orc_cancel.store(true, std::sync::atomic::Ordering::Relaxed);
    // Also abort the current Pi agent operation so it stops immediately
    let pi_guard = state.pi.lock().await;
    if let Some(conn) = pi_guard.as_ref() {
        let cmd = serde_json::json!({ "type": "abort" });
        let _ = conn.send(&cmd).await;
    }
    let _ = app_handle.emit(
        "orchestration_event",
        serde_json::json!({
            "phase": "failed",
            "planId": serde_json::Value::Null,
            "currentStep": 0,
            "totalSteps": 0,
            "message": "Orchestration cancelled by user",
        }),
    );
    Ok(())
}

/// Respond to a Pi extension UI request.
/// Supports confirm, select, input, editor responses.
#[tauri::command]
async fn respond_ui_request(
    state: tauri::State<'_, AppState>,
    request_id: String,
    response: serde_json::Value,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    // Build response based on what fields are present
    let mut cmd = serde_json::json!({
        "type": "extension_ui_response",
        "id": request_id,
    });

    // Merge all response fields
    if let Some(obj) = cmd.as_object_mut() {
        if let Some(resp_obj) = response.as_object() {
            for (k, v) in resp_obj {
                obj.insert(k.clone(), v.clone());
            }
        }
    }

    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ── Native FS Commands ──────────────────────────────────────

#[tauri::command]
async fn open_workspace(
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<serde_json::Value, String> {
    {
        let mut root = state.workspace_root.lock().await;
        *root = Some(path.clone());
    }

    // Initialize indexer and start background indexing
    let indexer_state = state.indexer.clone();
    let index_path = path.clone();
    let handle = app_handle.clone();
    tokio::spawn(async move {
        match indexer::IndexerState::new(&index_path) {
            Ok(idx) => {
                tracing::info!("Indexer initialized for {}", index_path);

                // Run initial index
                match indexer::index_workspace(&idx, &index_path, Some(&handle)).await {
                    Ok(stats) => {
                        tracing::info!(
                            "Workspace indexed: {} files, {} symbols",
                            stats.file_count,
                            stats.symbol_count
                        );
                        let _ = handle.emit("index_complete", &stats);
                    }
                    Err(e) => tracing::error!("Indexing failed: {}", e),
                }

                // Start file watcher
                if let Err(e) = indexer::start_watcher(&idx, &index_path).await {
                    tracing::warn!("Failed to start index watcher: {}", e);
                }

                let mut guard = indexer_state.lock().await;
                *guard = Some(idx);
            }
            Err(e) => tracing::error!("Failed to initialize indexer: {}", e),
        }
    });

    fs_list_dir(path).await
}

#[tauri::command]
async fn fs_list_dir(path: String) -> Result<serde_json::Value, String> {
    let entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let file_type = if metadata.is_dir() {
            "directory"
        } else if metadata.file_type().is_symlink() {
            "symlink"
        } else {
            "file"
        };

        result.push(serde_json::json!({
            "name": entry.file_name().to_string_lossy(),
            "path": entry.path().to_string_lossy(),
            "type": file_type,
            "size": metadata.len(),
        }));
    }

    // Sort: directories first, then alphabetically
    result.sort_by(|a, b| {
        let a_dir = a["type"] == "directory";
        let b_dir = b["type"] == "directory";
        b_dir
            .cmp(&a_dir)
            .then_with(|| {
                let a_name = a["name"].as_str().unwrap_or("").to_lowercase();
                let b_name = b["name"].as_str().unwrap_or("").to_lowercase();
                a_name.cmp(&b_name)
            })
    });

    Ok(serde_json::Value::Array(result))
}

#[tauri::command]
async fn fs_read_file(path: String) -> Result<serde_json::Value, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let total_lines = content.lines().count();
    let language = detect_language(&path);

    Ok(serde_json::json!({
        "content": content,
        "totalLines": total_lines,
        "language": language,
    }))
}

fn detect_language(path: &str) -> &str {
    match path.rsplit('.').next() {
        Some("rs") => "rust",
        Some("ts" | "tsx") => "typescript",
        Some("js" | "jsx") => "javascript",
        Some("py") => "python",
        Some("json") => "json",
        Some("toml") => "toml",
        Some("yaml" | "yml") => "yaml",
        Some("md") => "markdown",
        Some("css") => "css",
        Some("html") => "html",
        Some("sh" | "bash" | "zsh") => "shell",
        Some("sql") => "sql",
        Some("go") => "go",
        Some("java") => "java",
        Some("c" | "h") => "c",
        Some("cpp" | "hpp" | "cc") => "cpp",
        _ => "plaintext",
    }
}

// ── Search Commands ─────────────────────────────────────────

#[derive(serde::Serialize)]
struct SearchMatch {
    line: usize,
    column: usize,
    length: usize,
    text: String,
}

#[derive(serde::Serialize)]
struct SearchFileResult {
    file: String,
    matches: Vec<SearchMatch>,
}

fn build_regex(query: &str, is_regex: bool, case_sensitive: bool, whole_word: bool) -> Result<regex::Regex, String> {
    let pattern = if is_regex {
        query.to_string()
    } else {
        regex::escape(query)
    };
    let pattern = if whole_word {
        format!(r"\b{}\b", pattern)
    } else {
        pattern
    };
    let builder = regex::RegexBuilder::new(&pattern)
        .case_insensitive(!case_sensitive)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(builder)
}

#[tauri::command]
async fn fs_search(
    state: tauri::State<'_, AppState>,
    query: String,
    is_regex: bool,
    case_sensitive: bool,
    whole_word: bool,
    include_glob: Option<String>,
    exclude_glob: Option<String>,
    max_results: Option<usize>,
) -> Result<serde_json::Value, String> {
    let root = {
        let w = state.workspace_root.lock().await;
        w.clone().ok_or("No workspace open")?
    };
    let query_clone = query.clone();

    tokio::task::spawn_blocking(move || {
        let re = build_regex(&query_clone, is_regex, case_sensitive, whole_word)?;
        let max = max_results.unwrap_or(5000);
        let mut total_matches = 0usize;
        let mut results: Vec<SearchFileResult> = Vec::new();

        let mut walker = ignore::WalkBuilder::new(&root);
        walker.hidden(true).git_ignore(true).git_global(false);

        // Apply include glob
        if let Some(ref inc) = include_glob {
            if !inc.is_empty() {
                let mut overrides = ignore::overrides::OverrideBuilder::new(&root);
                for pat in inc.split(',') {
                    let pat = pat.trim();
                    if !pat.is_empty() {
                        overrides.add(pat).map_err(|e| e.to_string())?;
                    }
                }
                walker.overrides(overrides.build().map_err(|e| e.to_string())?);
            }
        }

        // Apply exclude glob
        if let Some(ref exc) = exclude_glob {
            if !exc.is_empty() {
                let mut overrides = ignore::overrides::OverrideBuilder::new(&root);
                for pat in exc.split(',') {
                    let pat = pat.trim();
                    if !pat.is_empty() {
                        overrides.add(&format!("!{}", pat)).map_err(|e| e.to_string())?;
                    }
                }
                walker.overrides(overrides.build().map_err(|e| e.to_string())?);
            }
        }

        for entry in walker.build().flatten() {
            if total_matches >= max { break; }
            let path = entry.path();
            if !path.is_file() { continue; }

            // Skip binary files
            let content = match std::fs::read_to_string(path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let mut file_matches = Vec::new();
            for (line_idx, line) in content.lines().enumerate() {
                if total_matches >= max { break; }
                for m in re.find_iter(line) {
                    file_matches.push(SearchMatch {
                        line: line_idx + 1,
                        column: m.start() + 1,
                        length: m.len(),
                        text: line.to_string(),
                    });
                    total_matches += 1;
                    if total_matches >= max { break; }
                }
            }

            if !file_matches.is_empty() {
                results.push(SearchFileResult {
                    file: path.to_string_lossy().to_string(),
                    matches: file_matches,
                });
            }
        }

        serde_json::to_value(&results).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn fs_replace_in_file(
    path: String,
    search: String,
    replace: String,
    is_regex: bool,
    case_sensitive: bool,
    whole_word: bool,
) -> Result<usize, String> {
    let re = build_regex(&search, is_regex, case_sensitive, whole_word)?;
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let count = re.find_iter(&content).count();
    let new_content = re.replace_all(&content, replace.as_str()).to_string();
    std::fs::write(&path, new_content).map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
async fn fs_replace_all(
    state: tauri::State<'_, AppState>,
    search: String,
    replace: String,
    is_regex: bool,
    case_sensitive: bool,
    whole_word: bool,
    include_glob: Option<String>,
    exclude_glob: Option<String>,
) -> Result<serde_json::Value, String> {
    let root = {
        let w = state.workspace_root.lock().await;
        w.clone().ok_or("No workspace open")?
    };

    tokio::task::spawn_blocking(move || {
        let re = build_regex(&search, is_regex, case_sensitive, whole_word)?;
        let mut files_changed = 0usize;
        let mut total_replacements = 0usize;

        let mut walker = ignore::WalkBuilder::new(&root);
        walker.hidden(true).git_ignore(true).git_global(false);

        if let Some(ref inc) = include_glob {
            if !inc.is_empty() {
                let mut overrides = ignore::overrides::OverrideBuilder::new(&root);
                for pat in inc.split(',') {
                    let pat = pat.trim();
                    if !pat.is_empty() {
                        overrides.add(pat).map_err(|e| e.to_string())?;
                    }
                }
                walker.overrides(overrides.build().map_err(|e| e.to_string())?);
            }
        }

        if let Some(ref exc) = exclude_glob {
            if !exc.is_empty() {
                let mut overrides = ignore::overrides::OverrideBuilder::new(&root);
                for pat in exc.split(',') {
                    let pat = pat.trim();
                    if !pat.is_empty() {
                        overrides.add(&format!("!{}", pat)).map_err(|e| e.to_string())?;
                    }
                }
                walker.overrides(overrides.build().map_err(|e| e.to_string())?);
            }
        }

        for entry in walker.build().flatten() {
            let path = entry.path();
            if !path.is_file() { continue; }

            let content = match std::fs::read_to_string(path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let count = re.find_iter(&content).count();
            if count > 0 {
                let new_content = re.replace_all(&content, replace.as_str()).to_string();
                if std::fs::write(path, new_content).is_ok() {
                    files_changed += 1;
                    total_replacements += count;
                }
            }
        }

        Ok(serde_json::json!({
            "filesChanged": files_changed,
            "totalReplacements": total_replacements,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── File CRUD Commands ──────────────────────────────────────

#[tauri::command]
async fn fs_create_file(path: String, content: Option<String>) -> Result<(), String> {
    std::fs::write(&path, content.unwrap_or_default()).map_err(|e| e.to_string())
}

#[tauri::command]
async fn fs_write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn fs_create_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn fs_rename(old_path: String, new_path: String) -> Result<(), String> {
    std::fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn fs_delete(path: String) -> Result<(), String> {
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

// ── Keychain Commands ───────────────────────────────────────

#[tauri::command]
async fn keychain_set_key(provider: String, key: String) -> Result<(), String> {
    keychain::set_key(&provider, &key)
}

#[tauri::command]
async fn keychain_get_key(provider: String) -> Result<Option<String>, String> {
    keychain::get_key(&provider)
}

#[tauri::command]
async fn keychain_delete_key(provider: String) -> Result<(), String> {
    keychain::delete_key(&provider)
}

#[tauri::command]
async fn keychain_has_key(provider: String) -> Result<bool, String> {
    Ok(keychain::has_key(&provider))
}

// ── Region Tags Commands ────────────────────────────────────

fn tags_file_path(workspace: &str) -> std::path::PathBuf {
    std::path::PathBuf::from(workspace).join(".tide").join("tags").join("tags.json")
}

#[tauri::command]
async fn tags_load(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_deref().ok_or("No workspace open")?;
    let path = tags_file_path(workspace);
    if !path.exists() {
        return Ok(serde_json::json!([]));
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let tags: serde_json::Value = serde_json::from_str(&content).unwrap_or(serde_json::json!([]));
    Ok(tags)
}

#[tauri::command]
async fn tags_save(
    state: tauri::State<'_, AppState>,
    tags: serde_json::Value,
) -> Result<(), String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_deref().ok_or("No workspace open")?;
    let path = tags_file_path(workspace);
    // Ensure directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&tags).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

// ── Plan Commands ───────────────────────────────────────────

fn plans_dir_path(workspace: &str) -> std::path::PathBuf {
    std::path::PathBuf::from(workspace).join(".tide").join("plans")
}

#[tauri::command]
async fn plans_list(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_deref().ok_or("No workspace open")?;
    let dir = plans_dir_path(workspace);
    if !dir.exists() {
        return Ok(serde_json::json!([]));
    }
    let mut plans = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map_or(false, |e| e == "json") {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(plan) = serde_json::from_str::<serde_json::Value>(&content) {
                    plans.push(plan);
                }
            }
        }
    }
    Ok(serde_json::Value::Array(plans))
}

#[tauri::command]
async fn plan_read(
    state: tauri::State<'_, AppState>,
    slug: String,
) -> Result<serde_json::Value, String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_deref().ok_or("No workspace open")?;
    let path = plans_dir_path(workspace).join(format!("{}.json", slug));
    if !path.exists() {
        return Err(format!("Plan not found: {}", slug));
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let plan: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(plan)
}

#[tauri::command]
async fn plan_delete(
    state: tauri::State<'_, AppState>,
    slug: String,
) -> Result<(), String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_deref().ok_or("No workspace open")?;
    let path = plans_dir_path(workspace).join(format!("{}.json", slug));
    if !path.exists() {
        return Err(format!("Plan not found: {}", slug));
    }
    std::fs::remove_file(&path).map_err(|e| e.to_string())
}

// ── Permission Commands ─────────────────────────────────────

fn permissions_file_path(workspace: &str) -> std::path::PathBuf {
    std::path::PathBuf::from(workspace).join(".tide").join("permissions.json")
}

#[tauri::command]
async fn permissions_load(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_deref().ok_or("No workspace open")?;
    let path = permissions_file_path(workspace);
    if !path.exists() {
        return Ok(serde_json::json!({ "permissions": [], "yoloMode": false }));
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&content)
        .unwrap_or(serde_json::json!({ "permissions": [], "yoloMode": false }));
    Ok(data)
}

#[tauri::command]
async fn permissions_save(
    state: tauri::State<'_, AppState>,
    data: serde_json::Value,
) -> Result<(), String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_deref().ok_or("No workspace open")?;
    let path = permissions_file_path(workspace);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

// ── Skills Discovery ────────────────────────────────────────

#[derive(serde::Serialize)]
struct SkillInfo {
    name: String,
    description: String,
    path: String,
    source: String, // "global", "workspace", or "package"
}

/// Discover Pi skills from all standard locations.
/// Pi looks for SKILL.md files (with frontmatter) in:
/// 1. ~/.pi/agent/skills/ (global user skills)
/// 2. .pi/skills/ (workspace-local skills)
/// 3. Installed packages with skill resources
#[tauri::command]
async fn list_skills(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SkillInfo>, String> {
    let mut skills = Vec::new();

    // 1. Global skills: ~/.pi/agent/skills/
    let global_dir = tide_home_dir().join(".pi").join("agent").join("skills");
    discover_skills_in_dir(&global_dir, "global", &mut skills);

    // 2. Workspace-local skills: .pi/skills/
    let root = state.workspace_root.lock().await;
    if let Some(workspace) = root.as_deref() {
        let ws_dir = std::path::PathBuf::from(workspace).join(".pi").join("skills");
        discover_skills_in_dir(&ws_dir, "workspace", &mut skills);

        // Also check .tide/skills/ (Tide-specific skill location)
        let tide_dir = std::path::PathBuf::from(workspace).join(".tide").join("skills");
        discover_skills_in_dir(&tide_dir, "workspace", &mut skills);
    }

    // 3. Installed packages: ~/.pi/agent/packages/*/skills/
    let packages_dir = tide_home_dir().join(".pi").join("agent").join("packages");
    if packages_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&packages_dir) {
            for entry in entries.flatten() {
                let pkg_skills = entry.path().join("skills");
                if pkg_skills.exists() {
                    let pkg_name = entry.file_name().to_string_lossy().to_string();
                    discover_skills_in_dir(&pkg_skills, &format!("package:{}", pkg_name), &mut skills);
                }
            }
        }
    }

    Ok(skills)
}

fn discover_skills_in_dir(dir: &std::path::Path, source: &str, skills: &mut Vec<SkillInfo>) {
    if !dir.exists() {
        return;
    }

    // Direct .md files in the directory
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("md") {
                if let Some(skill) = parse_skill_file(&path, source) {
                    skills.push(skill);
                }
            } else if path.is_dir() {
                // Check for SKILL.md in subdirectory
                let skill_md = path.join("SKILL.md");
                if skill_md.exists() {
                    if let Some(skill) = parse_skill_file(&skill_md, source) {
                        skills.push(skill);
                    }
                }
            }
        }
    }
}

fn parse_skill_file(path: &std::path::Path, source: &str) -> Option<SkillInfo> {
    let content = std::fs::read_to_string(path).ok()?;

    // Parse YAML frontmatter (between --- delimiters)
    let mut name = path
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.file_stem().unwrap_or_default().to_string_lossy().to_string());
    let mut description = String::new();

    if content.starts_with("---") {
        if let Some(end) = content[3..].find("---") {
            let frontmatter = &content[3..3 + end];
            for line in frontmatter.lines() {
                let line = line.trim();
                if let Some(val) = line.strip_prefix("name:") {
                    let val = val.trim().trim_matches('"').trim_matches('\'');
                    if !val.is_empty() {
                        name = val.to_string();
                    }
                } else if let Some(val) = line.strip_prefix("description:") {
                    description = val.trim().trim_matches('"').trim_matches('\'').to_string();
                }
            }
        }
    }

    // If no description from frontmatter, use first non-empty line after frontmatter
    if description.is_empty() {
        let body = if content.starts_with("---") {
            content[3..].find("---").map(|end| &content[6 + end..]).unwrap_or(&content)
        } else {
            &content
        };
        for line in body.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() && !trimmed.starts_with('#') {
                description = trimmed.chars().take(200).collect();
                break;
            }
        }
    }

    Some(SkillInfo {
        name,
        description,
        path: path.to_string_lossy().to_string(),
        source: source.to_string(),
    })
}

/// Install or remove a Pi skill/package via `pi install <source>` or `pi remove <source>`.
#[tauri::command]
async fn manage_skill(
    action: String,
    source: String,
) -> Result<String, String> {
    let pi_path = sidecar::resolve_pi_path().map_err(|e| format!("Cannot find Pi binary: {}", e))?;

    let args = match action.as_str() {
        "install" => vec!["install".to_string(), source],
        "remove" => vec!["remove".to_string(), source],
        _ => return Err(format!("Unknown action: {}", action)),
    };

    let output = std::process::Command::new(&pi_path)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run pi {}: {}", action, e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout.trim().to_string())
    } else {
        Err(format!("{}\n{}", stdout.trim(), stderr.trim()))
    }
}

// ── Git Commands ────────────────────────────────────────────

#[tauri::command]
async fn git_status(
    state: tauri::State<'_, AppState>,
) -> Result<git::GitStatusInfo, String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_deref().ok_or("No workspace open")?;
    git::get_status(workspace)
}

#[tauri::command]
async fn git_changed_files(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<git::ChangedFile>, String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_deref().ok_or("No workspace open")?;
    git::list_changed_files(workspace)
}

// ── App Setup ───────────────────────────────────────────────

fn resolve_extension_paths() -> Vec<String> {
    let mut paths = Vec::new();

    // Extension base names (without file extension)
    let ext_names = [
        "tide-safety", "tide-project", "tide-session", "tide-router",
        "tide-planner", "tide-index", "tide-web-search", "tide-auth",
    ];

    // 1. Production: bundled pre-transpiled .js extensions in Resources/pi-extensions/
    if let Ok(exe) = std::env::current_exe() {
        if let Some(app_dir) = exe.parent() {
            let resources = app_dir.join("../Resources/pi-extensions");
            if resources.is_dir() {
                for name in &ext_names {
                    let p = resources.join(format!("{}.js", name));
                    if p.exists() {
                        if let Ok(abs) = p.canonicalize() {
                            paths.push(abs.to_string_lossy().to_string());
                        }
                    }
                }
                if !paths.is_empty() {
                    tracing::info!("Resolved {} bundled extensions from {:?}", paths.len(), resources);
                    return paths;
                }
            }
        }
    }

    // 2. Dev mode: .ts source files from pi-extensions/ directory
    let mut search_dirs: Vec<std::path::PathBuf> = vec![];
    if let Ok(cwd) = std::env::current_dir() {
        search_dirs.push(cwd.join("pi-extensions"));           // from apps/desktop/
        search_dirs.push(cwd.join("../pi-extensions"));        // from apps/desktop/src-tauri/
        search_dirs.push(cwd.join("apps/desktop/pi-extensions")); // from project root
    }

    for dir in &search_dirs {
        for name in &ext_names {
            let p = dir.join(format!("{}.ts", name));
            if p.exists() {
                if let Ok(abs) = p.canonicalize() {
                    paths.push(abs.to_string_lossy().to_string());
                }
            }
        }
    }

    // Deduplicate (canonicalize may produce same absolute path)
    paths.sort();
    paths.dedup();
    paths
}

// ── CLI Integration ──────────────────────────────────────────

/// Get the workspace path passed via CLI args (e.g. `tide /path/to/project`).
/// Returns None if no path arg was provided or the app was launched normally.
#[tauri::command]
fn get_launch_path() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    tracing::debug!("get_launch_path: raw args = {:?}", args);
    tracing::debug!(
        "get_launch_path: TIDE_LAUNCH_DIR = {:?}",
        std::env::var("TIDE_LAUNCH_DIR").ok()
    );
    // Skip the binary name (args[0]). Look for the first arg that looks like a path
    // (not a flag starting with -). Tauri may add its own args, so skip those too.
    for arg in args.iter().skip(1) {
        if arg.starts_with('-') {
            continue;
        }
        // Resolve to absolute path
        let path = std::path::PathBuf::from(arg);
        let abs = if path.is_absolute() {
            path
        } else {
            // Use TIDE_LAUNCH_DIR if set (our CLI script sets this),
            // otherwise fall back to current_dir
            let base = std::env::var("TIDE_LAUNCH_DIR")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
            base.join(path)
        };
        tracing::debug!("get_launch_path: candidate = {:?}, is_dir = {}", abs, abs.is_dir());
        if abs.is_dir() {
            return Some(abs.to_string_lossy().to_string());
        }
    }
    tracing::debug!("get_launch_path: no valid path found");
    None
}

// ── OAuth / Subscription Auth ────────────────────────────────────

/// Read Pi's auth.json to get OAuth provider status.
/// Returns a JSON array of { provider, hasCredentials }.
#[tauri::command]
fn oauth_list_providers() -> Result<serde_json::Value, String> {
    let auth_path = tide_home_dir().join(".pi/agent/auth.json");

    if !auth_path.exists() {
        // No auth file = no OAuth credentials anywhere
        return Ok(serde_json::json!([]));
    }

    let content = std::fs::read_to_string(&auth_path)
        .map_err(|e| format!("Failed to read auth.json: {}", e))?;
    let data: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse auth.json: {}", e))?;

    // auth.json stores credentials keyed by provider name.
    // Each entry has "type": "oauth" with refresh/access tokens at top level,
    // or "type": "api_key" with an apiKey field.
    let mut providers = Vec::new();
    if let Some(obj) = data.as_object() {
        for (key, value) in obj {
            let auth_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let has_oauth = auth_type == "oauth"
                || value.get("refresh").is_some()
                || value.get("oauth").is_some();
            let has_api_key = auth_type == "api_key"
                || value.get("apiKey").is_some()
                || value.get("api_key").is_some();
            if has_oauth || has_api_key {
                providers.push(serde_json::json!({
                    "provider": key,
                    "authType": if has_oauth { "oauth" } else { "api_key" },
                    "hasCredentials": true,
                }));
            }
        }
    }

    Ok(serde_json::json!(providers))
}

/// Remove OAuth credentials for a provider from Pi's auth.json.
#[tauri::command]
fn oauth_logout(provider: String) -> Result<String, String> {
    let auth_path = tide_home_dir().join(".pi/agent/auth.json");

    if !auth_path.exists() {
        return Ok("No credentials to remove.".to_string());
    }

    let content = std::fs::read_to_string(&auth_path)
        .map_err(|e| format!("Failed to read auth.json: {}", e))?;
    let mut data: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse auth.json: {}", e))?;

    if let Some(obj) = data.as_object_mut() {
        if obj.remove(&provider).is_some() {
            let updated = serde_json::to_string_pretty(&data)
                .map_err(|e| format!("Failed to serialize auth.json: {}", e))?;
            std::fs::write(&auth_path, updated)
                .map_err(|e| format!("Failed to write auth.json: {}", e))?;
            return Ok(format!("Logged out from {}.", provider));
        }
    }

    Ok(format!("No credentials found for {}.", provider))
}

/// Install the `tide` CLI command to /usr/local/bin.
/// Uses tokio + osascript to prompt for admin privileges on macOS.
#[cfg(target_os = "macos")]
#[tauri::command]
async fn install_cli(app_handle: tauri::AppHandle) -> Result<String, String> {
    let cli_content = r#"#!/bin/bash
# Tide CLI — open folders in Tide IDE
# Installed by Tide > Settings > Install CLI

if [ -z "$1" ]; then
  open -a Tide
else
  # Resolve to absolute path
  TARGET=$(cd "$1" 2>/dev/null && pwd || echo "$1")
  # Pass the launch dir so the app can resolve relative paths
  TIDE_LAUNCH_DIR="$(pwd)" open -a Tide --args "$TARGET"
fi
"#;

    let cli_path = "/usr/local/bin/tide";

    // Try writing directly first (works if user owns /usr/local/bin)
    if std::fs::write(cli_path, cli_content).is_ok() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = std::fs::Permissions::from_mode(0o755);
            let _ = std::fs::set_permissions(cli_path, perms);
        }
        let _ = app_handle;
        return Ok("CLI installed! You can now use `tide .` or `tide /path/to/project` from any terminal.".to_string());
    }

    // Write the CLI script to a temp file, then use osascript to copy it
    // with admin privileges (shows native macOS password dialog).
    let tmp_cli = std::env::temp_dir().join("tide-cli-install.tmp");
    std::fs::write(&tmp_cli, cli_content)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    let shell_cmd = format!(
        "mkdir -p /usr/local/bin && cp '{}' /usr/local/bin/tide && chmod +x /usr/local/bin/tide && rm -f '{}'",
        tmp_cli.display(),
        tmp_cli.display()
    );
    let apple_script = format!(
        r#"do shell script "{}" with administrator privileges"#,
        shell_cmd.replace('\\', "\\\\").replace('"', "\\\"")
    );

    // Run osascript in a blocking thread with explicit /dev/null for stdio.
    // Tauri's async runtime corrupts inherited file descriptors, so we open
    // /dev/null explicitly and assign it to stdin/stdout/stderr.
    let scpt = apple_script.clone();
    let result = tokio::task::spawn_blocking(move || {
        use std::fs::File;
        let dev_null_in = File::open("/dev/null").map_err(|e| format!("open /dev/null: {}", e))?;
        let dev_null_out = File::create("/dev/null").map_err(|e| format!("create /dev/null: {}", e))?;
        let dev_null_err = File::create("/dev/null").map_err(|e| format!("create /dev/null: {}", e))?;

        std::process::Command::new("/usr/bin/osascript")
            .args(["-e", &scpt])
            .stdin(dev_null_in)
            .stdout(dev_null_out)
            .stderr(dev_null_err)
            .status()
            .map_err(|e| format!("Failed to launch osascript: {}", e))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(|e| {
        let _ = std::fs::remove_file(&tmp_cli);
        e
    })?;

    let _ = std::fs::remove_file(&tmp_cli);

    if result.success() {
        Ok("CLI installed! You can now use `tide .` or `tide /path/to/project` from any terminal.".to_string())
    } else {
        // Exit code 1 with osascript typically means user cancelled the dialog
        let code = result.code().unwrap_or(-1);
        if code == 1 {
            Err("Installation cancelled.".to_string())
        } else {
            Err(format!("Installation failed (exit code {}).", code))
        }
    }
}

/// Install the `tide` CLI command to /usr/local/bin on Linux.
/// Uses pkexec (Polkit) to prompt for admin privileges if needed.
#[cfg(target_os = "linux")]
#[tauri::command]
async fn install_cli(app_handle: tauri::AppHandle) -> Result<String, String> {
    // Resolve the path to the running Tide binary so the CLI script can launch it.
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to locate Tide executable: {}", e))?;
    let exe = exe_path.to_string_lossy();

    let cli_content = format!(
        r#"#!/bin/bash
# Tide CLI — open folders in Tide IDE
# Installed by Tide > Settings > Install CLI

if [ -z "$1" ]; then
  "{exe}" &
else
  # Resolve to absolute path
  TARGET=$(cd "$1" 2>/dev/null && pwd || echo "$1")
  # Pass the launch dir so the app can resolve relative paths
  TIDE_LAUNCH_DIR="$(pwd)" "{exe}" "$TARGET" &
fi
"#,
        exe = exe,
    );

    let cli_path = "/usr/local/bin/tide";

    // Try writing directly first (works if user owns /usr/local/bin)
    if std::fs::write(cli_path, &cli_content).is_ok() {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        let _ = std::fs::set_permissions(cli_path, perms);
        let _ = app_handle;
        return Ok(
            "CLI installed! You can now use `tide .` or `tide /path/to/project` from any terminal."
                .to_string(),
        );
    }

    // Write the CLI script to a temp file, then use pkexec to copy it
    // with admin privileges (shows native Polkit password dialog).
    let tmp_cli = std::env::temp_dir().join("tide-cli-install.tmp");
    std::fs::write(&tmp_cli, &cli_content)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    let shell_cmd = format!(
        "mkdir -p /usr/local/bin && cp '{}' /usr/local/bin/tide && chmod +x /usr/local/bin/tide && rm -f '{}'",
        tmp_cli.display(),
        tmp_cli.display()
    );

    let result = tokio::task::spawn_blocking(move || {
        use std::fs::File;
        let dev_null_in =
            File::open("/dev/null").map_err(|e| format!("open /dev/null: {}", e))?;
        let dev_null_out =
            File::create("/dev/null").map_err(|e| format!("create /dev/null: {}", e))?;
        let dev_null_err =
            File::create("/dev/null").map_err(|e| format!("create /dev/null: {}", e))?;

        std::process::Command::new("pkexec")
            .args(["bash", "-c", &shell_cmd])
            .stdin(dev_null_in)
            .stdout(dev_null_out)
            .stderr(dev_null_err)
            .status()
            .map_err(|e| format!("Failed to launch pkexec: {}", e))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
    .map_err(|e| {
        let _ = std::fs::remove_file(&tmp_cli);
        e
    })?;

    let _ = std::fs::remove_file(&tmp_cli);

    if result.success() {
        Ok(
            "CLI installed! You can now use `tide .` or `tide /path/to/project` from any terminal."
                .to_string(),
        )
    } else {
        let code = result.code().unwrap_or(-1);
        if code == 126 {
            // pkexec returns 126 when the user dismisses the auth dialog
            Err("Installation cancelled.".to_string())
        } else {
            Err(format!("Installation failed (exit code {}).", code))
        }
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
async fn install_cli() -> Result<String, String> {
    // Find the directory containing the running Tide executable.
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to locate Tide executable: {}", e))?;
    let exe_dir = exe_path
        .parent()
        .ok_or("Failed to determine executable directory")?;
    let exe_name = exe_path
        .file_name()
        .ok_or("Failed to determine executable name")?
        .to_string_lossy();

    // Create tide.cmd batch script next to the executable.
    let cmd_path = exe_dir.join("tide.cmd");
    let cmd_content = format!(
        r#"@echo off
rem Tide CLI — open folders in Tide IDE
rem Installed by Tide > Settings > Install CLI

set "TIDE_LAUNCH_DIR=%CD%"

if "%~1"=="" (
    "{exe_dir}\{exe_name}"
) else (
    "{exe_dir}\{exe_name}" "%~f1"
)
"#,
        exe_dir = exe_dir.to_string_lossy().replace('/', "\\"),
        exe_name = exe_name,
    );

    std::fs::write(&cmd_path, &cmd_content)
        .map_err(|e| format!("Failed to write tide.cmd: {}", e))?;

    // Add the exe directory to the user's PATH if not already present.
    let exe_dir_str = exe_dir.to_string_lossy().to_string();
    let path_updated = add_to_user_path(&exe_dir_str)?;

    if path_updated {
        // Broadcast WM_SETTINGCHANGE so running shells pick up the new PATH.
        broadcast_environment_change();
        Ok(format!(
            "CLI installed! Added {} to your PATH.\n\
             Open a new terminal and use `tide .` or `tide C:\\path\\to\\project`.",
            exe_dir_str
        ))
    } else {
        Ok("CLI installed! You can now use `tide .` or `tide C:\\path\\to\\project` from any terminal.".to_string())
    }
}

/// Add `dir` to the user-level PATH (HKCU\\Environment) if not already present.
#[cfg(target_os = "windows")]
fn add_to_user_path(dir: &str) -> Result<bool, String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let env = hkcu
        .open_subkey_with_flags("Environment", KEY_READ | KEY_WRITE)
        .map_err(|e| format!("Failed to open registry: {}", e))?;

    // Read the current user PATH (may not exist yet).
    let current_path: String = env.get_value("Path").unwrap_or_default();

    // Check if the directory is already in PATH (case-insensitive).
    let dir_lower = dir.to_lowercase();
    let already_present = current_path
        .split(';')
        .any(|entry| entry.trim().to_lowercase().trim_end_matches('\\') == dir_lower.trim_end_matches('\\'));

    if already_present {
        return Ok(false);
    }

    // Append our directory.
    let new_path = if current_path.is_empty() {
        dir.to_string()
    } else {
        format!("{};{}", current_path.trim_end_matches(';'), dir)
    };

    // Write as REG_EXPAND_SZ so %VAR% references in existing entries are preserved.
    env.set_raw_value(
        "Path",
        &winreg::RegValue {
            vtype: REG_EXPAND_SZ,
            bytes: {
                let wide: Vec<u16> = new_path.encode_utf16().chain(std::iter::once(0)).collect();
                wide.iter().flat_map(|w| w.to_le_bytes()).collect()
            },
        },
    )
    .map_err(|e| format!("Failed to update PATH: {}", e))?;

    Ok(true)
}

/// Broadcast WM_SETTINGCHANGE so Explorer and new shells pick up the PATH change.
#[cfg(target_os = "windows")]
fn broadcast_environment_change() {
    use std::ffi::CString;
    // Use raw Win32 API via windows-sys or manual FFI.
    #[link(name = "user32")]
    extern "system" {
        fn SendMessageTimeoutA(
            hwnd: isize,
            msg: u32,
            wparam: usize,
            lparam: *const i8,
            flags: u32,
            timeout: u32,
            result: *mut usize,
        ) -> isize;
    }
    const HWND_BROADCAST: isize = 0xFFFF_u16 as isize;
    const WM_SETTINGCHANGE: u32 = 0x001A;
    const SMTO_ABORTIFHUNG: u32 = 0x0002;
    if let Ok(env) = CString::new("Environment") {
        unsafe {
            let mut result: usize = 0;
            SendMessageTimeoutA(
                HWND_BROADCAST,
                WM_SETTINGCHANGE,
                0,
                env.as_ptr(),
                SMTO_ABORTIFHUNG,
                5000,
                &mut result,
            );
        }
    }
}

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "tide_desktop=debug".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            pi: Arc::new(Mutex::new(None)),
            workspace_root: Arc::new(Mutex::new(None)),
            _pi_child: Arc::new(Mutex::new(None)),
            indexer: Arc::new(Mutex::new(None)),
            agent_end_notify: Arc::new(Notify::new()),
            pty_manager: StdMutex::new(pty::PtyManager::new()),
            orc_cancel: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            orc_active: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        })
        .setup(|app| {
            let pi_state = app.state::<AppState>().inner().pi.clone();
            let child_state = app.state::<AppState>().inner()._pi_child.clone();
            let agent_end_notify = app.state::<AppState>().inner().agent_end_notify.clone();
            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                let extensions = resolve_extension_paths();
                tracing::info!("Pi extensions: {:?}", extensions);

                // Use current directory as initial workspace (before user opens a folder)
                let initial_cwd = std::env::current_dir()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| ".".to_string());

                match sidecar::start_pi(&initial_cwd, &extensions).await {
                    Ok((conn, child)) => {
                        tracing::info!("Pi agent started successfully");

                        // Background task: read Pi events, emit to React
                        let event_rx = conn.event_rx.clone();
                        let pending = conn.pending.clone();
                        let handle = app_handle.clone();
                        let agent_notify = agent_end_notify.clone();
                        tokio::spawn(async move {
                            let mut rx = event_rx.lock().await;
                            loop {
                                match rx.recv().await {
                                    Some(event) => {
                                        let event_type = event
                                            .get("type")
                                            .and_then(|t| t.as_str())
                                            .unwrap_or("unknown");

                                        // Log model-related events for debugging router sync
                                        if event_type == "model_select" || event_type.contains("model") {
                                            tracing::debug!("Forwarding model event: {} — {}", event_type,
                                                serde_json::to_string(&event).unwrap_or_default().chars().take(200).collect::<String>());
                                        }

                                        // Route response events to pending request waiters
                                        if event_type == "response" {
                                            if let Some(id) = event.get("id").and_then(|v| v.as_str()) {
                                                let mut map = pending.lock().await;
                                                if let Some(sender) = map.remove(id) {
                                                    let _ = sender.send(event.clone());
                                                }
                                            }
                                        }

                                        // Emit all Pi events as "pi_event"
                                        if let Err(e) = handle.emit("pi_event", &event) {
                                            tracing::error!(
                                                "Failed to emit pi_event ({}): {}",
                                                event_type,
                                                e
                                            );
                                        }

                                        // Also emit typed events for specific handlers
                                        if event_type == "extension_ui_request" {
                                            let _ = handle.emit("pi_ui_request", &event);
                                        }

                                        // Signal orchestrator when agent completes
                                        if event_type == "agent_end" {
                                            agent_notify.notify_waiters();
                                        }
                                    }
                                    None => {
                                        tracing::info!("Pi event channel closed");
                                        break;
                                    }
                                }
                            }
                        });

                        let mut pi = pi_state.lock().await;
                        *pi = Some(conn);
                        let mut child_guard = child_state.lock().await;
                        *child_guard = Some(child);

                        // Notify frontend that Pi is ready
                        let _ = app_handle.emit("pi_ready", ());
                        tracing::info!("Emitted pi_ready event");
                    }
                    Err(e) => {
                        tracing::error!("Failed to start Pi agent: {}", e);
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_prompt,
            abort_agent,
            restart_pi,
            get_pi_status,
            get_pi_state,
            respond_ui_request,
            orchestrate,
            cancel_orchestration,
            open_workspace,
            fs_list_dir,
            fs_read_file,
            fs_create_file,
            fs_write_file,
            fs_create_dir,
            fs_rename,
            fs_delete,
            fs_search,
            fs_replace_in_file,
            fs_replace_all,
            keychain_set_key,
            keychain_get_key,
            keychain_delete_key,
            keychain_has_key,
            list_skills,
            manage_skill,
            git_status,
            git_changed_files,
            tags_load,
            tags_save,
            set_pi_model,
            get_available_models,
            set_thinking_level,
            get_session_stats,
            compact_context,
            list_sessions,
            new_session,
            get_messages,
            steer_agent,
            follow_up,
            switch_session,
            delete_session,
            fork_session,
            set_session_name,
            export_session_html,
            read_router_config,
            write_router_config,
            read_orchestrator_config,
            write_orchestrator_config,
            set_auto_compaction,
            set_auto_retry,
            get_commands,
            pi_bash,
            abort_bash,
            abort_retry,
            get_last_assistant_text,
            permissions_load,
            permissions_save,
            plans_list,
            plan_read,
            plan_delete,
            indexer::index_workspace_cmd,
            indexer::index_file_tree,
            indexer::index_file_outline,
            indexer::index_get_symbol,
            indexer::index_search_symbols,
            indexer::index_repo_outline,
            indexer::index_status,
            indexer::index_invalidate,
            pty::pty_create,
            pty::pty_attach,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            get_launch_path,
            install_cli,
            oauth_list_providers,
            oauth_logout,
            get_version_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tide");
}
