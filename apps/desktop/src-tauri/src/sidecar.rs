use crate::ipc::PiConnection;
use crate::keychain;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
#[cfg(windows)]
use std::os::windows::process::CommandExt;

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

/// Inject API keys from the keychain as environment variables.
/// Returns the name of the first provider that has a key configured.
fn inject_api_keys(cmd: &mut Command) -> Option<&'static str> {
    let mut first_provider = None;

    for (provider, keychain_name, env_var) in PROVIDER_KEYS {
        match keychain::get_key(keychain_name) {
            Ok(Some(key)) => {
                tracing::info!("Injecting {} from keychain (key length: {})", env_var, key.len());
                cmd.env(env_var, key);
                if first_provider.is_none() {
                    first_provider = Some(*provider);
                }
            }
            Ok(None) => {
                tracing::info!("No key found in keychain for {}", keychain_name);
            }
            Err(e) => {
                tracing::warn!("Error reading keychain for {}: {}", keychain_name, e);
            }
        }
    }

    first_provider
}

/// Inject service API keys (non-provider) from the keychain as environment variables.
fn inject_service_keys(cmd: &mut Command) {
    for (keychain_name, env_var) in SERVICE_KEYS {
        if let Ok(Some(key)) = keychain::get_key(keychain_name) {
            tracing::info!("Injecting {} from keychain", env_var);
            cmd.env(env_var, key);
        }
    }
}

