# Tide

> **Now available on Windows!** Tide runs natively on Windows 10/11 with full feature parity -- PTY terminal (PowerShell/cmd), Windows Credential Manager for secure key storage, MSVC build toolchain support, and NSIS/MSI installers cominh soon. See the [Windows setup guide](./WIN.md) for details.

An AI-native code editor with orchestrated multi-step workflows, built on [Tauri v2](https://v2.tauri.app) and the [Pi coding agent](https://shittycodingagent.ai).

Tide wraps Pi as a sidecar process, adding a full IDE around it: Monaco editor, file tree, integrated terminal, codebase indexing, project memory, and an orchestration engine that breaks complex tasks into plan-build-review pipelines.

**Platforms:** macOS 12+ | Windows 10/11 | Linux (planned)

## What Makes Tide Different

**Glass-box context** -- See exactly what the agent sees: token budget, context usage, injected files, and cost breakdown in real time.

**Orchestrated workflows** -- Complex tasks are automatically routed through a multi-phase pipeline: classify complexity -> select the right model -> generate a plan -> execute steps -> review and iterate. Simple questions just get answered directly. Cancel any pipeline mid-run.

**Built-in codebase index** -- Tree-sitter parses your entire project into a SQLite+FTS5 symbol database (`.tide/index.db`). The AI agent can search for functions, classes, and types across the codebase instantly -- no LSP server required.

**Project memory** -- Tide remembers across sessions. The agent stores learned facts about your project (architecture decisions, conventions, patterns) in `.tide/memory.json`. Session summaries are saved to `.tide/sessions/` and automatically injected as context in future conversations.

**Smart context injection** -- Priority-based injection with token budgeting: TIDE.md rules (always) -> pinned region tags -> active feature plan -> project memory -> recent session summaries. Trimmable items are dropped when the budget is tight.

**Cost-aware model routing** -- Simple edits use fast, cheap models. Multi-file architecture tasks get routed to powerful models. The router classifies every prompt and picks the best model for the job.

**Editable editor** -- Full read-write Monaco editor with Cmd+S / Ctrl+S save, dirty state tracking, and Tokyo Night theme. Not just a viewer.

**Configurable everything** -- Review mode, QA commands, clarify timeouts, model lock during orchestration, tier model preferences -- all configurable per-project via `.tide/orchestrator-config.json` and `.tide/router-config.json`.

## How It Works

### Architecture

```
+------------------+     JSON-RPC (stdin/stdout)     +------------------+
|   Tauri (Rust)   | <-----------------------------> |   Pi Agent       |
|                  |                                  |   (Node.js)      |
|  - Orchestrator  |     Tauri Events                 |  - LLM calls     |
|  - Tree-sitter   | ------------------------------>  |  - Tool use      |
|  - Git (libgit2) |                                  |  - Sessions      |
|  - PTY terminal  |     +--- Pi Extensions ---+      |  - Compaction    |
|  - Keychain      |     | tide-router.ts      |      +------------------+
|  - SQLite index  |     | tide-planner.ts     |
+------------------+     | tide-index.ts       |
        |                 | tide-safety.ts      |
   Tauri Events           | tide-project.ts     |
        |                 | tide-session.ts     |
        v                 | tide-classify.ts    |
+------------------+      | tide-web-search.ts  |
|   React UI       |      +--------------------+
|  - Monaco Editor |
|  - Agent Chat    |
|  - File Tree     |
|  - Terminal      |
|  - Settings      |
|  - Dashboard     |
+------------------+
```

### Pi Integration

Tide runs Pi as a sidecar process in RPC mode. On startup:

1. **Sidecar resolution** -- Rust finds the Pi binary: checks `binaries/pi-sidecar-{target-triple}` (production bundle), then `node_modules` (dev), then PATH
2. **API key injection** -- Reads keys from the platform credential store (macOS Keychain or Windows Credential Manager), injects as environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `TAVILY_API_KEY`). Pi also supports OAuth2 login for subscription providers (ChatGPT Plus/Pro Codex, Claude Pro/Max, GitHub Copilot, Gemini CLI) with credentials cached in `~/.pi/agent/auth.json`.
3. **Extension loading** -- Passes 8 custom extensions via `-e` flags
4. **JSON-RPC bridge** -- Rust reads Pi's stdout line-by-line, parses events, and emits them as Tauri events to the React frontend

