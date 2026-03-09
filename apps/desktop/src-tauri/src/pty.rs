use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use tauri::Emitter;

pub struct PtyInstance {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    _child: Box<dyn portable_pty::Child + Send + Sync>,
    reader: Option<Box<dyn Read + Send>>,
}

pub struct PtyManager {
    instances: HashMap<String, PtyInstance>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            instances: HashMap::new(),
        }
    }
}

#[derive(Clone, serde::Serialize)]
struct PtyOutputPayload {
    #[serde(rename = "ptyId")]
    pty_id: String,
    data: String,
}

#[derive(Clone, serde::Serialize)]
struct PtyExitPayload {
    #[serde(rename = "ptyId")]
    pty_id: String,
}

/// Create a PTY and spawn a shell, but do NOT start the read thread yet.
/// The frontend should call `pty_attach` after setting up event listeners.
#[tauri::command]
pub fn pty_create(
    state: tauri::State<'_, crate::AppState>,
    cwd: Option<String>,
) -> Result<String, String> {
    let pty_system = native_pty_system();
    let pty_id = uuid::Uuid::new_v4().to_string();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    #[cfg(unix)]
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    #[cfg(windows)]
    let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.env("TERM", "xterm-256color");
    if let Some(ref dir) = cwd {
        cmd.cwd(dir);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    drop(pair.slave);

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

    let instance = PtyInstance {
        writer,
        master: pair.master,
        _child: child,
        reader: Some(reader),
    };

    state
        .pty_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?
        .instances
        .insert(pty_id.clone(), instance);

    Ok(pty_id)
}

/// Start the read thread for an existing PTY. Call this after event listeners are set up.
#[tauri::command]
pub fn pty_attach(
    state: tauri::State<'_, crate::AppState>,
    app: tauri::AppHandle,
    pty_id: String,
) -> Result<(), String> {
    let mut mgr = state
        .pty_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    let instance = mgr
        .instances
        .get_mut(&pty_id)
        .ok_or("PTY not found")?;
    // If reader is already taken, the read thread is already running (e.g. React
    // StrictMode double-mount in dev). Silently succeed.
    let mut reader = match instance.reader.take() {
        Some(r) => r,
        None => return Ok(()),
    };

    let read_id = pty_id.clone();
    let read_app = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = read_app.emit(
                        "pty_output",
                        PtyOutputPayload {
                            pty_id: read_id.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        let _ = read_app.emit(
            "pty_exit",
            PtyExitPayload {
                pty_id: read_id.clone(),
            },
        );
    });

    Ok(())
}

#[tauri::command]
pub fn pty_write(
    state: tauri::State<'_, crate::AppState>,
    pty_id: String,
    data: String,
) -> Result<(), String> {
    let mut mgr = state
        .pty_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    let instance = mgr
        .instances
        .get_mut(&pty_id)
        .ok_or("PTY not found")?;
    instance
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Write error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn pty_resize(
    state: tauri::State<'_, crate::AppState>,
    pty_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mgr = state
        .pty_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    let instance = mgr.instances.get(&pty_id).ok_or("PTY not found")?;
    instance
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Resize error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn pty_kill(
    state: tauri::State<'_, crate::AppState>,
    pty_id: String,
) -> Result<(), String> {
    let mut mgr = state
        .pty_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    if let Some(mut instance) = mgr.instances.remove(&pty_id) {
        let _ = instance._child.kill();
    }
    Ok(())
}