/// Resolve the Pi CLI path into a (program, args_prefix) pair suitable for Command::new().
/// On Unix, this returns the script path directly.
/// On Windows, .cmd wrappers can't be piped reliably, so we resolve the underlying
/// Node.js entry point and return ("node.exe_path", [script_path]).
fn resolve_command(pi_path: &str) -> (String, Vec<String>) {
    #[cfg(windows)]
    {
        // Strip \\?\ UNC prefix that canonicalize() adds on Windows
        let pi_path_clean = pi_path.strip_prefix(r"\\?\").unwrap_or(pi_path);

        // If the resolved path is a .cmd file, parse it to find the JS entry point
        if pi_path_clean.to_lowercase().ends_with(".cmd") {
            tracing::info!("Attempting to resolve .cmd wrapper: {}", pi_path_clean);
            if let Ok(contents) = std::fs::read_to_string(pi_path_clean) {
                // Look for the node invocation pattern: node "path\to\cli.js" %*
                // The .cmd file has lines like: node  "%~dp0\..\path\cli.js" %*
                for line in contents.lines() {
                    let trimmed = line.trim();
                    // Find lines that invoke node with a .js file
                    if let Some(rest) = trimmed.strip_prefix("node ").or_else(|| trimmed.strip_prefix("node.exe "))
                        .or_else(|| trimmed.strip_prefix("\"node\" ").or_else(|| trimmed.strip_prefix("\"node.exe\" ")))
                    {
                        let rest = rest.trim();
                        // Extract the JS path (may be in quotes with %~dp0)
                        if let Some(js_path) = extract_js_path_from_cmd(rest, pi_path_clean) {
                            tracing::info!("Candidate JS path: {}", js_path);
                            if PathBuf::from(&js_path).exists() {
                                let node = resolve_node_exe(pi_path_clean);
                                tracing::info!("Resolved Pi .cmd -> {} {}", node, js_path);
                                return (node, vec![js_path]);
                            }
                        }
                    }
                }
            }
            // Fallback: try conventional path relative to .cmd location
            let cmd_dir = PathBuf::from(pi_path_clean).parent().unwrap_or(std::path::Path::new(".")).to_path_buf();
            if let Ok(entries) = glob_first(&cmd_dir.join(".."), ".pnpm/@mariozechner+pi-coding-agent@*/node_modules/@mariozechner/pi-coding-agent/dist/cli.js") {
                if PathBuf::from(&entries).exists() {
                    let node = resolve_node_exe(pi_path_clean);
                    tracing::info!("Resolved Pi via glob -> {} {}", node, entries);
                    return (node, vec![entries]);
                }
            }
            // Last resort: try the known direct path from node_modules
            let direct = PathBuf::from(pi_path_clean)
                .parent()
                .unwrap_or(std::path::Path::new("."))
                .join("..")
                .join("@mariozechner")
                .join("pi-coding-agent")
                .join("dist")
                .join("cli.js");
            if direct.exists() {
                let resolved = direct.canonicalize()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| direct.to_string_lossy().to_string());
                // Strip UNC prefix from canonicalized path
                let resolved = resolved.strip_prefix(r"\\?\").unwrap_or(&resolved).to_string();
                let node = resolve_node_exe(pi_path_clean);
                tracing::info!("Resolved Pi via direct path -> {} {}", node, resolved);
                return (node, vec![resolved]);
            }
            tracing::warn!("Could not resolve .cmd to JS entry point, falling back to cmd /C: {}", pi_path_clean);
            return ("cmd".to_string(), vec!["/C".to_string(), pi_path_clean.to_string()]);
        }
        (pi_path_clean.to_string(), vec![])
    }
    #[cfg(not(windows))]
    {
        (pi_path.to_string(), vec![])
    }
}

/// Resolve the full path to node.exe on Windows.
/// Checks: 1) node_modules/.bin/node.exe (pnpm shim), 2) common install locations, 3) falls back to "node"
#[cfg(windows)]
fn resolve_node_exe(cmd_path: &str) -> String {
    // 1. Check alongside the .cmd file (pnpm sometimes places node.exe here)
    if let Some(cmd_dir) = PathBuf::from(cmd_path).parent() {
        let local_node = cmd_dir.join("node.exe");
        if local_node.exists() {
            let s = local_node.to_string_lossy().to_string();
            tracing::info!("Found node.exe alongside .cmd: {}", s);
            return s;
        }
    }

    // 2. Walk up from the .cmd file to find the project root's node_modules/.bin/node.exe
    //    (nvm-windows puts node.exe on the system PATH but it may not be inherited)

    // 3. Check common Windows install paths
    let candidates = [
        // Standard Node.js installer
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
    ];
    for candidate in &candidates {
        if PathBuf::from(candidate).exists() {
            tracing::info!("Found node.exe at standard path: {}", candidate);
            return candidate.to_string();
        }
    }

    // 4. Check nvm-windows symlink and versioned directories
    if let Some(home) = dirs::home_dir() {
        // nvm-windows default symlink
        let nvm_symlink = PathBuf::from(r"C:\Program Files\nodejs\node.exe");
        if nvm_symlink.exists() {
            return nvm_symlink.to_string_lossy().to_string();
        }
        // nvm-windows stores versions in AppData\Roaming\nvm\
        let nvm_dir = home.join("AppData").join("Roaming").join("nvm");
        if nvm_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
                // Pick the latest version directory that contains node.exe
                let mut versions: Vec<_> = entries.flatten()
                    .filter(|e| e.path().join("node.exe").exists())
                    .collect();
                versions.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
                if let Some(latest) = versions.first() {
                    let node = latest.path().join("node.exe");
                    let s = node.to_string_lossy().to_string();
                    tracing::info!("Found node.exe via nvm-windows: {}", s);
                    return s;
                }
            }
        }
    }

    // 5. Try finding node.exe via the Windows PATH (using `where` equivalent)
    if let Ok(output) = std::process::Command::new("cmd")
        .args(["/C", "where", "node"])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(first_line) = stdout.lines().next() {
                let path = first_line.trim();
                if !path.is_empty() && PathBuf::from(path).exists() {
                    tracing::info!("Found node.exe via `where`: {}", path);
                    return path.to_string();
                }
            }
        }
    }

    // 6. Last resort — hope it's on PATH
    tracing::warn!("Could not locate node.exe, falling back to bare 'node'");
    "node".to_string()
}

