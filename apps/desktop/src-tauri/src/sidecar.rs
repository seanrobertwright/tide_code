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

/// Start the Pi agent in RPC mode and return a PiConnection + child handle.
pub async fn start_pi(
    workspace_root: &str,
    extensions: &[String],
) -> Result<(PiConnection, Child), Box<dyn std::error::Error + Send + Sync>> {
    let pi_path = resolve_pi_path()?;
    tracing::info!("Starting Pi: {} --mode rpc (cwd: {})", pi_path, workspace_root);

    let mut cmd = Command::new(&pi_path);
    cmd.arg("--mode").arg("rpc");
    cmd.arg("--no-session"); // Tide manages its own session concept

    for ext in extensions {
        cmd.arg("-e").arg(ext);
    }

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

fn resolve_pi_path() -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    // 1. Check env var
    if let Ok(p) = std::env::var("TIDE_PI_PATH") {
        if PathBuf::from(&p).exists() {
            return Ok(p);
        }
    }

    // 2. Check node_modules/.bin/pi relative to project root
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

    // 3. Check from CWD
    let cwd = std::env::current_dir()?;
    let from_cwd = cwd.join("node_modules/.bin/pi");
    if from_cwd.exists() {
        return Ok(from_cwd.to_string_lossy().to_string());
    }

    // 4. Assume it's on PATH
    Ok("pi".to_string())
}
