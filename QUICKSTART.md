# Quickstart -- Tide IDE Development

Get Tide running locally for development in under 5 minutes.

## Prerequisites

### All platforms

| Tool | Version | Install |
|------|---------|---------|
| Node.js | >= 20 | [nodejs.org](https://nodejs.org) |
| pnpm | latest | `npm install -g pnpm` |
| Rust | stable | [rustup.rs](https://rustup.rs) |

### macOS

| Tool | Install |
|------|---------|
| Xcode CLT | `xcode-select --install` |

### Windows

| Tool | Install |
|------|---------|
| Visual Studio Build Tools 2022 | [visualstudio.microsoft.com](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — select **"Desktop development with C++"** workload |
| WebView2 | Pre-installed on Windows 10/11. If missing, download from [developer.microsoft.com](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) |

Verify:

```bash
node --version    # v20+
pnpm --version    # 8+
rustc --version   # 1.70+
```

## Setup

### 1. Clone and install

```bash
git clone <repo-url> tide_code
cd tide_code
pnpm install
```

This installs all workspace dependencies including the Pi coding agent (`@mariozechner/pi-coding-agent`).

### 2. Prepare the Pi sidecar

The Pi agent runs as a sidecar process. Create the wrapper script:

**macOS / Linux:**
```bash
./scripts/prepare-sidecar.sh
```

**Windows (PowerShell):**
```powershell
.\scripts\prepare-sidecar.ps1
```

This creates `apps/desktop/src-tauri/binaries/pi-sidecar-{your-target-triple}` pointing to the Pi CLI in `node_modules`.

### 3. Set up API keys

You need at least one LLM API key (Anthropic, OpenAI, or Google).

**macOS** — Tide stores keys in the macOS Keychain. Pre-load them from the terminal:

```bash
security add-generic-password -a "tide" -s "anthropic" -w "sk-ant-..."
security add-generic-password -a "tide" -s "openai" -w "sk-..."
security add-generic-password -a "tide" -s "google" -w "AI..."

# Optional: for web search
security add-generic-password -a "tide" -s "tavily" -w "tvly-..."
```

**Windows** — Keys are stored in an encrypted local file. Set them via the app UI:

1. Launch Tide
2. Go to **Settings > Providers**
3. Enter your API keys

**All platforms** — You can always enter or update keys in **Settings > Providers** from within the app.

### 4. Run in development mode

```bash
pnpm tauri:dev
```

This:
- Starts Vite dev server on `http://localhost:5173`
- Compiles the Rust backend
- Opens the Tide window with hot reload

First build takes a few minutes (Rust compilation). Subsequent launches are fast.

## Development Workflow

### Frontend only (faster iteration)

```bash
cd apps/desktop
pnpm dev
```

Opens `http://localhost:5173` in the browser. No Tauri/Rust features (Pi, terminal, keychain, git) -- useful for UI-only work.

### Rust backend

```bash
cd apps/desktop/src-tauri
cargo check    # Type check
cargo build    # Build debug binary
```

### Full app

```bash
pnpm tauri:dev
```

### Shared types

If you modify `packages/shared/`:

```bash
pnpm build:shared
```

## Project Layout (Key Files)

| What you're working on | Key files |
|---|---|
| Chat UI | `src/components/AgentPanel/AgentPanel.tsx`, `src/stores/stream.ts` |
| Orchestration | `src-tauri/src/orchestrator.rs`, `src/stores/orchestrationStore.ts` |
| Pi communication | `src-tauri/src/sidecar.rs`, `src-tauri/src/ipc.rs`, `src-tauri/src/lib.rs` |
| Model routing | `pi-extensions/tide-router.ts`, `pi-extensions/tide-classify.ts` |
| Planning | `pi-extensions/tide-planner.ts` |
| Codebase index | `pi-extensions/tide-index.ts`, Rust indexer in `src-tauri/src/lib.rs` |
| Settings | `src/components/Settings/`, `src/stores/settingsStore.ts` |
| File tree / editor | `src/components/FileTree/`, `src/components/Editor/` |
| Terminal | `src/components/Terminal/`, `src-tauri/src/pty.rs` |
| Status bar | `src/components/StatusBar/` (model picker, context dial, cost, git) |

## Common Tasks

### Add a new Pi extension

1. Create `apps/desktop/pi-extensions/tide-myext.ts`
2. Register it in `apps/desktop/src-tauri/src/lib.rs` in `resolve_extension_paths()`
3. Extension receives the Pi API object and can hook into events or register tools

### Add a new Tauri command

1. Write the Rust function in `src-tauri/src/lib.rs` with `#[tauri::command]`
2. Register it in the `invoke_handler` in `run()`
3. Add the TypeScript wrapper in `src/lib/ipc.ts`

### Add a new Zustand store

1. Create `src/stores/myStore.ts`
2. Export the hook: `export const useMyStore = create<MyState>(...)`
3. Import and use in components

### Debug Pi communication

Pi extension logs go to stderr. In dev mode, check the terminal where `pnpm tauri:dev` is running. Look for `[tide:router]`, `[tide:planner]`, `[tide:index]` prefixes.

For frontend debugging, open the DevTools (Cmd+Opt+I on macOS, Ctrl+Shift+I on Windows/Linux) and check the console for `[Tide:event]` logs.

## Troubleshooting

**"Pi package not installed"** -- Run `pnpm install` from the project root, then re-run `./scripts/prepare-sidecar.sh`.

**Port 5173 already in use** -- The dev command auto-kills existing processes on 5173. If it persists:
- macOS/Linux: `lsof -ti:5173 | xargs kill -9`
- Windows: `netstat -ano | findstr :5173` then `taskkill /PID <pid> /F`

**Rust compilation errors** -- Make sure your platform toolchain is installed and Rust is up to date:
- macOS: install Xcode CLT (`xcode-select --install`)
- Windows: install Visual Studio Build Tools with the "Desktop development with C++" workload
- All: `rustup update stable`

**No models available** -- Enter at least one API key in Settings > Providers (Anthropic recommended).

**Codebase index not building** -- Check that `.tide/index.db` exists after opening a workspace. The indexer runs on a background thread; check Rust logs for tree-sitter errors.