/// Extract the JS file path from a .cmd line like: "%~dp0\..\path\cli.js" %*
#[cfg(windows)]
fn extract_js_path_from_cmd(rest: &str, cmd_path: &str) -> Option<String> {
    // Remove trailing %*
    let rest = rest.trim_end_matches("%*").trim();
    // Remove surrounding quotes
    let rest = rest.trim_matches('"');
    // Replace %~dp0 with the directory of the .cmd file
    let cmd_dir = PathBuf::from(cmd_path)
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .to_string_lossy()
        .to_string();
    let resolved = rest.replace("%~dp0", &format!("{}/", cmd_dir.replace('\\', "/")));
    // Normalize path separators
    let resolved = resolved.replace('\\', "/");
    // Canonicalize and strip \\?\ UNC prefix that Windows adds
    let p = PathBuf::from(&resolved);
    if let Ok(canonical) = p.canonicalize() {
        let s = canonical.to_string_lossy().to_string();
        Some(s.strip_prefix(r"\\?\").unwrap_or(&s).to_string())
    } else {
        // Try as-is
        Some(resolved)
    }
}

/// Simple glob helper: find first matching file under base_dir.
#[cfg(windows)]
fn glob_first(base_dir: &std::path::Path, pattern: &str) -> Result<String, Box<dyn std::error::Error>> {
    // Walk just the first segment that contains a wildcard
    let parts: Vec<&str> = pattern.splitn(2, '*').collect();
    if parts.len() != 2 {
        return Err("no wildcard in pattern".into());
    }
    let prefix_path = base_dir.join(parts[0].trim_end_matches('/').trim_end_matches('\\'));
    let parent = prefix_path.parent().ok_or("no parent")?;
    let prefix_name = prefix_path.file_name().ok_or("no filename")?.to_string_lossy();

    if let Ok(entries) = std::fs::read_dir(parent) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(prefix_name.as_ref()) {
                let candidate = entry.path().join(parts[1].trim_start_matches('/').trim_start_matches('\\'));
                if candidate.exists() {
                    return Ok(candidate.to_string_lossy().to_string());
                }
            }
        }
    }
    Err("no match".into())
}