Pi retains full ownership of: LLM interaction, tool execution (read/write/edit/bash/grep), session management (JSONL tree structure, auto-compaction), and the agent loop.

Tide adds on top: orchestration (multi-step pipelines), the codebase index, project memory, session intelligence, native git/terminal, and the full IDE UI.

### Codebase Indexing

Tide includes a built-in codebase indexer:

- **Tree-sitter parsing** for TypeScript, JavaScript, Rust, Python, and Go
- **Symbol extraction**: functions, classes, interfaces, types, methods with line ranges
- **SQLite + FTS5** full-text search stored in `.tide/index.db`
- **Live updates** via filesystem watcher -- changes are indexed incrementally
- **Exposed to Pi** via the `tide-index.ts` extension, which registers tools like `tide_search_symbols` and `tide_get_file_symbols`

The agent can search your entire codebase by symbol name, find all symbols in a file, or get index stats -- all without reading every file into the context window.

### Orchestration Engine

When you send a complex prompt (detected automatically or forced with Cmd+Enter / Ctrl+Enter):

1. **Routing** -- `tide-classify.ts` analyzes complexity, `tide-router.ts` selects the appropriate model tier
2. **Planning** -- Pi generates a structured plan with steps, files, and acceptance criteria. Optionally asks clarifying questions. Writes a research cache to `.tide/research.md`.
3. **Building** -- Each step executes sequentially with context compaction between steps. Dependency-aware execution via topological sort. Prompts are prefixed with `[tide:orchestrated]` to prevent re-routing.
4. **Reviewing** -- An iterative QA loop checks the output. If configured, runs test commands. May generate findings that trigger additional fix steps (capped at configurable max iterations).
5. **Completion** -- Frontend displays the final status. A heartbeat monitors for stalls (warning after 30s of silence). Cancel button available at any phase.

All orchestration settings are configurable per-project in `.tide/orchestrator-config.json`.

### Session Intelligence

Tide remembers what happened across sessions:

- **Session summaries** -- The agent can call `tide_session_summary` to save a structured summary (files changed, decisions, TODOs) to `.tide/sessions/<timestamp>.md`
- **Project memory** -- Key-value store at `.tide/memory.json` for persistent project facts. Tools: `tide_memory_read`, `tide_memory_write`, `tide_memory_delete`
- **Smart context injection** -- On every agent start, Tide injects prioritized context: TIDE.md rules, pinned tags, active plans, memory entries, and recent session summaries -- all within a token budget
- **Session history UI** -- Browse past sessions in the History tab, expand summaries, and continue from any previous session

## Project Structure

```
tide_code/
  packages/shared/          # Shared types (Zod schemas)
  apps/desktop/
    pi-extensions/          # 8 Pi extensions (routing, planning, indexing, memory, etc.)
    src/                    # React frontend (17 Zustand stores, 30+ components)
    src-tauri/src/          # Rust backend (orchestrator, sidecar, git, pty, indexer)
  scripts/                  # Build, release, sidecar prep scripts
  .tide/                    # Per-project data (index.db, config, memory, sessions, plans)
```

See [PROJECT.md](./PROJECT.md) for the complete file-by-file structure.

## Quick Links

- [QUICKSTART.md](./QUICKSTART.md) -- Development setup and running locally
- [WIN.md](./WIN.md) -- Windows port implementation details
- [PROJECT.md](./PROJECT.md) -- Detailed architecture, data flows, and design decisions

## Requirements

| | macOS | Windows |
|---|---|---|
| **OS** | macOS 12+ | Windows 10/11 |
| **Node.js** | >= 20 | >= 20 |
| **pnpm** | latest | latest |
| **Rust** | stable (via rustup) | stable (via rustup) |
| **Build tools** | Xcode CLT | Visual Studio Build Tools 2022 ("Desktop development with C++" workload) |
| **WebView** | Built-in (WebKit) | WebView2 (pre-installed on Win 10/11) |

Plus at least one LLM API key (Anthropic, OpenAI, or Google) or an OAuth-supported subscription (ChatGPT Plus/Pro, GitHub Copilot, Gemini CLI, etc.).

## License

[MIT](./LICENSE)
