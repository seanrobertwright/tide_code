# Tide Desktop — Project Highlights

Tide Desktop is a local, IDE-style coding assistant built with **Tauri + React**. It runs the **Pi agent** as a sidecar process and exposes it through a desktop UI for coding workflows.

## What Tide does

- Launches a desktop app named **Tide** (`dev.tide.ide`)
- Starts and manages a **Pi RPC sidecar** process
- Streams agent output and tool events live into the UI
- Lets users:
  - send prompts
  - abort runs
  - steer a running agent
  - queue follow-ups
  - manage sessions (new/switch/fork/rename/export)
- Provides workspace operations:
  - open folder
  - browse file tree
  - read files in Monaco editor
  - inspect git status (branch, staged, changed, untracked)
  - persist region tags to `.tide/tags/tags.json`
- Supports secure API key usage via native keychain integration
- Renders approval dialogs for extension/safety workflows

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Zustand, Monaco Editor
- **Desktop backend:** Rust + Tauri 2
- **Agent runtime:** Pi CLI (`--mode rpc`)
- **Bridge:** Tauri `invoke` commands + event stream (`pi_event`, `pi_ready`, `pi_ui_request`)

## UI layout

Main workspace is organized into:

1. **Explorer** (file tree)
2. **Editor** (tabbed Monaco viewer)
3. **Agent Panel** (chat + logs + tool call cards)

Bottom/top bars expose model selection, thinking level, context/cost indicators, and git summary.

## Notable project capabilities

- Auto-detects provider keys from keychain and injects env vars for Pi
- Loads local Pi extensions (`tide-safety.ts`, `tide-project.ts`)
- Handles extension UI request types: confirm/select/input/editor/notify
- Includes command palette + keyboard shortcuts (e.g. `Cmd+Shift+P`, `Cmd+B`, `Cmd+,`)

## High-level folders

- `src/` — React app (components, stores, IPC client)
- `src-tauri/` — Rust commands, sidecar startup, keychain/git/tag logic
- `pi-extensions/` — runtime extension scripts passed to Pi

## Version snapshot

- Product: **Tide**
- Desktop package: `tide-desktop`
- Version: `0.1.0`