/// Start the Pi agent in RPC mode and return a PiConnection + child handle.
pub async fn start_pi(
    workspace_root: &str,
    extensions: &[String],
) -> Result<(PiConnection, Child), Box<dyn std::error::Error + Send + Sync>> {
    let pi_path = resolve_pi_path()?;
    tracing::info!("Starting Pi: {} --mode rpc (cwd: {})", pi_path, workspace_root);

    let (program, prefix_args) = resolve_command(&pi_path);
    tracing::info!("Resolved command: {} {:?}", program, prefix_args);

    let mut cmd = Command::new(&program);
    for arg in &prefix_args {
        cmd.arg(arg);
    }

    // On Windows, when calling node directly (bypassing .cmd wrapper),
    // we need to set NODE_PATH so Pi can resolve its dependencies.
    #[cfg(windows)]
    if !prefix_args.is_empty() {
        // The JS entry point is the first prefix arg — derive the package's node_modules
        let js_path = PathBuf::from(&prefix_args[0]);
        if let Some(pkg_dir) = js_path.parent().and_then(|p| p.parent()) {
            let pkg_node_modules = pkg_dir.join("node_modules");
            // Also include the .pnpm hoisted node_modules
            let mut node_path_parts: Vec<String> = vec![];
            if pkg_node_modules.exists() {
                node_path_parts.push(pkg_node_modules.to_string_lossy().to_string());
            }
            // Walk up to find the .pnpm node_modules
            let mut ancestor = pkg_dir.to_path_buf();
            for _ in 0..5 {
                if let Some(parent) = ancestor.parent() {
                    let pnpm_modules = parent.join("node_modules");
                    if pnpm_modules.exists() && !node_path_parts.contains(&pnpm_modules.to_string_lossy().to_string()) {
                        node_path_parts.push(pnpm_modules.to_string_lossy().to_string());
                    }
                    ancestor = parent.to_path_buf();
                } else {
                    break;
                }
            }
            if !node_path_parts.is_empty() {
                let node_path = node_path_parts.join(";");
                tracing::info!("Setting NODE_PATH={}", node_path);
                cmd.env("NODE_PATH", node_path);
            }
        }
    }

    // If using bundled sidecar, set PI_PACKAGE_DIR so the Bun binary
    // finds its assets (package.json, themes, docs, etc.) in the
    // Tauri resources directory instead of next to the executable.
    if let Some(assets_dir) = resolve_pi_assets_dir() {
        tracing::info!("Setting PI_PACKAGE_DIR={}", assets_dir);
        cmd.env("PI_PACKAGE_DIR", &assets_dir);
    }

    cmd.arg("--mode").arg("rpc");
    cmd.arg("-c"); // Continue last session (restores chat history)

    for ext in extensions {
        cmd.arg("-e").arg(ext);
    }

    // Inject service keys (non-provider keys like Tavily)
    inject_service_keys(&mut cmd);

    // Inject API keys from Tide's keychain as env vars.
    // Only override Pi's --provider if we found explicit API keys AND
    // Pi doesn't already have its own OAuth auth configured.
    if let Some(provider) = inject_api_keys(&mut cmd) {
        let pi_auth_path = dirs::home_dir()
            .map(|h| h.join(".pi").join("agent").join("auth.json"));
        let has_pi_oauth = pi_auth_path
            .as_ref()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
            .map(|val| val.as_object().map_or(false, |obj| !obj.is_empty()))
            .unwrap_or(false);

        if has_pi_oauth {
            tracing::info!("Pi has its own OAuth auth — not overriding --provider (detected: {})", provider);
        } else {
            tracing::info!("Auto-detected provider from keychain: {}", provider);
            cmd.arg("--provider").arg(provider);
        }
    }

    cmd.current_dir(workspace_root);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.kill_on_drop(true);

    // On Windows, prevent spawning a visible console window
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

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

/// Resolve the path to bundled Pi assets (resources/pi-assets/).
/// Tauri places resources alongside the main exe on Windows, and in
/// Contents/Resources/ on macOS. Returns None if not in a bundled context.
fn resolve_pi_assets_dir() -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    let exe_dir = exe.parent()?;

    // Check if we're using the bundled sidecar (not dev mode)
    let sidecar_name = format!("pi-sidecar-{}", target_triple());
    let bundled = exe_dir.join(&sidecar_name);
    if !bundled.exists() {
        return None;
    }

    // Windows/Linux: resources are alongside the exe
    let assets = exe_dir.join("resources").join("pi-assets");
    if assets.exists() {
        return Some(assets.to_string_lossy().to_string());
    }

    // macOS: resources are in Contents/Resources/
    #[cfg(target_os = "macos")]
    {
        let mac_assets = exe_dir.parent()?.join("Resources").join("pi-assets");
        if mac_assets.exists() {
            return Some(mac_assets.to_string_lossy().to_string());
        }
    }

    None
}

pub fn resolve_pi_path() -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    // 1. Check env var override
    if let Ok(p) = std::env::var("TIDE_PI_PATH") {
        if PathBuf::from(&p).exists() {
            return Ok(p);
        }
    }

    // 2. Check bundled sidecar (production build via externalBin)
    //    Tauri places externalBin binaries alongside the main exe.
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
    //    On Windows, the binary is "pi.cmd"; on Unix it's "pi".
    #[cfg(windows)]
    let bin_names = &["node_modules/.bin/pi.cmd", "node_modules/.bin/pi.CMD", "node_modules/.bin/pi.exe"];
    #[cfg(not(windows))]
    let bin_names = &["node_modules/.bin/pi"];

    let relative_dirs = &[
        "",              // project root
        "../..",         // from src-tauri/
        "../../..",      // from src-tauri/src/
    ];

    for dir in relative_dirs {
        for bin in bin_names {
            let p = if dir.is_empty() {
                PathBuf::from(bin)
            } else {
                PathBuf::from(dir).join(bin)
            };
            if p.exists() {
                return Ok(p.canonicalize()?.to_string_lossy().to_string());
            }
        }
    }

    // 4. Check from CWD
    let cwd = std::env::current_dir()?;
    for bin in bin_names {
        let from_cwd = cwd.join(bin);
        if from_cwd.exists() {
            return Ok(from_cwd.to_string_lossy().to_string());
        }
    }

    // 5. Assume it's on PATH
    #[cfg(windows)]
    return Ok("pi.cmd".to_string());
    #[cfg(not(windows))]
    Ok("pi".to_string())
}
