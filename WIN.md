# Windows Port Implementation Plan

## Overview

Tide is a Tauri v2 desktop IDE/AI coding assistant currently targeting macOS. The architecture is ~90% cross-platform already. This document tracks the work needed to ship on Windows.

---

## Phase 1 — Compile & Run on Windows

### 1.1 Fix `notify` crate feature flag
- **File:** `apps/desktop/src-tauri/Cargo.toml:31`
- **Problem:** `notify = { version = "7", features = ["macos_kqueue"] }` — `macos_kqueue` is macOS-only, fails compilation on Windows.
- **Fix:** Move the macOS-specific feature to a `[target]` section:
  ```toml
  notify = { version = "7" }

  [target.'cfg(target_os = "macos")'.dependencies]
  notify = { version = "7", features = ["macos_kqueue"] }
  ```

### 1.2 Fix `beforeDevCommand` in tauri.conf.json
- **File:** `apps/desktop/src-tauri/tauri.conf.json:10`
- **Problem:** `lsof -ti:5173 | xargs kill -9 2>/dev/null; pnpm dev` — `lsof` and `xargs` are Unix-only.
- **Fix:** Replace with cross-platform Node script or just `pnpm dev` (the port-killing is a convenience, not a requirement).

### 1.3 Add Windows shell detection in PTY
- **File:** `apps/desktop/src-tauri/src/pty.rs:57`
- **Problem:** Uses `std::env::var("SHELL")` with fallback to `/bin/zsh` — both Unix-only.
- **Fix:** Add `#[cfg(windows)]` block to detect `powershell.exe` or `cmd.exe`:
  ```rust
  #[cfg(unix)]
  let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());

  #[cfg(windows)]
  let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".into());
  ```

### 1.4 Replace `$HOME` with cross-platform home directory
- **Files:**
  - `apps/desktop/src-tauri/src/lib.rs` (multiple locations)
  - `apps/desktop/src-tauri/src/keychain.rs`
- **Problem:** Uses `std::env::var("HOME")` which doesn't exist on Windows.
- **Fix:** Use the `dirs` crate (`dirs::home_dir()`) or fall back to `USERPROFILE`:
  ```rust
  fn home_dir() -> PathBuf {
      dirs::home_dir().expect("Could not determine home directory")
  }
  ```
  Add `dirs = "5"` to Cargo.toml if not already present.

### 1.5 Gate CLI install behind macOS cfg
- **File:** `apps/desktop/src-tauri/src/lib.rs:1837-1923`
- **Problem:** Uses `osascript` (AppleScript) for admin elevation, installs to `/usr/local/bin/tide`, uses `open -a Tide`.
- **Fix:** Wrap entire function in `#[cfg(target_os = "macos")]`. Add a stub or alternative for Windows:
  ```rust
  #[cfg(target_os = "macos")]
  #[tauri::command]
  async fn install_cli(...) -> Result<...> { /* existing macOS code */ }

  #[cfg(target_os = "windows")]
  #[tauri::command]
  async fn install_cli(...) -> Result<...> {
      // Windows: add exe directory to PATH via registry, or return not-supported
      Err("CLI installation not yet supported on Windows".into())
  }
  ```

### 1.6 Fix browser open command in tide-auth.ts
- **File:** `apps/desktop/pi-extensions/tide-auth.ts:66`
- **Problem:** Uses `cp.exec("open \"${url}\"")` — `open` is macOS-only.
- **Fix:**
  ```typescript
  const cmd = process.platform === 'win32' ? 'start ""' :
              process.platform === 'darwin' ? 'open' : 'xdg-open';
  cp.exec(`${cmd} "${url}"`);
  ```

---

## Phase 2 — Polish

### 2.1 Fix AppBar padding for Windows title bar
- **Files:** `apps/desktop/src/components/AppBar/AppBar.module.css:5-6`, `AppBar.tsx`
- **Problem:** 72px left padding assumes macOS traffic lights. Windows has controls on the right.
- **Fix:** Detect platform via Tauri `os` plugin, conditionally apply padding.

### 2.2 Add Windows bundle config
- **File:** `apps/desktop/src-tauri/tauri.conf.json`
- **Fix:** Add Windows-specific bundle settings:
  ```json
  "windows": {
    "certificateThumbprint": null,
    "digestAlgorithm": "sha256",
    "timestampUrl": ""
  }
  ```

### 2.3 Update documentation
- **File:** `QUICKSTART.md`
- **Fix:** Add Windows prerequisites (Visual Studio Build Tools / MSVC, etc.)

---

## Phase 3 — Production

### 3.1 CI/CD for Windows builds
- Add GitHub Actions workflow for Windows (MSVC runner)
- Build MSI/NSIS installers

### 3.2 Code signing
- Obtain Windows code signing certificate
- Configure Tauri signing in CI

### 3.3 Auto-updater
- **File:** `apps/desktop/latest.json`
- Add `windows-x86_64` and `windows-aarch64` platform entries

### 3.4 Native Windows Credential Manager
- Replace plaintext JSON keychain with Windows Credential Manager
- Use `windows-credentials` or `keyring` crate

---

## Status

| Task | Status | Owner |
|------|--------|-------|
| 1.1 notify feature flag | Pending | — |
| 1.2 beforeDevCommand | Pending | — |
| 1.3 PTY shell detection | Pending | — |
| 1.4 Home directory helper | Pending | — |
| 1.5 CLI install cfg gate | Pending | — |
| 1.6 Browser open command | Pending | — |
| 2.1 AppBar padding | Pending | — |
| 2.2 Bundle config | Pending | — |
| 2.3 Documentation | Pending | — |
| 3.1 CI/CD | Pending | — |
| 3.2 Code signing | Pending | — |
| 3.3 Auto-updater | Pending | — |
| 3.4 Credential Manager | Pending | — |
