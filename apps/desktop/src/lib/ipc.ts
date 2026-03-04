import { invoke } from "@tauri-apps/api/core";

export interface FsEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size?: number;
}

/** Send a prompt to the Pi agent. Events stream back via Tauri events. */
export async function sendPrompt(text: string): Promise<void> {
  await invoke("send_prompt", { text });
}

/** Abort the current Pi agent operation. */
export async function abortAgent(): Promise<void> {
  await invoke("abort_agent");
}

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

/** Respond to a Pi extension UI request (approval dialog). */
export async function respondUiRequest(
  requestId: string,
  confirmed: boolean,
): Promise<void> {
  await invoke("respond_ui_request", { requestId, confirmed });
}

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

// ── Git ─────────────────────────────────────────────────────

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
