import { invoke } from "@tauri-apps/api/core";

export interface FsEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size?: number;
}

// ── Pi Agent: Prompting ────────────────────────────────────

/** Send a prompt to the Pi agent. Events stream back via Tauri events. */
export async function sendPrompt(
  text: string,
  images?: { mediaType: string; base64: string }[],
): Promise<void> {
  await invoke("send_prompt", { text, images: images ?? null });
}

/** Start an orchestrated pipeline: Route → Plan → Build → Review.
 *  Progress emitted as `orchestration_event` Tauri events. */
export async function orchestrate(prompt: string): Promise<void> {
  await invoke("orchestrate", { prompt });
}

/** Steer: redirect the agent mid-run with new instructions (after current tool finishes). */
export async function steerAgent(message: string): Promise<void> {
  await invoke("steer_agent", { message });
}

/** Follow-up: queue a message for after the agent finishes its current run. */
export async function followUp(message: string): Promise<void> {
  await invoke("follow_up", { message });
}

/** Abort the current Pi agent operation. */
export async function abortAgent(): Promise<void> {
  await invoke("abort_agent");
}

// ── Pi Agent: State & Config ───────────────────────────────

/** Get Pi connection status. */
export async function getPiStatus(): Promise<string> {
  return invoke<string>("get_pi_status");
}

/** Restart Pi agent (e.g. after changing API keys). */
export async function restartPi(): Promise<void> {
  await invoke("restart_pi");
}

/** Request Pi agent state (model, session info). Response arrives as pi_event. */
export async function getPiState(): Promise<void> {
  await invoke("get_pi_state");
}

// ── Pi Agent: Model Management ─────────────────────────────

/** Set Pi model. Requires provider (e.g. "openai") and modelId (e.g. "gpt-4o"). */
export async function setPiModel(provider: string, modelId: string): Promise<void> {
  await invoke("set_pi_model", { provider, modelId });
}

/** Request available models from Pi. Response arrives as pi_event. */
export async function getAvailableModels(): Promise<void> {
  await invoke("get_available_models");
}

/** Set Pi thinking/reasoning level. */
export async function setThinkingLevel(level: string): Promise<void> {
  await invoke("set_thinking_level", { level });
}

// ── Pi Agent: Session Management ───────────────────────────

/** List available Pi sessions (scans session directory). */
export interface SessionInfo {
  file: string;
  name: string;
  updatedAt?: number;
  messageCount?: number;
}

export async function listSessions(sessionDir?: string): Promise<SessionInfo[]> {
  return invoke<SessionInfo[]>("list_sessions", { sessionDir: sessionDir ?? null });
}

/** Start a new Pi session. */
export async function newSession(): Promise<void> {
  await invoke("new_session");
}

/** Switch to a different Pi session. */
export async function switchSession(sessionFile: string): Promise<void> {
  await invoke("switch_session", { sessionFile });
}

/** Delete a Pi session file. If isActive, Pi will start a fresh session. */
export async function deleteSession(sessionFile: string, isActive = false): Promise<void> {
  await invoke("delete_session", { sessionFile, isActive });
}

/** Fork the current session from this point. */
export async function forkSession(): Promise<void> {
  await invoke("fork_session");
}

/** Set a human-readable session name. */
export async function setSessionName(name: string): Promise<void> {
  await invoke("set_session_name", { name });
}

/** Export session as HTML. */
export async function exportSessionHtml(outputPath: string): Promise<void> {
  await invoke("export_session_html", { outputPath });
}

/** Get session stats (token usage, costs). Response arrives as pi_event. */
export async function getSessionStats(): Promise<void> {
  await invoke("get_session_stats");
}

/** Get conversation messages from Pi. Response arrives as pi_event. */
export async function getMessages(): Promise<void> {
  await invoke("get_messages");
}

/** Get last assistant response text. Response arrives as pi_event. */
export async function getLastAssistantText(): Promise<void> {
  await invoke("get_last_assistant_text");
}

/** Write router config to .tide/router-config.json. */
export async function writeRouterConfig(autoSwitch: boolean): Promise<void> {
  await invoke("write_router_config", { enabled: true, autoSwitch });
}

// ── Pi Agent: Context Management ───────────────────────────

/** Compact the Pi conversation context. */
export async function compactContext(): Promise<void> {
  await invoke("compact_context");
}

/** Toggle auto-compaction. */
export async function setAutoCompaction(enabled: boolean): Promise<void> {
  await invoke("set_auto_compaction", { enabled });
}

/** Toggle auto-retry on transient errors. */
export async function setAutoRetry(enabled: boolean): Promise<void> {
  await invoke("set_auto_retry", { enabled });
}

