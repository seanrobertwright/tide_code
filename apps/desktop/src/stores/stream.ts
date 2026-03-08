import { create } from "zustand";
import type { PiEvent } from "../lib/pi-events";
import { useContextStore } from "./contextStore";
import { useLogStore } from "./logStore";
import { useWorkspaceStore } from "./workspace";
import { followUp, getMessages, getPiState, getSessionStats, setSessionName } from "../lib/ipc";
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
  executionStatus?: "analyzed" | "executed_no_changes" | "changed_files";
  changedFiles?: string[];
}

export interface SystemMessage {
  role: "system";
  id: string;
  content: string;
  timestamp: number;
  icon?: "model" | "router" | "info" | "error";
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

export interface PiCommand {
  name: string;
  description?: string;
  type?: string;
}

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

export type SessionStatus = "idle" | "loading" | "active";

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
  piCommands: PiCommand[];
  _agentStartMsgCount: number;
  _emptyRetryCount: number;

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

function extractChangedFilePath(toolName: string, argsJson?: string): string | undefined {
  if (!argsJson) return undefined;
  let parsed: any;
  try { parsed = JSON.parse(argsJson); } catch { return undefined; }

  const lower = toolName.toLowerCase();
  if (lower.includes("write") || lower.includes("edit") || lower.includes("read")) {
    const p = parsed?.path;
    return typeof p === "string" && p.trim().length > 0 ? p : undefined;
  }
  return undefined;
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
  piCommands: [],
  _agentStartMsgCount: 0,
  _emptyRetryCount: 0,

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
    // Event trace (only when devtools are open)
    if (event.type === "model_select") {
      console.debug(`[Tide:event] ${event.type}`, event);
    }

    switch (event.type) {
      case "agent_start": {
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
        const retryCount = get()._emptyRetryCount;

        // Build cleaned messages: remove thinking, mark streaming done
        const cleaned = get().messages
          .filter((m) => m.role !== "thinking")
          .map((m) => {
            if (m.role === "assistant") {
              const am = m as AssistantMessage;
              return {
                ...am,
                streaming: false,
                executionStatus: am.executionStatus ?? "analyzed",
              };
            }
            return m;
          });

        // Check if we got a real response during this agent turn
        const newMsgs = cleaned.slice(startCount);
        const hasAssistantText = newMsgs.some(
          (m) => m.role === "assistant" && (m as AssistantMessage).content.trim().length > 0
        );
        const hasToolCalls = newMsgs.some((m) => m.role === "tool_call");
        const hasErrorMsg = newMsgs.some(
          (m) => m.role === "system" && (m as SystemMessage).icon === "error"
        );

        if (!hasAssistantText && !hasToolCalls && !hasErrorMsg && startCount > 0 && retryCount < 1) {
          // Empty response on first attempt — auto-retry once
          console.warn("[Tide] Empty response from model — auto-retrying");
          set({
            _emptyRetryCount: retryCount + 1,
            messages: cleaned,
            // Keep streaming state active for the retry
          });
          setTimeout(() => {
            followUp("Please respond to my previous message.").catch((err) => {
              console.error("[Tide] Auto-retry failed:", err);
              set((s) => ({
                agentActive: false,
                isStreaming: false,
                _emptyRetryCount: 0,
                messages: [
                  ...s.messages.filter((m) => m.role !== "thinking"),
                  {
                    role: "system" as const,
                    id: nextId(),
                    content: "No response received from model. The model may have returned an empty response or the connection was interrupted.",
                    timestamp: Date.now(),
                    icon: "info" as const,
                  },
                ],
              }));
            });
          }, 500);
          break; // Don't run post-agent cleanup — retry will trigger another agent_end
        }

        // Reset retry counter on success or final failure
        if (hasAssistantText || hasToolCalls) {
          set({ _emptyRetryCount: 0 });
        }

        // Final failure after retry — show error (unless error already surfaced)
        if (!hasAssistantText && !hasToolCalls && !hasErrorMsg && startCount > 0) {
          console.warn("[Tide] No assistant response after retry — giving up");
          cleaned.push({
            role: "system" as const,
            id: nextId(),
            content: "No response received from model. The model may have returned an empty response or the connection was interrupted.",
            timestamp: Date.now(),
            icon: "info" as const,
          });
        }

        set({
          agentActive: false,
          isStreaming: false,
          messages: cleaned,
          _emptyRetryCount: 0,
        });

        // Refresh model info + context usage + category breakdown after agent completes
        getPiState().catch(() => {});
        getSessionStats().catch(() => {});
        useContextStore.getState().refreshCategories();

        // Auto-compact if enabled and usage exceeds threshold
        {
          const ctxState = useContextStore.getState();
          if (ctxState.autoCompactEnabled && ctxState.breakdown) {
            const usage = ctxState.breakdown.usagePercent;
            if (usage >= ctxState.autoCompactThreshold) {
              console.log(`[Tide] Auto-compacting context (usage: ${Math.round(usage * 100)}%)`);
              import("../lib/ipc").then(({ compactContext }) => {
                ctxState.setPreCompactTokens(ctxState.breakdown!.totalTokens);
                set({ isCompacting: true });
                compactContext().catch(() => set({ isCompacting: false }));
              });
            }
          }
        }
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

        // Handle thinking_delta — keep thinking indicator visible (no text to display)
        if (ame?.type === "thinking_start" || ame?.type === "thinking_delta" || ame?.type === "thinking_end") {
          // Thinking is happening — ensure thinking indicator is shown
          if (ame.type === "thinking_start") {
            set((state) => {
              const hasThinking = state.messages.some(m => m.role === "thinking");
              if (hasThinking) return state;
              return { messages: [...state.messages, { role: "thinking" as const, id: nextId(), timestamp: Date.now() }] };
            });
          }
          break;
        }

        // Handle toolcall_delta — tool args streaming (informational, tool_execution_start handles UI)
        if (ame?.type === "toolcall_start" || ame?.type === "toolcall_delta" || ame?.type === "toolcall_end") {
          break;
        }

        // Try multiple possible shapes for text content
        const delta = ame?.type === "text_delta" ? (ame.delta ?? ame.text)
          : ame?.type === "content_block_delta" ? (ame.delta?.text ?? ame.text)
          : ame?.text ?? ame?.delta
          ?? raw.text ?? raw.delta ?? raw.content ?? null;
        if (typeof delta === "string") {
          set((state) => {
            const msgs = state.messages;
            const lastMsg = msgs[msgs.length - 1];

            // FAST PATH: last message is already a streaming assistant — only replace it
            if (lastMsg?.role === "assistant" && (lastMsg as AssistantMessage).streaming) {
              const newMsgs = msgs.slice();
              newMsgs[newMsgs.length - 1] = {
                ...lastMsg,
                content: (lastMsg as AssistantMessage).content + delta,
              };
              return { messages: newMsgs };
            }

            // SLOW PATH (first delta): remove thinking indicator + create assistant message
            const newMsgs = msgs.filter(m => m.role !== "thinking");
            newMsgs.push({
              role: "assistant" as const,
              id: nextId(),
              content: delta,
              timestamp: Date.now(),
              streaming: true,
              modelName: get().modelName || undefined,
            });
            return { messages: newMsgs };
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
        const toolName = String(e.toolName || e.tool_name || "");
        const resultJson = e.result ? JSON.stringify(e.result) : e.resultJson;

        set((state) => {
          const updatedMessages = state.messages.map((m) =>
            m.role === "tool_call" && m.toolCallId === callId
              ? {
                  ...m,
                  status: (e.error ? "error" : "completed") as "error" | "completed",
                  completedAt: now,
                  durationMs: now - m.startedAt,
                  resultJson,
                  error: e.error,
                }
              : m,
          );

          // Extract changed file path for tab reload and execution summary
          const changedPath = extractChangedFilePath(toolName, (updatedMessages.find((m) => m.role === "tool_call" && (m as ToolCallMessage).toolCallId === callId) as ToolCallMessage | undefined)?.argsJson);

          // Attach execution summary to the latest assistant message for better UX clarity
          const assistantIdx = [...updatedMessages].reverse().findIndex((m) => m.role === "assistant");
          if (assistantIdx !== -1) {
            const realIdx = updatedMessages.length - 1 - assistantIdx;
            const assistant = updatedMessages[realIdx] as AssistantMessage;
            const lower = toolName.toLowerCase();
            const isFileMutating = ["write", "edit", "create", "delete", "rename", "move"].some((t) => lower.includes(t));
            const didSucceed = !e.error;

            const prevFiles = assistant.changedFiles ?? [];
            const nextFiles = changedPath && !prevFiles.includes(changedPath) ? [...prevFiles, changedPath] : prevFiles;

            const nextStatus: AssistantMessage["executionStatus"] = didSucceed
              ? (isFileMutating ? "changed_files" : "executed_no_changes")
              : assistant.executionStatus ?? "analyzed";

            updatedMessages[realIdx] = {
              ...assistant,
              executionStatus: nextStatus,
              changedFiles: nextFiles,
            };
          }

          return { messages: updatedMessages };
        });

        useLogStore.getState().completeToolLog(callId, {
          resultJson,
          error: e.error,
        });

        // Refresh file tree and reload open tabs when file-modifying tools complete
        if (["write", "edit", "create", "delete", "rename", "move"].some(t => toolName.toLowerCase().includes(t))) {
          useWorkspaceStore.getState().refreshFileTree();
          // Extract changed path from the tool call args for targeted tab reload
          const toolMsg = get().messages.find((m) => m.role === "tool_call" && (m as ToolCallMessage).toolCallId === callId) as ToolCallMessage | undefined;
          const filePath = extractChangedFilePath(toolName, toolMsg?.argsJson);
          useWorkspaceStore.getState().reloadTabsFromDisk(filePath);
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
              useContextStore.getState().updateFromPiState(stats.totalTokens || 0, updates.contextWindow);
            }
            break;
          }

          case "set_model": {
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
            if (e.data?.cancelled) {
              console.warn("[Tide] new_session was cancelled by Pi");
              break;
            }
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
                useContextStore.setState({ warningDismissedAt: 0 });
                getSessionStats().catch(() => {});
              }
            }
            break;
          }

          case "switch_session": {
            if (e.data?.cancelled) {
              console.warn("[Tide] switch_session was cancelled by Pi");
              break;
            }
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
              // Re-fetch messages, stats, and category breakdown for the switched session
              getMessages().catch(() => {});
              getSessionStats().catch(() => {});
              // Refresh Pi state after a brief delay to get authoritative context usage
              setTimeout(() => {
                getPiState().catch(() => {});
                useContextStore.getState().refreshCategories();
              }, 300);
              // Reset warning state for new session
              useContextStore.setState({ warningDismissedAt: 0 });
            }
            break;
          }

          case "get_messages": {
            // Restore chat history from Pi's session
            if (e.success && e.data) {
              const rawMessages = Array.isArray(e.data) ? e.data : (e.data.messages || []);
              console.debug(`[Tide] get_messages: ${rawMessages.length} raw messages, ${get().messages.length} current messages`);
              // Only skip restoration if we already have user/assistant messages (not just system messages)
              const hasRealMessages = get().messages.some(m => m.role === "user" || m.role === "assistant");
              if (rawMessages.length > 0 && !hasRealMessages) {
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
              // Show before/after feedback
              const ctxState = useContextStore.getState();
              const pre = ctxState.preCompactTokens;
              if (pre && pre > 0) {
                // Wait for stats to update, then compute savings
                setTimeout(() => {
                  const post = useContextStore.getState().breakdown?.totalTokens ?? 0;
                  ctxState.setPostCompactTokens(post);
                  if (post < pre) {
                    const savedPct = Math.round((1 - post / pre) * 100);
                    import("./toastStore").then(({ showSuccess }) => {
                      showSuccess(`Compacted: ${Math.round(pre / 1000)}K → ${Math.round(post / 1000)}K tokens (saved ${savedPct}%)`);
                    });
                  }
                }, 1500);
              }
            } else {
              console.error("[Tide] Compact failed:", e.error);
            }
            break;
          }

          case "fork": {
            if (e.data?.cancelled) {
              console.warn("[Tide] fork was cancelled by Pi");
              break;
            }
            if (e.success) {
              set({
                sessionId: e.data?.sessionId || e.data?.sessionPath || "",
                sessionName: e.data?.sessionName || "",
              });
              getMessages().catch(() => {});
              getSessionStats().catch(() => {});
            }
            break;
          }

          case "cycle_model": {
            if (e.success && e.data) {
              const m = e.data;
              const name = String(m.name || m.id || "unknown");
              const provider = String(m.provider || "");
              const id = String(m.id || "");
              set({ modelName: name, modelProvider: provider, modelId: id });
              if (m.contextWindow) {
                set({ contextWindow: Number(m.contextWindow) });
              }
            }
            break;
          }

          case "cycle_thinking_level": {
            if (e.success && e.data?.level) {
              set({ thinkingLevel: e.data.level as ThinkingLevel });
            }
            break;
          }

          case "abort":
          case "retry": {
            // Informational — agent_start/end will handle UI state
            break;
          }

          case "get_commands": {
            // Pi returns { data: { commands: [...] } }
            const cmdList = e.data?.commands ?? e.data;
            if (e.success && Array.isArray(cmdList)) {
              const cmds: PiCommand[] = cmdList.map((c: any) => ({
                name: String(c.name || ""),
                description: c.description ? String(c.description) : undefined,
                type: c.source ? String(c.source) : undefined,
              })).filter((c: PiCommand) => c.name);
              set({ piCommands: cmds });
              console.log(`[Tide] Loaded ${cmds.length} Pi commands/skills`);
            }
            break;
          }

          case "bash":
          case "export_html":
          case "get_last_assistant_text":
          case "get_fork_messages": {
            // Handled by specific UI features if needed; no store updates required
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

        // Surface API errors from the model (e.g. OpenAI 404, rate limits)
        if (endMsg?.stopReason === "error" && endMsg?.errorMessage) {
          console.error("[Tide] Model API error:", endMsg.errorMessage);
          set((state) => ({
            messages: [
              ...state.messages.filter((m) => m.role !== "thinking"),
              {
                role: "system" as const,
                id: nextId(),
                content: `Model error: ${endMsg.errorMessage}`,
                timestamp: Date.now(),
                icon: "error" as const,
              },
            ],
          }));
          break;
        }

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
        const e = event as any;
        const callId = e.toolCallId || e.tool_call_id || "";
        const partialResult = e.content || e.text || e.output || e.data || null;
        if (callId && partialResult) {
          const text = typeof partialResult === "string" ? partialResult : JSON.stringify(partialResult);
          set((state) => ({
            messages: state.messages.map((m) =>
              m.role === "tool_call" && m.toolCallId === callId
                ? { ...m, resultJson: text }
                : m,
            ),
          }));
        }
        break;
      }

      default:
        break;
    }
  },
}));
