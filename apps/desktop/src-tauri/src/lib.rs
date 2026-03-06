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

pub struct AppState {
    pub pi: Arc<Mutex<Option<PiConnection>>>,
    pub workspace_root: Arc<Mutex<Option<String>>>,
    pub _pi_child: Arc<Mutex<Option<tokio::process::Child>>>,
    pub indexer: Arc<Mutex<Option<indexer::IndexerState>>>,
    pub agent_end_notify: Arc<Notify>,
    pub pty_manager: StdMutex<pty::PtyManager>,
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
#[tauri::command]
async fn set_pi_model(
    state: tauri::State<'_, AppState>,
    provider: String,
    model_id: String,
) -> Result<(), String> {
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
#[tauri::command]
async fn compact_context(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({ "type": "compact" });
    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
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
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let sessions_root = std::path::PathBuf::from(&home).join(".pi").join("agent").join("sessions");

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

/// Write the router config to .tide/router-config.json in the workspace.
#[tauri::command]
async fn write_router_config(
    state: tauri::State<'_, AppState>,
    enabled: bool,
    auto_switch: bool,
) -> Result<(), String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_ref().ok_or("No workspace open")?;

    let tide_dir = std::path::PathBuf::from(workspace).join(".tide");
    if !tide_dir.exists() {
        std::fs::create_dir_all(&tide_dir).map_err(|e| e.to_string())?;
    }

    let config_path = tide_dir.join("router-config.json");
    let config = serde_json::json!({ "enabled": enabled, "autoSwitch": auto_switch });
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
    let handle = app_handle.clone();

    tokio::spawn(async move {
        let orc = orchestrator::Orchestrator::new(workspace);
        if let Err(e) = orc.run(prompt, pi_handle, handle.clone(), notify).await {
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
    let ext_files = ["tide-safety.ts", "tide-project.ts", "tide-router.ts", "tide-planner.ts", "tide-index.ts"];

    // Try multiple base directories (cwd varies between tauri dev and built app)
    let mut search_dirs: Vec<std::path::PathBuf> = vec![];
    if let Ok(cwd) = std::env::current_dir() {
        search_dirs.push(cwd.join("pi-extensions"));           // from apps/desktop/
        search_dirs.push(cwd.join("../pi-extensions"));        // from apps/desktop/src-tauri/
        search_dirs.push(cwd.join("apps/desktop/pi-extensions")); // from project root
    }

    for dir in &search_dirs {
        for file in &ext_files {
            let p = dir.join(file);
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
        .manage(AppState {
            pi: Arc::new(Mutex::new(None)),
            workspace_root: Arc::new(Mutex::new(None)),
            _pi_child: Arc::new(Mutex::new(None)),
            indexer: Arc::new(Mutex::new(None)),
            agent_end_notify: Arc::new(Notify::new()),
            pty_manager: StdMutex::new(pty::PtyManager::new()),
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
            open_workspace,
            fs_list_dir,
            fs_read_file,
            fs_create_file,
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
            write_router_config,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tide");
}
