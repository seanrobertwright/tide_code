# Tide IDE -- Project Structure & Architecture

Spec v3.1 | 2026-03-07

## 1) Vision

Tide is a desktop IDE that makes AI coding agents **transparent, controllable, and orchestrated**. Built with Tauri v2 (Rust) + React, it wraps the [Pi coding agent](https://shittycodingagent.ai) as its core engine -- then adds an orchestration layer on top: multi-step task planning, cost-aware model routing, a tree-sitter codebase index, and configurable orchestration settings.

**Mission**: Create the best tool for agentic coding -- where developers see exactly what the agent knows, control what it does, and benefit from intelligent multi-agent workflows that handle complex tasks end-to-end.

**Target user**: Professional developers who use AI coding agents daily and want more control, visibility, and intelligence than a CLI or editor plugin provides.

---

## 2) Why Tide

| Dimension | Claude Code CLI | Cursor | Copilot | **Tide** |
|-----------|----------------|--------|---------|----------|
| Context visibility | None (terminal) | Minimal | None | **Glass-box**: Context Dial, Inspector, budget breakdown |
| Multi-step orchestration | None | None | None | **Route -> Plan -> Build -> Review** pipeline with iterative QA |
| Safety controls | y/n in terminal | Implicit | None | **Configurable policies**, diff preview, audit logs |
| Project memory | CLAUDE.md only | None | None | **Persistent .tide/**: tags, plans, memory, sessions, index |
| Cost management | None | Hidden | Hidden | **Cost tracker**, model routing by task complexity |
| Codebase understanding | Manual | Basic | Basic | **Tree-sitter index** with FTS5 symbol search (like jcodemunch-mcp) |
| Extensibility | MCP servers | Extensions | Plugins | **Pi extensions** + Skills system + Command Palette |

---

## 3) Tech Stack

### Frontend (React + TypeScript)

| Technology | Purpose |
|---|---|
| React 19 | UI framework |
| Zustand 5 | State management (17 stores) |
| Monaco Editor | Code editing (VS Code engine) |
| xterm.js | Integrated terminal emulator |
| react-markdown | Markdown rendering in chat |
| Vite 6 | Build tooling and HMR dev server |
| Zod | Schema validation (shared types) |

### Backend (Rust + Tauri v2)

| Technology | Purpose |
|---|---|
| Tauri v2 | Desktop shell, IPC, window management, auto-updater, plugin system |
| tokio | Async runtime for Pi process management and orchestration |
| tree-sitter | Multi-language AST parsing (TypeScript, JavaScript, Rust, Python, Go) |
| rusqlite | SQLite with FTS5 for the `.tide/index.db` symbol index |
| git2 (libgit2) | Native git integration (status, diff, blame, branch info) |
| portable-pty | Native terminal (PTY) support |
| notify | Filesystem watcher for live incremental index updates |
| xxhash-rust | Fast content hashing for change detection |
| ignore | `.gitignore`-aware file walking |

### AI Layer

| Technology | Purpose |
|---|---|
| Pi coding agent (`@mariozechner/pi-coding-agent`) | LLM-powered coding agent with tool use, sessions, extensions |
| Pi extensions (8 custom) | TypeScript plugins for routing, planning, indexing, safety, sessions, web search |
| macOS Keychain | Secure API key storage (Anthropic, OpenAI, Google, Tavily) |
| OAuth2 subscription auth | Pi handles OAuth PKCE login for ChatGPT Plus/Pro (Codex), Claude Pro/Max, GitHub Copilot, Gemini CLI |
| Supported LLM providers | Anthropic (Claude), OpenAI (GPT/o-series/Codex), Google (Gemini), GitHub Copilot, and 12+ others via Pi |

---

## 4) Monorepo Structure

```
tide_code/
  package.json                # Root -- pnpm workspace
  pnpm-workspace.yaml
  .env.example                # Environment template
  scripts/
    prepare-sidecar.sh        # Dev: create Pi sidecar wrapper
    build-release.sh          # Production: build, sign, notarize, upload to R2
    bump-version.sh           # Bump version across all manifests

  packages/
    shared/                   # @tide/shared -- shared types & schemas (Zod)

  apps/
    desktop/                  # @tide/desktop -- the Tauri application
      package.json
      vite.config.ts
      index.html

      pi-extensions/          # Pi extension scripts (loaded at runtime by Pi)
        tide-classify.ts      #   Unified complexity classifier (shared utility)
        tide-router.ts        #   Model routing (quick/standard/complex tiers)
        tide-planner.ts       #   Plan tools + context injection + clarify flow
        tide-index.ts         #   Codebase index query tools for Pi
        tide-project.ts       #   Project context injection
        tide-safety.ts        #   Safety guardrails for destructive operations
        tide-session.ts       #   Session summaries + project memory tools
        tide-web-search.ts    #   Web search tool (Tavily API)

      src/                    # Frontend React application
        main.tsx              #   Entry point
        App.tsx               #   Root component + updater init

        lib/                  #   Utilities & IPC
          ipc.ts              #     Tauri command wrappers (50+ commands)
          pi-events.ts        #     Pi event type definitions
          updater.ts          #     Auto-update check on startup
          keychain.ts         #     Keychain IPC helpers
          fileHelpers.ts      #     File utility functions
          fuzzyMatch.ts       #     Fuzzy search algorithm
          routerClassifier.ts #     Client-side complexity hints

        stores/               #   Zustand state stores
          stream.ts           #     Pi event handling + chat messages (core)
          orchestrationStore.ts #   Orchestration state machine + heartbeat
          workspace.ts        #     File tree, tabs, open files
          settingsStore.ts    #     Settings state + orchestrator config
          approvalStore.ts    #     Tool approval / clarify flow
          planStore.ts        #     Plan display state
          contextStore.ts     #     Context window usage tracking
          logStore.ts         #     Debug log aggregation
          indexStore.ts       #     Codebase index status
          searchStore.ts      #     File/symbol search state
          terminalStore.ts    #     Terminal session management
          commandStore.ts     #     Command palette actions
          regionTagStore.ts   #     Code region tags
          permissionStore.ts  #     Permission management
          toastStore.ts       #     Toast notifications
          ui.ts               #     UI layout state
          engine.ts           #     Core engine initialization

        components/           #   React components
          AgentPanel/         #     Chat UI, logs, plan viewer
          Editor/             #     Monaco editor + tabs
          FileTree/           #     File explorer sidebar
          Terminal/           #     Integrated terminal
          StatusBar/          #     Model picker, context dial, cost, git
          Settings/           #     Provider keys, orchestration, routing, skills
          CommandPalette/     #     Cmd+K command palette
          Layout/             #     Resizable split panes
          AppBar/             #     Title bar
          SearchPanel/        #     Project-wide search
          Approval/           #     Tool execution approval dialog
          DiffPreview/        #     Side-by-side diff viewer
          ContextInspector/   #     Context window inspector
          Dashboard/          #     Dashboard UI
          Toasts/             #     Toast notifications

      src-tauri/              # Rust backend
        tauri.conf.json       #   Tauri configuration
        Cargo.toml            #   Rust dependencies
        capabilities/
          default.json        #   Tauri permission grants

        src/
          main.rs             #   Entry point
          lib.rs              #   Tauri commands, Pi event bridge, orchestration spawn
          orchestrator.rs     #   Multi-step orchestration engine + config
          sidecar.rs          #   Pi process spawning + API key injection from Keychain
          ipc.rs              #   JSON-RPC protocol implementation with Pi
          git.rs              #   Git operations via libgit2
          pty.rs              #   Terminal PTY management
          keychain.rs         #   macOS Keychain access
          indexer/             #   Tree-sitter codebase indexer (6 modules)
            mod.rs            #     Module root + index_workspace()
            schema.rs         #     SQLite schema + FTS5 table setup
            parser.rs         #     Tree-sitter AST parsing
            watcher.rs        #     Filesystem watcher for incremental re-index
            query.rs          #     FTS5 search queries
            symbols.rs        #     Symbol extraction from parse trees

        binaries/             #   Sidecar wrappers (gitignored, generated)
        resources/            #   Bundled resources (gitignored, generated at build)
          pi-extensions/      #     Transpiled .js extensions for production

  .tide/                      # Project-level Tide data (per-repo)
    index.db                  #   SQLite codebase index (tree-sitter + FTS5)
    index.db-shm/wal          #   WAL mode files
    router-config.json        #   Router model preferences
    orchestrator-config.json  #   Orchestration settings
    research.md               #   Cached research from planning phase
    memory.json               #   Project memory key-value store
    permissions.json          #   Permission overrides
    phases/                   #   Development phase tracking
    plans/                    #   Plan JSON files from orchestration
    sessions/                 #   Session summary markdown files
    tags/                     #   Region tags
```

---

## 5) Data Flows

### 5.1 Chat Flow (Single Message)

```
User types in AgentPanel composer
  -> handleSend() in AgentPanel.tsx
  -> sendPrompt() via ipc.ts
  -> Tauri command "send_prompt" in lib.rs
  -> PiConnection.send() via JSON-RPC to Pi stdin
  -> Pi extensions fire (tide-router -> tide-project -> tide-safety)
  -> Pi calls LLM with tools available
  -> Pi emits events via stdout JSON lines
  -> Rust reads stdout, emits Tauri events
  -> stream.ts handlePiEvent() updates Zustand stores
  -> React re-renders chat UI
```

### 5.2 Orchestration Flow (Multi-Step)

```
User sends complex prompt (auto-detected or Cmd+Enter)
  -> orchestrate() via ipc.ts
  -> Tauri spawns orchestrator on tokio::spawn
  -> Heartbeat task starts (emits every 10s, frontend detects stalls at 30s)

  Phase 1: ROUTING
    tide-classify.ts classifies prompt complexity
    tide-router.ts selects model tier with fallback chain

  Phase 2: PLANNING
    Pi generates plan via tide_plan_create tool
    Optional: tide_plan_clarify asks user questions (configurable timeout)
    Research cached to .tide/research.md for build steps

  Phase 3: BUILDING
    Steps executed sequentially (dependency-aware ordering planned)
    Each step: fresh session, [tide:orchestrated] prefix skips re-routing
    Step prompts include: task context, current step details, completed summaries

  Phase 4: REVIEWING (iterative QA loop)
    Review agent checks output for correctness
    QA commands injected if configured (e.g., "npm test")
    May generate findings -> loop back to build
    Capped at maxReviewIterations (default 2)

  Phase 5: COMPLETE or FAILED
    Frontend receives orchestration_event updates throughout
    PipelineProgress.tsx shows real-time step progress
```

### 5.3 Codebase Indexing Flow (Tree-sitter + SQLite)

```
App startup or file change detected
  -> Rust spawns index_workspace() on background thread
  -> ignore crate walks files (respects .gitignore)
  -> xxhash content hashing for change detection
  -> tree-sitter parses files (TS, JS, Rust, Python, Go)
  -> Symbols extracted: functions, classes, interfaces, types, methods
  -> Stored in .tide/index.db (SQLite + FTS5 full-text search)
  -> notify watcher detects file changes -> incremental re-index

  Pi accesses index via tide-index.ts extension tools:
    tide_search_symbols   # FTS5 symbol search across codebase
    tide_get_file_symbols # All symbols in a specific file
    tide_get_index_stats  # Index health, file count, symbol count
```

This is functionally equivalent to [jcodemunch-mcp](https://github.com/jgravelle/jcodemunch-mcp) but built natively into Tide -- no external MCP server needed. The index lives at `.tide/index.db` and is queried by Pi extensions in-process.

### 5.4 Authentication Flow

**API Keys (manual):**
```
User enters API key in Settings > Providers
  -> keychain.ts setKey() -> Tauri command -> macOS Keychain
  -> On Pi startup: sidecar.rs inject_api_keys() reads Keychain
  -> Keys injected as env vars: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, TAVILY_API_KEY
  -> Pi reads env vars for LLM authentication
  -> Router selects from available providers based on configured keys
```

**OAuth2 subscriptions (managed by Pi):**
```
Pi supports OAuth2 PKCE login for subscription-based providers:
  - OpenAI ChatGPT Plus/Pro (Codex): gpt-5-codex, gpt-5.3-codex, codex-mini
  - Anthropic Claude Pro/Max
  - GitHub Copilot
  - Google Gemini CLI / Antigravity

Flow: Pi opens browser for OAuth login -> PKCE code exchange -> tokens stored
  -> Credentials cached in ~/.pi/agent/auth.json with auto-refresh
  -> Pi manages token lifecycle (refresh before expiry, 5-min buffer)
  -> Also supports device code flow for headless environments
```

---

## 6) Pi Extension System

Extensions are TypeScript files in `apps/desktop/pi-extensions/` loaded by Pi at startup via `-e` flags. They hook into Pi's lifecycle events and can register custom tools.

| Extension | Hooks Used | Purpose |
|---|---|---|
| `tide-classify.ts` | *(utility, no hooks)* | Shared `classifyPrompt()` for complexity tiers (quick/standard/complex) |
| `tide-router.ts` | `before_agent_start` | Routes prompts to model tier; fallback chain if API key missing; skips on `[tide:orchestrated]` |
| `tide-planner.ts` | `before_agent_start` + tools | Injects planning instructions; provides `tide_plan_create`, `tide_plan_clarify` tools |
| `tide-index.ts` | tools | Codebase search tools backed by `.tide/index.db` (FTS5 queries) |
| `tide-project.ts` | `before_agent_start` | Injects project context (README, conventions, structure) |
| `tide-safety.ts` | `tool_call` | Safety guardrails: approval gates for destructive operations |
| `tide-session.ts` | tools | Session summaries (`tide_session_summary`) + project memory (`tide_memory_read/write/delete`) |
| `tide-web-search.ts` | tools | Web search via Tavily API for documentation/reference lookup |

### Extension API (Pi provides)

```typescript
pi.on("before_agent_start", async (ctx) => { ... });  // Hook before LLM call
pi.on("tool_call", async (ctx) => { ... });            // Intercept tool execution
pi.registerTool("tool_name", schema, handler);         // Register custom tool
pi.setModel("provider/model-id");                      // Switch LLM model
pi.exec("command");                                     // Run shell command
```

---

## 7) Orchestrator Configuration

Stored in `.tide/orchestrator-config.json`, editable via Settings > Orchestration:

```json
{
  "reviewMode": "fresh_session",
  "maxReviewIterations": 2,
  "qaCommands": [],
  "clarifyTimeoutSecs": 120,
  "lockModelDuringOrchestration": true
}
```

| Field | Default | Description |
|---|---|---|
| `reviewMode` | `"fresh_session"` | Review strategy: `"fresh_session"` (clean context) or `"compact"` (reuse session) |
| `maxReviewIterations` | `2` | Max QA loop iterations before auto-completing |
| `qaCommands` | `[]` | Shell commands the reviewer must run (e.g., `["npm test", "npm run lint"]`) |
| `clarifyTimeoutSecs` | `120` | Seconds to wait for user clarification before proceeding |
| `lockModelDuringOrchestration` | `true` | Prevent router from switching models mid-orchestration |

---

## 8) Tauri Commands (Rust Backend)

| Command | Purpose |
|---------|---------|
| `send_prompt(text, images?)` | Send prompt to Pi agent |
| `follow_up(text)` | Continue conversation |
| `steer_agent(text)` | Redirect agent mid-stream |
| `abort_agent()` | Abort current operation |
| `orchestrate(prompt)` | Start orchestrated multi-step flow |
| `get_pi_state()` | Request Pi state (model, session, context) |
| `get_session_stats()` | Token counts, cost, message count |
| `new_session()` / `switch_session()` / `delete_session()` | Session management |
| `list_sessions()` | List saved sessions |
| `set_model(provider, model)` | Switch LLM model |
| `set_thinking_level(level)` | Set thinking depth |
| `get_available_models()` | List available models across providers |
| `open_workspace(path)` | Set workspace root |
| `fs_list_dir(path)` / `fs_read_file(path)` | Filesystem operations |
| `keychain_set_key()` / `keychain_get_key()` / `keychain_delete_key()` | API key storage |
| `git_status()` / `git_branch()` | Git integration |
| `read_orchestrator_config()` / `write_orchestrator_config()` | Orchestration settings |
| `list_skills()` | Query Pi for installed skills |
| `query_index()` / `get_index_stats()` | Codebase index queries |
| `pty_spawn()` / `pty_write()` / `pty_resize()` / `pty_kill()` | Terminal management |
| `respond_ui_request(id, data)` | Respond to approval/clarify dialogs |
| `compact()` | Trigger context compaction |

---

## 9) Key Design Decisions

1. **Pi as sidecar, not embedded**: Pi runs as a separate Node.js process over JSON-RPC stdin/stdout. Isolates crashes, allows independent updates, and leverages Pi's full feature set.

2. **Extensions over hardcoding**: Routing, planning, indexing, and safety are Pi extensions (TypeScript), not Rust code. Easy to modify without recompiling.

3. **Keychain for secrets + OAuth via Pi**: API keys stored in macOS Keychain, injected as env vars when Pi starts. Subscription providers (Codex, Copilot, Claude Pro/Max) authenticate via Pi's built-in OAuth2 PKCE flow with tokens cached in `~/.pi/agent/auth.json`.

4. **Tree-sitter for indexing**: Native-speed AST parsing provides symbol-level codebase understanding without requiring LSP servers. Same approach as jcodemunch-mcp but built-in.

5. **Orchestration as state machine**: Multi-step tasks follow strict phase progression with heartbeat monitoring, configurable review loops, and stall detection.

6. **Unified classifier**: Single `tide-classify.ts` consumed by both router and planner, preventing classification divergence.

7. **`[tide:orchestrated]` marker**: Orchestrated step prompts are prefixed to prevent re-routing and re-classification during multi-step execution.

---

## 10) Development Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 1-3 | Done | Tauri shell, React UI, file tree, Monaco editor, region tags |
| 4 | Done | Pi integration pivot -- replaced custom engine with Pi RPC |
| 5 | Done | IDE polish -- Command Palette, Settings, Keychain, diff preview, git status |
| 6 | Done | Wire Pi features -- context dial, logs, model picker, approval flow |
| 6b | Done | Terminal integration (xterm.js + native PTY) |
| 7 | Done | Router + classifier + planner + plan viewer + cost tracker |
| 8 | Done | Orchestration engine + progress UI + review loop + heartbeat |
| 9 | Done | Skills discovery UI (queries Pi for installed skills) |
| 10 | Done | Session intelligence + project memory |

---

## 11) Success Criteria

A developer opens Tide, types "Build a REST API for user management with auth, tests, and documentation." Tide:

1. **Routes** it as complex, selects a powerful model
2. **Plans** -- generates a structured plan with steps, optionally asking clarifying questions
3. **Builds** -- executes each step with approval gates, showing diffs
4. **Reviews** -- checks code quality, runs configured test commands, loops if issues found
5. **Presents** -- shows changeset summary with per-file diffs

Throughout, the developer sees: orchestration progress, context budget, cost, and every tool call with its result. They can pause, override the model, edit the plan, or take manual control at any point.