/** Abort an in-progress retry. */
export async function abortRetry(): Promise<void> {
  await invoke("abort_retry");
}

// ── Pi Agent: Commands & Extensions ────────────────────────

/** Get available extension/skill commands. Response arrives as pi_event. */
export async function getCommands(): Promise<void> {
  await invoke("get_commands");
}

/** Execute a bash command through Pi (added to agent context). */
export async function piBash(command: string): Promise<void> {
  await invoke("pi_bash", { command });
}

/** Abort a running bash command. */
export async function abortBash(): Promise<void> {
  await invoke("abort_bash");
}

// ── Pi Agent: UI Responses ─────────────────────────────────

/** Respond to any Pi extension UI request (confirm, select, input, editor). */
export async function respondUiRequest(
  requestId: string,
  response: Record<string, unknown>,
): Promise<void> {
  await invoke("respond_ui_request", { requestId, response });
}

// ── Native FS Commands ─────────────────────────────────────

/** Open a workspace directory. Returns file listing. */
export async function openWorkspace(path: string): Promise<FsEntry[]> {
  return invoke<FsEntry[]>("open_workspace", { path });
}

/** List directory contents (native Rust). */
export async function fsListDir(path: string): Promise<FsEntry[]> {
  return invoke<FsEntry[]>("fs_list_dir", { path });
}

/** Read a file (native Rust). */
export async function fsReadFile(
  path: string,
): Promise<{ content: string; totalLines: number; language: string }> {
  return invoke("fs_read_file", { path });
}

// ── Search & Replace ───────────────────────────────────────

export interface SearchMatch {
  line: number;
  column: number;
  length: number;
  text: string;
}

export interface SearchFileResult {
  file: string;
  matches: SearchMatch[];
}

export interface ReplaceAllResult {
  filesChanged: number;
  totalReplacements: number;
}

/** Search across files in the workspace. */
export async function fsSearch(params: {
  query: string;
  isRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  includeGlob?: string;
  excludeGlob?: string;
  maxResults?: number;
}): Promise<SearchFileResult[]> {
  return invoke<SearchFileResult[]>("fs_search", {
    query: params.query,
    isRegex: params.isRegex,
    caseSensitive: params.caseSensitive,
    wholeWord: params.wholeWord,
    includeGlob: params.includeGlob ?? null,
    excludeGlob: params.excludeGlob ?? null,
    maxResults: params.maxResults ?? null,
  });
}

/** Replace all occurrences in a single file. Returns replacement count. */
export async function fsReplaceInFile(params: {
  path: string;
  search: string;
  replace: string;
  isRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
}): Promise<number> {
  return invoke<number>("fs_replace_in_file", params);
}

/** Replace across all matching files. */
export async function fsReplaceAll(params: {
  search: string;
  replace: string;
  isRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  includeGlob?: string;
  excludeGlob?: string;
}): Promise<ReplaceAllResult> {
  return invoke<ReplaceAllResult>("fs_replace_all", {
    ...params,
    includeGlob: params.includeGlob ?? null,
    excludeGlob: params.excludeGlob ?? null,
  });
}

// ── File CRUD ──────────────────────────────────────────────

/** Create a new file. */
export async function fsCreateFile(path: string, content?: string): Promise<void> {
  await invoke("fs_create_file", { path, content: content ?? null });
}

/** Create a new directory (recursive). */
export async function fsCreateDir(path: string): Promise<void> {
  await invoke("fs_create_dir", { path });
}

/** Rename/move a file or directory. */
export async function fsRename(oldPath: string, newPath: string): Promise<void> {
  await invoke("fs_rename", { oldPath, newPath });
}

/** Delete a file or directory. */
export async function fsDelete(path: string): Promise<void> {
  await invoke("fs_delete", { path });
}

// ── Region Tags ────────────────────────────────────────────

/** Load all region tags from .tide/tags/tags.json */
export async function tagsLoad(): Promise<unknown[]> {
  return invoke<unknown[]>("tags_load");
}

/** Save all region tags to .tide/tags/tags.json */
export async function tagsSave(tags: unknown[]): Promise<void> {
  await invoke("tags_save", { tags });
}

// ── Permissions ─────────────────────────────────────────────

/** Load permissions from .tide/permissions.json */
export async function permissionsLoad(): Promise<{ permissions: unknown[]; yoloMode: boolean }> {
  return invoke("permissions_load");
}

/** Save permissions to .tide/permissions.json */
export async function permissionsSave(data: { permissions: unknown[]; yoloMode: boolean }): Promise<void> {
  await invoke("permissions_save", { data });
}

// ── Plans ───────────────────────────────────────────────────

