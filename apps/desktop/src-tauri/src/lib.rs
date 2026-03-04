mod git;
mod ipc;
mod keychain;
mod sidecar;

use ipc::PiConnection;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

pub struct AppState {
    pub pi: Arc<Mutex<Option<PiConnection>>>,
    pub workspace_root: Arc<Mutex<Option<String>>>,
    pub _pi_child: Arc<Mutex<Option<tokio::process::Child>>>,
}

// ── Pi Agent Commands ───────────────────────────────────────

/// Send a prompt to Pi. Response streams back as Tauri events.
#[tauri::command]
async fn send_prompt(
    state: tauri::State<'_, AppState>,
    text: String,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({
        "type": "prompt",
        "message": text,
    });

    conn.send(&cmd).await.map_err(|e| e.to_string())?;
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
    // Kill existing Pi process
    {
        let mut child_guard = state._pi_child.lock().await;
        if let Some(mut child) = child_guard.take() {
            let _ = child.kill().await;
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
            tokio::spawn(async move {
                let mut rx = event_rx.lock().await;
                loop {
                    match rx.recv().await {
                        Some(event) => {
                            let event_type = event
                                .get("type")
                                .and_then(|t| t.as_str())
                                .unwrap_or("unknown");
                            if let Err(e) = handle.emit("pi_event", &event) {
                                tracing::error!("Failed to emit pi_event ({}): {}", event_type, e);
                            }
                            if event_type == "extension_ui_request" {
                                let _ = handle.emit("pi_ui_request", &event);
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

/// Respond to a Pi extension UI request (approval dialog, etc.).
#[tauri::command]
async fn respond_ui_request(
    state: tauri::State<'_, AppState>,
    request_id: String,
    confirmed: bool,
) -> Result<(), String> {
    let pi_guard = state.pi.lock().await;
    let conn = pi_guard.as_ref().ok_or("Pi not connected")?;

    let cmd = serde_json::json!({
        "type": "extension_ui_response",
        "id": request_id,
        "confirmed": confirmed,
    });

    conn.send(&cmd).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ── Native FS Commands ──────────────────────────────────────

#[tauri::command]
async fn open_workspace(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<serde_json::Value, String> {
    {
        let mut root = state.workspace_root.lock().await;
        *root = Some(path.clone());
    }
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

// ── Git Commands ────────────────────────────────────────────

#[tauri::command]
async fn git_status(
    state: tauri::State<'_, AppState>,
) -> Result<git::GitStatusInfo, String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_deref().ok_or("No workspace open")?;
    git::get_status(workspace)
}

// ── App Setup ───────────────────────────────────────────────

fn resolve_extension_paths() -> Vec<String> {
    let mut paths = Vec::new();
    let candidates = [
        "pi-extensions/tide-safety.ts",
        "pi-extensions/tide-project.ts",
        "apps/desktop/pi-extensions/tide-safety.ts",
        "../../apps/desktop/pi-extensions/tide-safety.ts",
        "../../apps/desktop/pi-extensions/tide-project.ts",
    ];
    for candidate in &candidates {
        let p = std::path::PathBuf::from(candidate);
        if p.exists() {
            if let Ok(abs) = p.canonicalize() {
                paths.push(abs.to_string_lossy().to_string());
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
        })
        .setup(|app| {
            let pi_state = app.state::<AppState>().inner().pi.clone();
            let child_state = app.state::<AppState>().inner()._pi_child.clone();
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
                        tokio::spawn(async move {
                            let mut rx = event_rx.lock().await;
                            loop {
                                match rx.recv().await {
                                    Some(event) => {
                                        let event_type = event
                                            .get("type")
                                            .and_then(|t| t.as_str())
                                            .unwrap_or("unknown");

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
            open_workspace,
            fs_list_dir,
            fs_read_file,
            keychain_set_key,
            keychain_get_key,
            keychain_delete_key,
            keychain_has_key,
            git_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tide");
}
