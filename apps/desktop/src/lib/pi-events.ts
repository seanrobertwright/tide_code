import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Pi text streaming delta */
export interface PiTextDelta {
  type: "message_update";
  assistantMessageEvent?: {
    type: "text_delta";
    delta: string;
  };
}

/** Pi tool execution started */
export interface PiToolExecutionStart {
  type: "tool_execution_start";
  toolCallId: string;
  toolName: string;
}

/** Pi tool execution ended */
export interface PiToolExecutionEnd {
  type: "tool_execution_end";
  toolCallId: string;
}

/** Pi agent started processing */
export interface PiAgentStart {
  type: "agent_start";
}

/** Pi agent finished processing */
export interface PiAgentEnd {
  type: "agent_end";
}

/** Pi extension UI request (approval dialog, etc.) */
export interface PiUiRequest {
  type: "extension_ui_request";
  id: string;
  method: string;       // "confirm", "select", "input"
  title: string;
  message: string;
  [key: string]: unknown;
}

/** Pi RPC response */
export interface PiResponse {
  type: "response";
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

/** Union of all Pi event types */
export type PiEvent =
  | PiTextDelta
  | PiToolExecutionStart
  | PiToolExecutionEnd
  | PiAgentStart
  | PiAgentEnd
  | PiUiRequest
  | PiResponse
  | { type: string; [key: string]: unknown }; // catch-all

/** Set up a listener for all Pi events from Tauri. Returns an unlisten function. */
export async function onPiEvent(handler: (event: PiEvent) => void): Promise<UnlistenFn> {
  return listen<PiEvent>("pi_event", (event) => {
    handler(event.payload);
  });
}

/** Listen for Pi ready event (emitted after Pi process connects). */
export async function onPiReady(handler: () => void): Promise<UnlistenFn> {
  return listen("pi_ready", () => handler());
}

/** Set up a listener specifically for Pi UI requests (approvals). */
export async function onPiUiRequest(handler: (event: PiUiRequest) => void): Promise<UnlistenFn> {
  return listen<PiUiRequest>("pi_ui_request", (event) => {
    handler(event.payload);
  });
}
