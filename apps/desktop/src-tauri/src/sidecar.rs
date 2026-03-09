use crate::ipc::PiConnection;
use crate::keychain;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

/// Provider name (Pi CLI) → (keychain key, env var name)
const PROVIDER_KEYS: &[(&str, &str, &str)] = &[
    ("anthropic", "anthropic", "ANTHROPIC_API_KEY"),
    ("openai",    "openai",    "OPENAI_API_KEY"),
    ("google",    "google",    "GEMINI_API_KEY"),
];

/// Additional service keys injected as env vars (not LLM providers).
const SERVICE_KEYS: &[(&str, &str)] = &[
    ("tavily", "TAVILY_API_KEY"),
];

/// Inject API keys from the macOS Keychain as environment variables.
/// Returns the name of the first provider that has a key configured.
fn inject_api_keys(cmd: &mut Command) -> Option<&'static str> {
    let mut first_provider = None;

    for (provider, keychain_name, env_var) in PROVIDER_KEYS {
        if let Ok(Some(key)) = keychain::get_key(keychain_name) {
            tracing::info!("Injecting {} from Keychain", env_var);
            cmd.env(env_var, key);
            if first_provider.is_none() {
                first_provider = Some(*provider);
            }
        }
    }

    first_provider
}

/// Inject service API keys (non-provider) from the macOS Keychain as environment variables.
fn inject_service_keys(cmd: &mut Command) {
    for (keychain_name, env_var) in SERVICE_KEYS {
        if let Ok(Some(key)) = keychain::get_key(keychain_name) {
            tracing::info!("Injecting {} from Keychain", env_var);
            cmd.env(env_var, key);
        }
    }
}

/// Start the Pi agent in RPC mode and return a PiConnection + child handle.
pub async fn start_pi(
    workspace_root: &str,
    extensions: &[String],
) -> Result<(PiConnection, Child), Box<dyn std::error::Error + Send + Sync>> {
    let pi_path = resolve_pi_path()?;
    tracing::info!("Starting Pi: {} --mode rpc (cwd: {})", pi_path, workspace_root);

    let mut cmd = Command::new(&pi_path);
    cmd.arg("--mode").arg("rpc");
    cmd.arg("-c"); // Continue last session (restores chat history)

    for ext in extensions {
        cmd.arg("-e").arg(ext);
    }

    // Inject service keys (non-provider keys like Tavily)
    inject_service_keys(&mut cmd);

    // Inject API keys from Keychain as env vars and auto-detect provider
    if let Some(provider) = inject_api_keys(&mut cmd) {
        tracing::info!("Auto-detected provider from Keychain: {}", provider);
        cmd.arg("--provider").arg(provider);
    }

    cmd.current_dir(workspace_root);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.kill_on_drop(true);

    let mut child = cmd.spawn()?;

    let stdin = child.stdin.take().ok_or("Failed to capture Pi stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to capture Pi stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture Pi stderr")?;

    // Log Pi's stderr in the background
    let stderr_reader = BufReader::new(stderr);
    tokio::spawn(async move {
        let mut lines = stderr_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            tracing::debug!("[pi:stderr] {}", line);
        }
    });

    let conn = PiConnection::new(stdin, stdout);

    tracing::info!("Pi agent process started (pid: {:?})", child.id());
    Ok((conn, child))
}

fn target_triple() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    { "aarch64-apple-darwin" }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    { "x86_64-apple-darwin" }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    { "x86_64-pc-windows-msvc" }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    { "x86_64-unknown-linux-gnu" }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    { "aarch64-unknown-linux-gnu" }
}

pub fn resolve_pi_path() -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    // 1. Check env var override
    if let Ok(p) = std::env::var("TIDE_PI_PATH") {
        if PathBuf::from(&p).exists() {
            return Ok(p);
        }
    }

    // 2. Check bundled sidecar (production build via externalBin)
    //    Tauri places externalBin binaries in Contents/MacOS/ alongside the main exe.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let sidecar_name = format!("pi-sidecar-{}", target_triple());
            let bundled = exe_dir.join(&sidecar_name);
            if bundled.exists() {
                tracing::info!("Using bundled Pi sidecar: {:?}", bundled);
                return Ok(bundled.to_string_lossy().to_string());
            }
        }
    }

    // 3. Check node_modules/.bin/pi relative to project root (dev mode)
    let candidates = [
        "node_modules/.bin/pi",
        "../../node_modules/.bin/pi",       // from src-tauri/
        "../../../node_modules/.bin/pi",     // from src-tauri/src/
    ];
    for candidate in &candidates {
        let p = PathBuf::from(candidate);
        if p.exists() {
            return Ok(p.canonicalize()?.to_string_lossy().to_string());
        }
    }

    // 4. Check from CWD
    let cwd = std::env::current_dir()?;
    let from_cwd = cwd.join("node_modules/.bin/pi");
    if from_cwd.exists() {
        return Ok(from_cwd.to_string_lossy().to_string());
    }

    // 5. Assume it's on PATH
    Ok("pi".to_string())
}
