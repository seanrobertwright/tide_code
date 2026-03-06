import { create } from "zustand";
import type { PiEvent } from "../lib/pi-events";
import { useContextStore } from "./contextStore";
import { useLogStore } from "./logStore";
import { useWorkspaceStore } from "./workspace";
import { getMessages, getPiState, getSessionStats, setSessionName } from "../lib/ipc";
import { useOrchestrationStore } from "./orchestrationStore";

/** Get current orchestration phase without triggering React re-renders. */
function getOrcPhase() {
  return useOrchestrationStore.getState().phase;
}

// ── Message Types ───────────────────────────────────────────

export interface UserMessage {
  role: "user";
  id: string;
  content: string;
  timestamp: number;
}

export interface AssistantMessage {
  role: "assistant";
  id: string;
  content: string;
  timestamp: number;
  streaming: boolean;
  modelName?: string;
}

export interface SystemMessage {
  role: "system";
  id: string;
  content: string;
  timestamp: number;
  icon?: "model" | "router" | "info";
}

export interface ToolCallMessage {
  role: "tool_call";
  id: string;
  toolCallId: string;
  toolName: string;
  status: "running" | "completed" | "error";
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  argsJson?: string;
  resultJson?: string;
  error?: string;
}

export interface ThinkingMessage {
  role: "thinking";
  id: string;
  timestamp: number;
}

export type ChatMessage = UserMessage | AssistantMessage | ToolCallMessage | ThinkingMessage | SystemMessage;

export interface AvailableModel {
  id: string;
  name: string;
  provider: string;
}

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface SessionStats {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalCost?: number;
  messageCount?: number;
}

// ── Store ───────────────────────────────────────────────────

export type SessionStatus = "idle" | "loading" | "active" | "switching";

interface StreamState {
  messages: ChatMessage[];
  isStreaming: boolean;
  agentActive: boolean;
  modelName: string;
  modelProvider: string;
  modelId: string;
  availableModels: AvailableModel[];
  thinkingLevel: ThinkingLevel;
  sessionStats: SessionStats;
  isCompacting: boolean;
  isRetrying: boolean;
  turnCount: number;
  sessionId: string;
  sessionName: string;
  sessionDir: string;
  contextWindow: number;
  hasAutoTitled: boolean;
  sessionStatus: SessionStatus;
  _agentStartMsgCount: number;

  handlePiEvent: (event: PiEvent) => void;
  addUserMessage: (content: string) => void;
  clearMessages: () => void;
}