/** List all plans from .tide/plans/ */
export async function plansList(): Promise<unknown[]> {
  return invoke<unknown[]>("plans_list");
}

/** Read a single plan by slug */
export async function planRead(slug: string): Promise<unknown> {
  return invoke<unknown>("plan_read", { slug });
}

/** Delete a plan by slug */
export async function planDelete(slug: string): Promise<void> {
  await invoke("plan_delete", { slug });
}

// ── Git ─────────────────────────────────────────────────────

export interface ChangedFile {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "untracked";
}

export async function gitChangedFiles(): Promise<ChangedFile[]> {
  return invoke<ChangedFile[]>("git_changed_files");
}

// ── Code Index ──────────────────────────────────────────────

export interface IndexStats {
  indexed: boolean;
  fileCount: number;
  symbolCount: number;
  lastIndexedAt: string | null;
  indexingInProgress: boolean;
}

export interface IndexFileNode {
  rel_path: string;
  language: string;
  symbol_count: number;
  line_count: number;
}

export interface IndexSymbolOutline {
  symbolId: string;
  name: string;
  qualifiedName: string;
  kind: string;
  startLine: number;
  endLine: number;
  signature: string | null;
  parentSymbolId: string | null;
}

export interface IndexSymbolDetail extends IndexSymbolOutline {
  docstring: string | null;
  body: string;
  filePath: string;
}

export interface IndexRepoOutline {
  root: string;
  totalFiles: number;
  totalSymbols: number;
  files: IndexFileNode[];
}

/** Trigger workspace indexing. */
export async function indexWorkspace(): Promise<IndexStats> {
  return invoke<IndexStats>("index_workspace_cmd");
}

/** Get file tree with symbol counts. */
export async function indexFileTree(): Promise<IndexFileNode[]> {
  return invoke<IndexFileNode[]>("index_file_tree");
}

/** Get symbol outline for a file. */
export async function indexFileOutline(relPath: string): Promise<IndexSymbolOutline[]> {
  return invoke<IndexSymbolOutline[]>("index_file_outline", { relPath });
}

/** Get a specific symbol by ID. */
export async function indexGetSymbol(symbolId: string): Promise<IndexSymbolDetail | null> {
  return invoke<IndexSymbolDetail | null>("index_get_symbol", { symbolId });
}

/** Search symbols by name. */
export async function indexSearchSymbols(
  queryStr: string,
  kind?: string,
  limit?: number,
): Promise<IndexSymbolOutline[]> {
  return invoke<IndexSymbolOutline[]>("index_search_symbols", {
    queryStr,
    kind: kind ?? null,
    limit: limit ?? null,
  });
}

/** Get repo-level outline. */
export async function indexRepoOutline(): Promise<IndexRepoOutline> {
  return invoke<IndexRepoOutline>("index_repo_outline");
}

/** Get index status. */
export async function indexStatus(): Promise<IndexStats> {
  return invoke<IndexStats>("index_status");
}

/** Invalidate index (force re-index). */
export async function indexInvalidate(): Promise<void> {
  await invoke("index_invalidate");
}

// ── Git ────────────────────────────────────────────────────

export interface GitStatusInfo {
  branch: string;
  changed: number;
  staged: number;
  untracked: number;
}

/** Get git status for current workspace. */
export async function getGitStatus(): Promise<GitStatusInfo> {
  return invoke<GitStatusInfo>("git_status");
}

// ── Keychain ───────────────────────────────────────────────

export async function keychainSetKey(provider: string, key: string): Promise<void> {
  await invoke("keychain_set_key", { provider, key });
}

export async function keychainGetKey(provider: string): Promise<string | null> {
  return invoke<string | null>("keychain_get_key", { provider });
}

export async function keychainDeleteKey(provider: string): Promise<void> {
  await invoke("keychain_delete_key", { provider });
}

export async function keychainHasKey(provider: string): Promise<boolean> {
  return invoke<boolean>("keychain_has_key", { provider });
}

// ── Terminal PTY ────────────────────────────────────────────

export async function ptyCreate(cwd?: string): Promise<string> {
  return invoke<string>("pty_create", { cwd: cwd ?? null });
}

export async function ptyAttach(ptyId: string): Promise<void> {
  await invoke("pty_attach", { ptyId });
}

export async function ptyWrite(ptyId: string, data: string): Promise<void> {
  await invoke("pty_write", { ptyId, data });
}

export async function ptyResize(ptyId: string, cols: number, rows: number): Promise<void> {
  await invoke("pty_resize", { ptyId, cols, rows });
}

export async function ptyKill(ptyId: string): Promise<void> {
  await invoke("pty_kill", { ptyId });
}