/** Generate a session title from the first user message (local heuristic). */
function generateSessionTitle(text: string): string {
  let t = text;
  t = t.replace(/```[\s\S]*?```/g, "");
  t = t.replace(/`[^`]+`/g, "");
  t = t.replace(/#{1,6}\s*/g, "");
  t = t.replace(/\*{1,2}(.*?)\*{1,2}/g, "$1");
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  t = t.replace(/!\[.*?\]\(.*?\)/g, "");
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return "New Chat";
  if (t.length > 60) {
    const cut = t.lastIndexOf(" ", 60);
    t = t.slice(0, cut > 20 ? cut : 60) + "...";
  }
  return t;
}

let msgCounter = 0;
function nextId() {
  return `msg-${++msgCounter}-${Date.now()}`;
}

export const useStreamStore = create<StreamState>((set, get) => ({
  messages: [],
  isStreaming: false,
  agentActive: false,
  modelName: "",
  modelProvider: "",
  modelId: "",
  availableModels: [],
  thinkingLevel: "medium" as ThinkingLevel,
  sessionStats: {},
  isCompacting: false,
  isRetrying: false,
  turnCount: 0,
  sessionId: "",
  sessionName: "",
  sessionDir: "",
  contextWindow: 200000,
  hasAutoTitled: false,
  sessionStatus: "idle" as SessionStatus,
  _agentStartMsgCount: 0,

  addUserMessage: (content: string) => {
    set((state) => ({
      messages: [
        ...state.messages,
        {
          role: "user" as const,
          id: nextId(),
          content,
          timestamp: Date.now(),
        },
      ],
    }));
  },

  clearMessages: () => set({ messages: [], hasAutoTitled: false }),

  handlePiEvent: (event: PiEvent) => {
    // Top-level event trace for debugging router ↔ model sync
    if (event.type === "model_select" || event.type === "agent_start" || event.type === "agent_end" || event.type === "message_end") {
      console.debug(`[Tide:event] ${event.type}`, event.type === "model_select" ? event : "");
    }

    switch (event.type) {
      case "agent_start": {
        console.debug("[Tide:event] agent_start — msgCount:", get().messages.length, "model:", get().modelName);
        const thinkingId = nextId();
        set((state) => ({
          agentActive: true,
          isStreaming: true,
          _agentStartMsgCount: state.messages.length,
          messages: [
            ...state.messages,
            { role: "thinking" as const, id: thinkingId, timestamp: Date.now() },
          ],
        }));
        // Proactively refresh model info — the router extension may have called
        // setModel() in before_agent_start, but Pi may not emit model_select.
        getPiState().catch(() => {});
        break;
      }

      case "agent_end": {
        const startCount = get()._agentStartMsgCount ?? 0;
        // Remove thinking indicator, mark current assistant message as done
        set((state) => {
          const cleaned = state.messages
            .filter((m) => m.role !== "thinking")
            .map((m) =>
              m.role === "assistant" && m.streaming
                ? { ...m, streaming: false }
                : m,
            );
          // Detect silent failure: no assistant text received during this agent turn
          const hasResponse = cleaned.slice(startCount).some(
            (m) => m.role === "assistant" && (m as AssistantMessage).content.trim().length > 0
          );
          console.debug("[Tide:event] agent_end — msgCount:", cleaned.length, "hasResponse:", hasResponse);
          if (!hasResponse && startCount > 0) {
            console.warn("[Tide] No assistant response received from model — possible silent failure");
            cleaned.push({
              role: "system" as const,
              id: nextId(),
              content: "No response received from model. The model may have returned an empty response or the connection was interrupted.",
              timestamp: Date.now(),
              icon: "info" as const,
            });
          }
          return {
            agentActive: false,
            isStreaming: false,
            messages: cleaned,
          };
        });
        // Refresh model info + context usage after agent completes
        getPiState().catch(() => {});
        getSessionStats().catch(() => {});
        // Auto-title: generate from first user message if no name set yet
        if (!get().hasAutoTitled && !get().sessionName) {
          const firstUserMsg = get().messages.find(m => m.role === "user");
          if (firstUserMsg && firstUserMsg.role === "user") {
            const title = generateSessionTitle(firstUserMsg.content);
            set({ sessionName: title, hasAutoTitled: true });
            setSessionName(title).catch(() => {});
          }
        }
        break;
      }

      case "message_update": {
        const raw = event as any;
        const ame = raw.assistantMessageEvent;
        // Try multiple possible shapes for text content
        const delta = ame?.type === "text_delta" ? (ame.delta ?? ame.text)
          : ame?.type === "content_block_delta" ? (ame.delta?.text ?? ame.text)
          : ame?.text ?? ame?.delta
          ?? raw.text ?? raw.delta ?? raw.content ?? null;
        if (typeof delta === "string") {
          // Log first delta only to confirm text is arriving
          const isFirst = !get().messages.some(m => m.role === "assistant" && (m as AssistantMessage).streaming);
          if (isFirst) {
            console.debug(`[Tide:event] message_update — first delta, len=${delta.length}, type=${ame?.type || "raw"}`);
          }
          set((state) => {
            const msgs = [...state.messages];
            // Remove thinking indicator when first text arrives
            const thinkingIdx = msgs.findIndex((m) => m.role === "thinking");
            if (thinkingIdx !== -1) {
              msgs.splice(thinkingIdx, 1);
            }
            // Find or create streaming assistant message
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg?.role === "assistant" && lastMsg.streaming) {
              msgs[msgs.length - 1] = {
                ...lastMsg,
                content: lastMsg.content + delta,
              };
            } else {
              msgs.push({
                role: "assistant" as const,
                id: nextId(),
                content: delta,
                timestamp: Date.now(),
                streaming: true,
                modelName: get().modelName || undefined,
              });
            }
            return { messages: msgs };
          });
        }
        break;
      }

      case "tool_execution_start": {
        const e = event as any;
        const callId = e.toolCallId || e.tool_call_id || "";
        const toolName = e.toolName || e.tool_name || "unknown";
        const argsJson = e.args ? JSON.stringify(e.args) : e.argsJson;

        set((state) => {
          const msgs = [...state.messages];
          // Insert tool call before the thinking indicator (if any)
          const thinkingIdx = msgs.findIndex((m) => m.role === "thinking");
          const toolMsg: ToolCallMessage = {
            role: "tool_call" as const,
            id: nextId(),
            toolCallId: callId,
            toolName,
            status: "running",
            startedAt: Date.now(),
            argsJson,
          };
          if (thinkingIdx !== -1) {
            msgs.splice(thinkingIdx, 0, toolMsg);
          } else {
            msgs.push(toolMsg);
          }
          return { messages: msgs };
        });

        // Wire to logStore
        useLogStore.getState().addToolStart(callId, toolName, { argsJson });
        break;
      }

      case "tool_execution_end": {
        const e = event as any;
        const callId = e.toolCallId || e.tool_call_id || "";
        const now = Date.now();

        set((state) => ({
          messages: state.messages.map((m) =>
            m.role === "tool_call" && m.toolCallId === callId
              ? {
                  ...m,
                  status: (e.error ? "error" : "completed") as "error" | "completed",
                  completedAt: now,
                  durationMs: now - m.startedAt,
                  resultJson: e.result ? JSON.stringify(e.result) : e.resultJson,
                  error: e.error,
                }
              : m,
          ),
        }));

        useLogStore.getState().completeToolLog(callId, {
          resultJson: e.result ? JSON.stringify(e.result) : e.resultJson,
          error: e.error,
        });

        // Refresh file tree when file-modifying tools complete
        const toolName = e.toolName || e.tool_name || "";
        if (["write", "edit", "create", "delete", "rename", "move"].some(t => toolName.toLowerCase().includes(t))) {
          useWorkspaceStore.getState().refreshFileTree();
        }
        break;
      }

      case "response": {
        const e = event as any;
        const cmd = e.command as string;


        switch (cmd) {
          case "get_available_models": {
            if (Array.isArray(e.data?.models)) {
              const models: AvailableModel[] = e.data.models
                .map((m: any) => ({
                  id: String(m.id || m.name || ""),
                  name: String(m.name || m.id || ""),
                  provider: String(m.provider || "unknown"),
                }));
              set({ availableModels: models });
            } else if (e.data && !e.success) {
              console.warn("[Tide] Failed to load models:", e.error);
            }
            break;
          }

          case "get_state": {
            const updates: Partial<StreamState> = {};
            console.debug("[Tide:response] get_state — model:", e.data?.model?.id || e.data?.model, "session:", e.data?.sessionFile || e.data?.sessionId);

            if (e.data?.model) {
              const m = e.data.model;
              const name = typeof m === "string" ? m : String(m.name || m.id || "unknown");
              const provider = typeof m === "object" ? String(m.provider || "") : "";
              const id = typeof m === "object" ? String(m.id || "") : "";
              updates.modelName = name;
              updates.modelProvider = provider;
              updates.modelId = id;
              // Extract contextWindow from model object (Pi returns model.contextWindow)
              if (typeof m === "object" && m.contextWindow) {
                updates.contextWindow = Number(m.contextWindow);
              }
              console.debug(`[Tide] Model: ${provider}/${id} "${name}" (ctx: ${(updates as any).contextWindow ?? "unchanged"})`);
            }
            if (e.data?.thinkingLevel) {
              updates.thinkingLevel = e.data.thinkingLevel as ThinkingLevel;
            }
            if (e.data?.sessionId) updates.sessionId = e.data.sessionId;
            if (e.data?.sessionName) updates.sessionName = e.data.sessionName;
            if (e.data?.sessionFile) {
              const sf = String(e.data.sessionFile);
              updates.sessionId = sf;
              // Derive session directory from sessionFile path
              const lastSlash = sf.lastIndexOf("/");
              if (lastSlash > 0) {
                updates.sessionDir = sf.substring(0, lastSlash);
              }
              console.debug(`[Tide] Session: ${sf}`);
            } else {
            }
            if (e.data?.isCompacting != null) updates.isCompacting = e.data.isCompacting;

            // Also try top-level contextWindow (Pi may return it outside the model object)
            if (!updates.contextWindow && e.data?.contextWindow) {
              updates.contextWindow = Number(e.data.contextWindow);
            }
            // Set sessionStatus to active when we get state (means Pi is ready)
            updates.sessionStatus = "active";

            set(updates);

            // Update context indicator with real data
            if (updates.contextWindow) {
              const stats = get().sessionStats;
              if (stats.totalTokens) {
                useContextStore.getState().updateFromPiState(stats.totalTokens, updates.contextWindow);
              }
            }
            break;
          }

          case "set_model": {
            console.debug("[Tide:response] set_model — success:", e.success, "data:", e.data);
            if (e.success && e.data) {
              const m = e.data;
              const name = typeof m === "string" ? m : String(m.name || m.id || "unknown");
              const provider = typeof m === "object" ? String(m.provider || "") : "";
              const id = typeof m === "object" ? String(m.id || "") : "";
              const prevModel = get().modelName;
              const prevProvider = get().modelProvider;
              const updates: Partial<StreamState> = { modelName: name, modelProvider: provider, modelId: id };
              // Opportunistically extract contextWindow if present in set_model response
              if (typeof m === "object" && m.contextWindow) {
                updates.contextWindow = Number(m.contextWindow);
              }
              set(updates);
              // If contextWindow changed, recalculate context indicator immediately
              if (updates.contextWindow) {
                const stats = get().sessionStats;
                if (stats.totalTokens) {
                  useContextStore.getState().updateFromPiState(stats.totalTokens, updates.contextWindow);
                }
              }
              console.log(`[Tide] Model switched: ${prevProvider}/${prevModel} → ${provider}/${id}`);
              // Insert system message in chat when model changes
              if (prevModel && prevModel !== name) {
                set((state) => ({
                  messages: [
                    ...state.messages,
                    {
                      role: "system" as const,
                      id: nextId(),
                      content: `Switched to ${name}`,
                      timestamp: Date.now(),
                      icon: "model" as const,
                    },
                  ],
                }));
              }
            } else if (!e.success) {
              console.error(`[Tide] set_model failed:`, e.error);
            }
            break;
          }

          case "set_thinking_level": {
            console.debug("[Tide] Thinking level updated:", e.data);
            if (e.success && e.data?.level) {
              set({ thinkingLevel: e.data.level as ThinkingLevel });
            }
            break;
          }

          case "get_session_stats": {
            if (e.data) {
              const d = e.data;
              // Pi returns: { tokens: { input, output, cacheRead, cacheWrite, total }, cost: number, totalMessages, ... }
              const tokens = d.tokens || {};
              const totalTokens = typeof tokens === "number" ? tokens : (tokens.total ?? ((tokens.input || 0) + (tokens.output || 0)));
              const inputTokens = typeof tokens === "object" ? (tokens.input ?? tokens.inputTokens) : undefined;
              const outputTokens = typeof tokens === "object" ? (tokens.output ?? tokens.outputTokens) : undefined;
              const cacheReadTokens = typeof tokens === "object" ? (tokens.cacheRead ?? tokens.cacheReadTokens) : undefined;
              const cacheWriteTokens = typeof tokens === "object" ? (tokens.cacheWrite ?? tokens.cacheWriteTokens) : undefined;
              const totalCost = typeof d.cost === "number" ? d.cost : (d.cost?.total ?? d.totalCost ?? 0);

              set({
                sessionStats: {
                  totalTokens,
                  inputTokens,
                  outputTokens,
                  cacheReadTokens,
                  cacheWriteTokens,
                  totalCost,
                  messageCount: d.totalMessages ?? d.messageCount ?? d.message_count,
                },
              });

              // Update context indicator with real token data
              const ctxWindow = get().contextWindow;
              useContextStore.getState().updateFromPiState(totalTokens, ctxWindow);
            }
            break;
          }

          case "new_session": {
            if (e.success) {
              // During orchestration, don't clear messages — the orchestrator
              // creates fresh sessions for each build step internally.
              const orcPhase = getOrcPhase();
              const isOrchestrating = orcPhase !== "idle" && orcPhase !== "complete" && orcPhase !== "failed";

              if (isOrchestrating) {
                // Just update session ID silently
                set({
                  sessionId: e.data?.sessionId || e.data?.sessionPath || "",
                });
              } else {
                set({
                  messages: [],
                  sessionName: "",
                  sessionStats: {},
                  hasAutoTitled: false,
                  sessionStatus: "active",
                  sessionId: e.data?.sessionId || e.data?.sessionPath || "",
                });
                // Reset context indicator immediately (fresh session = 0 tokens)
                useContextStore.getState().updateFromPiState(0, get().contextWindow);
                getSessionStats().catch(() => {});
              }
            }
            break;
          }

          case "switch_session": {
            if (e.success) {
              set({
                messages: [],
                sessionId: e.data?.sessionId || e.data?.sessionPath || "",
                sessionName: e.data?.sessionName || "",
                hasAutoTitled: false,
                sessionStatus: "loading",
              });
              // Reset context immediately; getSessionStats will correct it
              useContextStore.getState().updateFromPiState(0, get().contextWindow);
              // Re-fetch messages for the switched session
              getMessages().catch(() => {});
              getSessionStats().catch(() => {});
            }
            break;
          }

          case "get_messages": {
            // Restore chat history from Pi's session
            if (e.success && e.data) {
              const rawMessages = Array.isArray(e.data) ? e.data : (e.data.messages || []);
              if (rawMessages.length > 0 && get().messages.length === 0) {
                const restored: ChatMessage[] = [];
                for (const msg of rawMessages) {
                  const role = msg.role || msg.type;
                  if (role === "user" && msg.content) {
                    const text = typeof msg.content === "string"
                      ? msg.content
                      : Array.isArray(msg.content)
                        ? msg.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("")
                        : "";
                    if (text) {
                      restored.push({
                        role: "user",
                        id: nextId(),
                        content: text,
                        timestamp: msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now(),
                      });
                    }
                  } else if (role === "assistant" && msg.content) {
                    const text = typeof msg.content === "string"
                      ? msg.content
                      : Array.isArray(msg.content)
                        ? msg.content.filter((p: any) => p.type === "text" || p.type === "output_text").map((p: any) => p.text).join("")
                        : "";
                    if (text) {
                      restored.push({
                        role: "assistant",
                        id: nextId(),
                        content: text,
                        timestamp: msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now(),
                        streaming: false,
                      });
                    }
                  }
                }
                if (restored.length > 0) {
                  console.debug(`[Tide] Restored ${restored.length} messages`);
                  // If session already has a name, mark auto-titled to prevent re-titling
                  const alreadyNamed = !!get().sessionName;
                  set({ messages: restored, sessionStatus: "active", hasAutoTitled: alreadyNamed });
                } else {
                  set({ sessionStatus: "active" });
                }
              }
            }
            break;
          }

          case "compact": {
            set({ isCompacting: false });
            if (e.success) {
              console.log("[Tide] Context compacted successfully");
              // Refresh session stats to get updated token count
              getSessionStats().catch(() => {});
            } else {
              console.error("[Tide] Compact failed:", e.error);
            }
            break;
          }

          default: {
            // Fallback: try to extract model info from any response with model data
            if (e.data?.model && !cmd) {
              const m = e.data.model;
              const name = typeof m === "string" ? m : String(m.name || m.id || "unknown");
              set({ modelName: name });
            }
            // Fallback: try to extract models list from any response
            if (Array.isArray(e.data?.models) && !cmd) {
              const models: AvailableModel[] = e.data.models.map((m: any) => ({
                id: String(m.id || m.name || ""),
                name: String(m.name || m.id || ""),
                provider: String(m.provider || "unknown"),
              }));
              if (models.length > 0) set({ availableModels: models });
            }
            break;
          }
        }
        break;
      }

      case "message_start": {
        // Pi sends message_start before each LLM message — informational only
        break;
      }

      case "message_end": {
        // Some models don't stream text_delta — the full text arrives here.
        // If text was already streamed via message_update, skip to avoid duplication.
        const endMsg = (event as any).message;
        console.debug("[Tide:event] message_end — hasMessage:", !!endMsg, "role:", endMsg?.role);
        if (endMsg) {
          let text = "";
          if (typeof endMsg.content === "string") {
            text = endMsg.content;
          } else if (Array.isArray(endMsg.content)) {
            for (const part of endMsg.content) {
              if (part.type === "text" && typeof part.text === "string") {
                text += part.text;
              } else if (part.type === "output_text" && typeof part.text === "string") {
                text += part.text;
              }
            }
          }
          if (text.trim() && endMsg.role === "assistant") {
            set((state) => {
              const msgs = [...state.messages];
              // Remove thinking indicator
              const thinkingIdx = msgs.findIndex((m) => m.role === "thinking");
              if (thinkingIdx !== -1) msgs.splice(thinkingIdx, 1);
              // Find the last assistant message (may not be at the very end
              // if tool_call messages were inserted after it)
              let lastAssistantIdx = -1;
              for (let i = msgs.length - 1; i >= 0; i--) {
                if (msgs[i].role === "assistant" && (msgs[i] as AssistantMessage).streaming) {
                  lastAssistantIdx = i;
                  break;
                }
              }
              if (lastAssistantIdx !== -1) {
                const lastAssistant = msgs[lastAssistantIdx] as AssistantMessage;
                if (!lastAssistant.content.trim()) {
                  // Empty streaming message — fill with message_end text
                  msgs[lastAssistantIdx] = { ...lastAssistant, content: text };
                }
                // else: already has content from message_update — skip
              } else {
                // No streaming assistant message — create one (non-streaming model path)
                msgs.push({
                  role: "assistant" as const,
                  id: nextId(),
                  content: text,
                  timestamp: Date.now(),
                  streaming: true,
                  modelName: get().modelName || undefined,
                });
              }
              return { messages: msgs };
            });
          }
        }
        break;
      }

      case "turn_start": {
        set((state) => ({ turnCount: state.turnCount + 1 }));
        break;
      }

      case "turn_end": {
        break;
      }

      case "auto_compaction_start": {
        set({ isCompacting: true });
        console.log("[Tide] Context compaction started...");
        break;
      }

      case "auto_compaction_end": {
        set({ isCompacting: false });
        console.log("[Tide] Context compaction completed");
        break;
      }

      case "auto_retry_start": {
        const retryEvent = event as any;
        const reason = retryEvent.reason || retryEvent.error || retryEvent.message || "";
        set({ isRetrying: true });
        console.warn("[Tide] Auto-retry started:", reason || "(no reason given)");
        break;
      }

      case "auto_retry_end": {
        set({ isRetrying: false });
        console.log("[Tide] Auto-retry completed");
        break;
      }

      case "extension_error": {
        const e = event as any;
        console.error("[Tide] Extension error:", e.error || e.message || e);
        break;
      }

      case "model_select": {
        // Pi extension or user switched models — update UI state
        const e = event as any;
        const model = e.model;
        if (model) {
          const name = String(model.name || model.id || "unknown");
          const provider = String(model.provider || "");
          const id = String(model.id || "");
          const prevModel = get().modelName;
          const updates: Partial<StreamState> = { modelName: name, modelProvider: provider, modelId: id };
          if (model.contextWindow) updates.contextWindow = Number(model.contextWindow);
          set(updates);
          console.debug(`[Tide] model_select: ${prevModel} → ${provider}/${id} "${name}"`);

          // Fix 1: Update modelName on any currently-streaming assistant message
          // so the badge reflects the routed model, not the old one
          set((state) => ({
            messages: state.messages.map((m) =>
              m.role === "assistant" && (m as AssistantMessage).streaming
                ? { ...m, modelName: name }
                : m
            ),
          }));

          if (prevModel && prevModel !== name) {
            set((state) => ({
              messages: [
                ...state.messages,
                {
                  role: "system" as const,
                  id: nextId(),
                  content: `Switched to ${name}`,
                  timestamp: Date.now(),
                  icon: "model" as const,
                },
              ],
            }));
          }
          // Update context indicator
          if (updates.contextWindow) {
            const stats = get().sessionStats;
            if (stats.totalTokens) {
              useContextStore.getState().updateFromPiState(stats.totalTokens, updates.contextWindow);
            }
          }
          // Fix 3: Proactively refresh full state to ensure contextWindow is synced
          getPiState().catch(() => {});
        }
        break;
      }

      case "tool_execution_update": {
        break;
      }

      default:
        break;
    }
  },
}));
