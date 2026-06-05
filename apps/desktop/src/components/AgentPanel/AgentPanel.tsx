import React, { useState, useEffect, useRef, useCallback, Suspense, lazy, useMemo } from "react";
import { useStreamStore, type ChatMessage, type ToolCallMessage, type SystemMessage, type PiCommand } from "../../stores/stream";
import { sendPrompt, abortAgent, steerAgent, followUp, newSession, listSessions, switchSession, deleteSession, getPiState, orchestrate, forkSession, getForkMessages, getCommands, type SessionInfo } from "../../lib/ipc";
import { classifyPrompt } from "../../lib/routerClassifier";
const LogsTab = lazy(() => import("./LogsTab").then(m => ({ default: m.LogsTab })));
const PlanTab = lazy(() => import("./PlanTab").then(m => ({ default: m.PlanTab })));
const SessionHistoryTab = lazy(() => import("./SessionHistoryTab").then(m => ({ default: m.SessionHistoryTab })));
const ExpertsTab = lazy(() => import("../ExpertsPanel/ExpertsTab").then(m => ({ default: m.ExpertsTab })));
import { MessageRenderer } from "./MessageRenderer";
import { ClarifyCard } from "./ClarifyCard";
import { PipelineProgress } from "./PipelineProgress";
import { ChangesetViewer } from "./ChangesetViewer";
import { useApprovalStore } from "../../stores/approvalStore";
import { useOrchestrationStore, isOrchestrationStalled } from "../../stores/orchestrationStore";
import { ContextWarning } from "../ContextWarning/ContextWarning";
import css from "./AgentPanel.module.css";

type TabId = "chat" | "logs" | "plan" | "experts" | "history";

// ── Attachment types ────────────────────────────────────────

interface ImageAttachment {
  id: string;
  dataUrl: string; // base64 data URL for preview + sending
  name: string;
}

// ── Serialization helpers ───────────────────────────────────

const SNIPPET_ATTR = "data-snippet";
const PASTE_ATTR = "data-paste";

/** Serialize contentEditable → text with snippet labels and paste blocks */
function serializeComposer(el: HTMLElement): string {
  let result = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement;
      if (elem.hasAttribute(SNIPPET_ATTR)) {
        const label = elem.getAttribute("data-label") ?? "";
        result += `@${label}`;
      } else if (elem.hasAttribute(PASTE_ATTR)) {
        // Expand paste chip back to full text
        result += elem.getAttribute(PASTE_ATTR) ?? "";
      } else if (elem.tagName === "BR") {
        result += "\n";
      } else {
        result += elem.textContent ?? "";
      }
    }
  }
  return result;
}

/** Build the full message with image descriptions + snippet code blocks */
function buildMessage(
  text: string,
  snippets: Map<string, { label: string; code: string; lang: string }>,
  images: ImageAttachment[],
): string {
  const parts: string[] = [];

  // Expand snippet refs to actual code blocks
  let expanded = text;
  for (const [, s] of snippets) {
    const ref = `@${s.label}`;
    if (expanded.includes(ref)) {
      expanded = expanded.replace(ref, `@${s.label}\n\`\`\`${s.lang}\n${s.code}\n\`\`\``);
    }
  }
  parts.push(expanded);

  // Images are sent separately via the extended protocol
  // Add a note in text so the user sees what was sent
  if (images.length > 0) {
    parts.push(`\n[${images.length} image${images.length > 1 ? "s" : ""} attached]`);
  }

  return parts.join("");
}

/** Create a snippet chip DOM node */
function createSnippetNode(id: string, label: string): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.setAttribute(SNIPPET_ATTR, id);
  chip.setAttribute("data-label", label);
  chip.contentEditable = "false";
  chip.className = css.snippetChip ?? "";

  const text = document.createElement("span");
  text.textContent = `@${label}`;
  chip.appendChild(text);

  const btn = document.createElement("span");
  btn.textContent = "\u00D7";
  btn.className = css.snippetChipX ?? "";
  btn.onmousedown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    chip.remove();
  };
  chip.appendChild(btn);

  return chip;
}

/** Create a compact paste chip: [Pasted text... N lines] */
function createPasteNode(text: string): HTMLSpanElement {
  const lines = text.split("\n");
  const lineCount = lines.length;
  // Show a short preview: first non-empty line, truncated
  const preview = (lines.find((l) => l.trim()) ?? "").trim();
  const previewText = preview.length > 30 ? preview.slice(0, 30) + "..." : preview;

  const chip = document.createElement("span");
  chip.setAttribute(PASTE_ATTR, text);
  chip.contentEditable = "false";
  chip.className = css.pasteChip ?? "";
  chip.title = text.length > 500 ? text.slice(0, 500) + "..." : text;

  const label = document.createElement("span");
  label.textContent = previewText
    ? `${previewText} [${lineCount} lines]`
    : `[Pasted text... ${lineCount} lines]`;
  chip.appendChild(label);

  const btn = document.createElement("span");
  btn.textContent = "\u00D7";
  btn.className = css.snippetChipX ?? "";
  btn.onmousedown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    chip.remove();
  };
  chip.appendChild(btn);

  return chip;
}

const PASTE_LINE_THRESHOLD = 3;

function placeCaretAtEnd(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** Insert a node at current cursor position inside a contentEditable */
function insertNodeAtCursor(container: HTMLElement, node: Node) {
  container.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    container.appendChild(node);
    container.appendChild(document.createTextNode("\u00A0"));
    placeCaretAtEnd(container);
    return;
  }
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const spacer = document.createTextNode("\u00A0");
  range.insertNode(spacer);
  range.insertNode(node);
  range.setStartAfter(spacer);
  range.setEndAfter(spacer);
  sel.removeAllRanges();
  sel.addRange(range);
}

// ── Global event bus: editor → composer ─────────────────────

type SnippetPayload = {
  id: string;
  label: string;
  code: string;
  lang: string;
  filePath: string;
  startLine: number;
  endLine: number;
};

type SnippetListener = (payload: SnippetPayload) => void;
const snippetListeners = new Set<SnippetListener>();

export function emitSnippet(payload: SnippetPayload) {
  for (const fn of snippetListeners) fn(payload);
}

// ── Session History Helpers ──────────────────────────────────

type DateGroup = "Today" | "Yesterday" | "Last 7 Days" | "Older";

function getDateGroup(timestampMs: number): DateGroup {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (timestampMs >= startOfToday) return "Today";
  if (timestampMs >= startOfToday - 86400000) return "Yesterday";
  if (timestampMs >= startOfToday - 6 * 86400000) return "Last 7 Days";
  return "Older";
}

function formatSessionTime(timestampMs: number, group: DateGroup): string {
  const date = new Date(timestampMs);
  if (group === "Today" || group === "Yesterday") {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function groupSessions(sessions: SessionInfo[]): [DateGroup, SessionInfo[]][] {
  const order: DateGroup[] = ["Today", "Yesterday", "Last 7 Days", "Older"];
  const groups = new Map<DateGroup, SessionInfo[]>();
  for (const g of order) groups.set(g, []);
  for (const s of sessions) {
    const g = getDateGroup(Number(s.updatedAt ?? 0));
    groups.get(g)!.push(s);
  }
  return order.filter(g => groups.get(g)!.length > 0).map(g => [g, groups.get(g)!]);
}

// ── Session Dropdown Component ──────────────────────────────

function SessionDropdown({
  sessions,
  currentSessionId,
  onSwitch,
  onDelete,
  onClose,
}: {
  sessions: SessionInfo[];
  currentSessionId: string;
  onSwitch: (file: string) => void;
  onDelete: (file: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-focus search
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Escape to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Click outside to close
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const filtered = query
    ? sessions.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
    : sessions;

  const grouped = groupSessions(filtered);

  return (
    <>
      <div className={css.sessionBackdrop} />
      <div ref={dropdownRef} className={css.sessionDropdown}>
        <div className={css.sessionDropdownHeader}>
          <SearchIcon />
          <input
            ref={searchRef}
            className={css.sessionSearch}
            placeholder="Search chats..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") onClose(); }}
          />
          <button className={css.sessionDropdownClose} onClick={onClose} type="button">
            &times;
          </button>
        </div>
        <div className={css.sessionDropdownBody}>
          {sessions.length === 0 ? (
            <div className={css.sessionEmpty}>No saved sessions</div>
          ) : filtered.length === 0 ? (
            <div className={css.sessionNoResults}>No matching chats</div>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group}>
                <div className={css.sessionGroupLabel}>{group}</div>
                {items.map(sess => {
                  const isActive = sess.file === currentSessionId;
                  const isConfirming = confirmDeleteFile === sess.file;
                  return (
                    <div key={sess.file} style={{ position: "relative" }}>
                      {isConfirming && (
                        <div style={s.sessionConfirmOverlay}>
                          <span style={s.sessionConfirmText}>Delete chat?</span>
                          <button
                            style={s.sessionConfirmYes}
                            onClick={() => {
                              setConfirmDeleteFile(null);
                              onDelete(sess.file);
                            }}
                            type="button"
                          >
                            Delete
                          </button>
                          <button
                            style={s.sessionConfirmNo}
                            onClick={() => setConfirmDeleteFile(null)}
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                      <button
                        className={`${css.sessionItem}${isActive ? ` ${css.sessionItemActive}` : ""}`}
                        onClick={() => onSwitch(sess.file)}
                        type="button"
                      >
                        <span className={css.sessionItemName}>{sess.name || "Untitled"}</span>
                        {sess.updatedAt != null && (
                          <span className={css.sessionItemMeta}>
                            {formatSessionTime(Number(sess.updatedAt), group)}
                          </span>
                        )}
                        <span
                          className={css.sessionDeleteBtn}
                          role="button"
                          tabIndex={-1}
                          onClick={e => {
                            e.stopPropagation();
                            setConfirmDeleteFile(sess.file);
                          }}
                          onMouseDown={e => e.stopPropagation()}
                        >
                          &times;
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ── Orchestration helpers ────────────────────────────────────

// ── AgentPanel ──────────────────────────────────────────────

export function AgentPanel() {
  const [activeTab, setActiveTab] = useState<TabId>("chat");

  // Listen for tab switch requests from other components (e.g., Experts → Chat)
  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail;
      if (tab) {
        setActiveTab(tab);
        // Scroll to latest message when switching to chat
        if (tab === "chat") {
          setTimeout(() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
          }, 100);
        }
      }
    };
    window.addEventListener("tide:switch-tab", handler);
    return () => window.removeEventListener("tide:switch-tab", handler);
  }, []);

  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const sessionsFetchedAt = useRef(0);
  const snippetsRef = useRef<Map<string, { label: string; code: string; lang: string }>>(new Map());
  const { messages, isStreaming, isCompacting, isRetrying, sessionStatus, addUserMessage } = useStreamStore();
  const clarifyQuestions = useApprovalStore((s) => s.clarifyQuestions);
  const clarifyInputRequestId = useApprovalStore((s) => s.clarifyInputRequestId);
  const orcPhase = useOrchestrationStore((s) => s.phase);
  const lastHeartbeat = useOrchestrationStore((s) => s.lastHeartbeat);
  const [forceOrchestrate, setForceOrchestrate] = useState(false);
  const [isStalled, setIsStalled] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandFilter, setCommandFilter] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const piCommands = useStreamStore((s) => s.piCommands);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Group consecutive tool_call messages for collapsed display. Memoized on `messages`
  // so unrelated re-renders of this large panel (composer state, status changes) don't
  // re-run the O(n) grouping; during streaming it recomputes as expected, while the
  // memoized ChatBubble/ToolCallGroup children keep untouched messages from re-rendering.
  const groupedMessages = useMemo(() => {
    const elements: React.ReactNode[] = [];
    let i = 0;
    while (i < messages.length) {
      const msg = messages[i];
      if (msg.role === "tool_call") {
        const group: ToolCallMessage[] = [];
        while (i < messages.length && messages[i].role === "tool_call") {
          group.push(messages[i] as ToolCallMessage);
          i++;
        }
        elements.push(<ToolCallGroup key={group[0].id} tools={group} />);
      } else {
        const nextUserMsgIndex = msg.role === "assistant"
          ? messages.slice(0, i + 1).filter((m) => m.role === "user").length
          : -1;
        elements.push(<ChatBubble key={msg.id} message={msg} userMessageIndex={nextUserMsgIndex} />);
        i++;
      }
    }
    return elements;
  }, [messages]);

  // Stall detection: check every 5s while orchestration is active
  useEffect(() => {
    const isActive = orcPhase !== "idle" && orcPhase !== "complete" && orcPhase !== "failed";
    if (!isActive) {
      setIsStalled(false);
      return;
    }
    const id = setInterval(() => setIsStalled(isOrchestrationStalled()), 5000);
    return () => clearInterval(id);
  }, [orcPhase, lastHeartbeat]);

  // Auto-scroll on new messages (rAF-throttled + near-bottom detection)
  const scrollRafRef = useRef<number | null>(null);
  const isNearBottom = useRef(true);

  const handleChatScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isNearBottom.current = scrollHeight - scrollTop - clientHeight < 80;
  }, []);

  useEffect(() => {
    if (!scrollRef.current || !isNearBottom.current) return;
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      scrollRafRef.current = null;
    });
  }, [messages]);

  useEffect(() => {
    return () => { if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current); };
  }, []);

  // Scroll to bottom when switching back to chat tab
  useEffect(() => {
    if (activeTab === "chat") {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }, 50);
    }
  }, [activeTab]);

  // Ctrl+Delete (or Cmd+Backspace on Mac) to stop agent
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Delete") {
        e.preventDefault();
        if (useStreamStore.getState().agentActive) {
          abortAgent().catch(() => {});
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Listen for snippet insertions from the editor
  useEffect(() => {
    const handler: SnippetListener = (payload) => {
      if (!composerRef.current) return;
      snippetsRef.current.set(payload.id, {
        label: payload.label,
        code: payload.code,
        lang: payload.lang,
      });
      const chip = createSnippetNode(payload.id, payload.label);
      insertNodeAtCursor(composerRef.current, chip);
    };
    snippetListeners.add(handler);
    return () => { snippetListeners.delete(handler); };
  }, []);

  // Fetch Pi commands on mount for "/" palette
  useEffect(() => {
    getCommands().catch(() => {});
  }, []);

  // ── Send ─────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const rawText = composerRef.current ? serializeComposer(composerRef.current).trim() : "";
    if (!rawText && images.length === 0) return;

    const msg = buildMessage(rawText, snippetsRef.current, images);
    if (!msg.trim()) return;

    // Clear
    if (composerRef.current) composerRef.current.innerHTML = "";
    snippetsRef.current.clear();
    setImages([]);

    // Extract base64 data from image attachments for Pi
    const imagePayloads = images.map((img) => {
      const [header, data] = img.dataUrl.split(",");
      const mediaType = header?.match(/data:(.*?);/)?.[1] ?? "image/png";
      return { mediaType, base64: data ?? "" };
    });

    if (isStreaming) {
      addUserMessage(`[steer] ${msg}`);
      try { await steerAgent(msg); } catch {
        try { await followUp(msg); } catch (e) { console.error("Steer/follow_up failed:", e); }
      }
    } else {
      addUserMessage(msg);

      // Determine if this should use orchestration
      const shouldOrchestrate = forceOrchestrate || classifyPrompt(msg).tier === "complex";
      if (forceOrchestrate) setForceOrchestrate(false); // Reset toggle after use

      if (shouldOrchestrate && imagePayloads.length === 0) {
        try {
          await orchestrate(msg);
        } catch (e) { console.error("Orchestrate failed:", e); }
      } else {
        try {
          await sendPrompt(msg, imagePayloads.length > 0 ? imagePayloads : undefined);
        } catch (e) { console.error("Send failed:", e); }
      }
    }
  }, [isStreaming, addUserMessage, images, forceOrchestrate]);

  const handleAbort = async () => {
    try { await abortAgent(); } catch (e) { console.error("Abort failed:", e); }
  };

  // ── Image handling ───────────────────────────────

  const addImageFiles = useCallback((files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setImages((prev) => [...prev, { id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, dataUrl, name: file.name }]);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  // Paste: images become attachments, multiline text becomes compact chips
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // Check for images first
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addImageFiles(imageFiles);
      return;
    }

    // Check for multiline text — compact into a chip
    const text = e.clipboardData?.getData("text/plain") ?? "";
    const lineCount = text.split("\n").length;
    if (lineCount >= PASTE_LINE_THRESHOLD && composerRef.current) {
      e.preventDefault();
      const chip = createPasteNode(text);
      insertNodeAtCursor(composerRef.current, chip);
    }
    // Single-line pastes fall through to default browser behavior
  }, [addImageFiles]);

  // Drag & drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files) addImageFiles(e.dataTransfer.files);
  }, [addImageFiles]);

  // File picker
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addImageFiles(e.target.files);
    e.target.value = "";
  }, [addImageFiles]);

  // ── Keyboard ─────────────────────────────────────

  const getFilteredCommands = useCallback(() => {
    return piCommands
      .filter((c) => c.name.toLowerCase().includes(commandFilter.toLowerCase()))
      .slice(0, 10);
  }, [piCommands, commandFilter]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Close command palette on Escape
    if (e.key === "Escape" && showCommandPalette) {
      setShowCommandPalette(false);
      setCommandFilter("");
      setCommandIndex(0);
      return;
    }
    // Arrow key navigation in command palette
    if (showCommandPalette) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const filtered = getFilteredCommands();
        setCommandIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCommandIndex((i) => Math.max(i - 1, 0));
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (showCommandPalette) {
        const filtered = getFilteredCommands();
        if (filtered.length > 0) {
          handleSelectCommand(filtered[Math.min(commandIndex, filtered.length - 1)]);
        }
        return;
      }
      // Cmd/Ctrl+Enter forces orchestration
      if (e.metaKey || e.ctrlKey) {
        setForceOrchestrate(true);
      }
      handleSend();
    }
  }, [handleSend, showCommandPalette, getFilteredCommands, commandIndex]);

  const handleSelectCommand = useCallback((cmd: PiCommand) => {
    setShowCommandPalette(false);
    setCommandFilter("");
    if (composerRef.current) composerRef.current.innerHTML = "";
    // Send the command as a prompt — Pi expects commands prefixed with /
    const cmdText = `/${cmd.name}`;
    addUserMessage(cmdText);
    sendPrompt(cmdText).catch(console.error);
  }, [addUserMessage]);

  // Track "/" input for command palette
  const handleInput = useCallback(() => {
    if (!composerRef.current) return;
    const text = composerRef.current.textContent || "";
    if (text.startsWith("/")) {
      setShowCommandPalette(true);
      setCommandFilter(text.slice(1));
      setCommandIndex(0);
    } else if (showCommandPalette) {
      setShowCommandPalette(false);
      setCommandFilter("");
      setCommandIndex(0);
    }
  }, [showCommandPalette]);

  return (
    <div style={s.container}>
      {/* Tab bar */}
      <div style={s.tabBar}>
        <button
          style={{ ...s.tab, ...(activeTab === "chat" ? s.tabActive : {}) }}
          onClick={() => setActiveTab("chat")}
        >
          Chat
        </button>
        <button
          style={{ ...s.tab, ...(activeTab === "logs" ? s.tabActive : {}) }}
          onClick={() => setActiveTab("logs")}
        >
          Logs
        </button>
        <button
          style={{ ...s.tab, ...(activeTab === "plan" ? s.tabActive : {}) }}
          onClick={() => setActiveTab("plan")}
        >
          Plan
        </button>
        <button
          style={{ ...s.tab, ...(activeTab === "experts" ? s.tabActive : {}) }}
          onClick={() => setActiveTab("experts")}
        >
          Experts
        </button>
        <button
          style={{ ...s.tab, ...(activeTab === "history" ? s.tabActive : {}) }}
          onClick={() => setActiveTab("history")}
        >
          History
        </button>
        <div style={{ flex: 1 }} />
        {activeTab === "chat" && (
          <div style={s.sessionControls}>
            <button
              style={s.sessionBtn}
              onClick={async () => {
                if (showSessions) {
                  setShowSessions(false);
                } else {
                  try {
                    const now = Date.now();
                    // Cache session list for 5s to avoid re-fetching on repeated opens
                    if (sessions.length === 0 || now - sessionsFetchedAt.current > 5000) {
                      const sessionDir = useStreamStore.getState().sessionDir;
                      const result = await listSessions(sessionDir || undefined);
                      setSessions(result);
                      sessionsFetchedAt.current = now;
                    }
                  } catch (e) { console.error("[Tide:sessions] listSessions error:", e); setSessions([]); }
                  setShowSessions(true);
                }
              }}
              title="Chat history"
              type="button"
            >
              <HistoryIcon />
            </button>
            <button
              style={s.sessionBtn}
              onClick={async () => {
                try {
                  await newSession();
                  // Don't call clearMessages() — the response handler in stream.ts does it
                  await getPiState();
                } catch (e) { console.error("New session failed:", e); }
              }}
              title="New chat"
              type="button"
            >
              <PlusIcon />
            </button>
          </div>
        )}
      </div>

      {/* Session history dropdown */}
      {showSessions && activeTab === "chat" && (
        <SessionDropdown
          sessions={sessions}
          currentSessionId={useStreamStore.getState().sessionId}
          onSwitch={async (file) => {
            setShowSessions(false);
            useStreamStore.setState({ sessionStatus: "loading" });
            try { await switchSession(file); } catch (e) { console.error("Switch session failed:", e); }
          }}
          onDelete={async (file) => {
            try {
              const isActive = file === useStreamStore.getState().sessionId;
              // Pass isActive so the backend tells Pi to start a new session,
              // preventing the deleted session from being resurrected on restart.
              await deleteSession(file, isActive);
              const sessionDir = useStreamStore.getState().sessionDir;
              const remaining = await listSessions(sessionDir || undefined);
              setSessions(remaining);
              sessionsFetchedAt.current = Date.now();
              if (isActive) {
                // If other sessions exist, switch to the most recent one;
                // otherwise deleteSession already created a fresh session.
                if (remaining.length > 0) {
                  await switchSession(remaining[0].file);
                } else {
                  await getPiState();
                }
              }
            } catch (e) { console.error("Delete session failed:", e); }
          }}
          onClose={() => setShowSessions(false)}
        />
      )}

      {/* Tab content */}
      {activeTab === "chat" ? (
        <>
          {orcPhase !== "idle" && <PipelineProgress />}
          <div ref={scrollRef} className={css.chatScroll} onScroll={handleChatScroll}>
            {sessionStatus === "loading" ? (
              <div style={s.sessionLoading}>
                <div className={css.shimmerLine} />
                <div className={css.shimmerLine} style={{ width: "60%" }} />
                <div className={css.shimmerLine} style={{ width: "80%" }} />
              </div>
            ) : messages.length === 0 ? (
              <EmptyState />
            ) : (
              <div style={s.messageList}>
                {groupedMessages}
                {clarifyQuestions && clarifyInputRequestId && (
                  <ClarifyCard questions={clarifyQuestions} />
                )}
                <ChangesetViewer />
              </div>
            )}
          </div>

          {/* Status indicators */}
          {(isCompacting || isRetrying || isStalled) && (
            <div style={s.statusBar}>
              {isCompacting && <span style={s.statusItem}>Compacting context...</span>}
              {isRetrying && <span style={s.statusItem}>Retrying...</span>}
              {isStalled && <span style={s.statusItem}>Orchestration may be stalled — no heartbeat received</span>}
            </div>
          )}

          {/* Context Warning */}
          <ContextWarning />

          {/* Composer */}
          <div
            className={css.composer}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Image strip */}
            {images.length > 0 && (
              <div className={css.imageStrip}>
                {images.map((img) => (
                  <div key={img.id} className={css.imageThumb}>
                    <img src={img.dataUrl} alt={img.name} />
                    <button
                      className={css.imageThumbRemove}
                      onClick={() => removeImage(img.id)}
                      type="button"
                      title="Remove"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input row */}
            <div className={css.inputRow}>
              <div style={{ position: "relative", flex: 1 }}>
                <div
                  ref={composerRef}
                  className={css.composerField}
                  contentEditable
                  role="textbox"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  data-placeholder={isStreaming ? "Steer agent... (Enter to redirect)" : "Message Tide... (Enter to send, / for commands)"}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  onInput={handleInput}
                />
                {showCommandPalette && piCommands.length > 0 && (() => {
                  const filtered = getFilteredCommands();
                  return (
                    <div style={s.commandPalette}>
                      {filtered.length > 0 ? filtered.map((cmd, i) => (
                        <button
                          key={cmd.name}
                          ref={i === commandIndex ? (el) => { el?.scrollIntoView({ block: "nearest" }); } : undefined}
                          style={{ ...s.commandItem, ...(i === commandIndex ? s.commandItemActive : {}) }}
                          onClick={() => handleSelectCommand(cmd)}
                          onMouseEnter={() => setCommandIndex(i)}
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          <div style={s.commandRow}>
                            <span style={s.commandName}>/{cmd.name}</span>
                            {cmd.type && <span style={s.commandBadge}>{cmd.type}</span>}
                          </div>
                          {cmd.description && (
                            <span style={s.commandDesc}>{cmd.description}</span>
                          )}
                        </button>
                      )) : (
                        <div style={s.commandEmpty}>No matching commands</div>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className={css.composerToolbar}>
                <button
                  className={css.toolbarBtn}
                  onClick={() => fileInputRef.current?.click()}
                  data-tooltip="Attach image"
                  type="button"
                >
                  <ImageIcon />
                </button>
                <button
                  className={css.toolbarBtn}
                  onClick={() => setForceOrchestrate((v) => !v)}
                  data-tooltip={forceOrchestrate ? "Orchestration ON — click to disable" : "Force orchestration (⌘+Enter)"}
                  type="button"
                  style={forceOrchestrate ? { color: "var(--accent)" } : undefined}
                >
                  <PipelineIcon />
                </button>
                {isStreaming && (
                  <button className={css.stopBtn} onClick={handleAbort} type="button">
                    <StopIcon /> Stop
                  </button>
                )}
                <button
                  className={css.sendBtn}
                  onClick={handleSend}
                  title={isStreaming ? "Steer (redirect agent)" : "Send (Enter)"}
                  type="button"
                >
                  {isStreaming ? <SteerIcon /> : <SendIcon />}
                </button>
              </div>
            </div>

            {/* Drop overlay */}
            {isDragging && (
              <div className={css.dropOverlay}>Drop image to attach</div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={handleFileInput}
            />
          </div>
        </>
      ) : (
        <Suspense fallback={null}>
          {activeTab === "logs" ? (
            <LogsTab />
          ) : activeTab === "plan" ? (
            <PlanTab />
          ) : activeTab === "experts" ? (
            <ExpertsTab />
          ) : (
            <SessionHistoryTab onSessionSwitch={() => setActiveTab("chat")} />
          )}
        </Suspense>
      )}
    </div>
  );
}

// ── Streaming-throttled Markdown Renderer ────────────────────

const StreamingMessageRenderer = React.memo(function StreamingMessageRenderer({ content }: { content: string }) {
  const [rendered, setRendered] = useState(content);
  const rafRef = useRef<number | null>(null);
  const latestRef = useRef(content);
  const lastUpdateRef = useRef(0);
  latestRef.current = content;

  useEffect(() => {
    const now = performance.now();
    if (now - lastUpdateRef.current >= 50) {
      setRendered(content);
      lastUpdateRef.current = now;
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setRendered(latestRef.current);
        lastUpdateRef.current = performance.now();
      });
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [content]);

  return <MessageRenderer content={rendered} />;
});

// ── Copy button for messages ────────────────────────────────

function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <button style={s.copyMsgBtn} onClick={handleCopy} title="Copy message">
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5l3 3 7-7" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M3 11V3.5A.5.5 0 013.5 3H11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

// ── Message Bubbles ─────────────────────────────────────────

const ChatBubble = React.memo(function ChatBubble({ message, userMessageIndex = -1 }: { message: ChatMessage; userMessageIndex?: number }) {
  switch (message.role) {
    case "user":
      return (
        <div className={css.messageEnter} style={s.userRow}>
          <div style={s.roleLabel}>You</div>
          <div style={s.userBubble}>{message.content}</div>
        </div>
      );

    case "assistant":
      return (
        <div className={css.messageEnter} style={s.assistantRow}>
          <div style={s.roleLabel}>
            <span style={{ color: "var(--accent)" }}>TideCode</span>
            {message.modelName && (
              <span style={s.modelBadge}>{message.modelName}</span>
            )}
            {message.streaming && <span style={s.streamingDot} />}
            {!message.streaming && message.content && (
              <CopyMessageButton text={message.content} />
            )}
          </div>
          <div style={s.assistantBubble}>
            {message.streaming
              ? <StreamingMessageRenderer content={message.content} />
              : <MessageRenderer content={message.content} />
            }
            {!message.streaming && (
              <div style={s.execSummaryWrap}>
                <div style={s.execSummaryRow}>
                  <span style={s.execStatusBadge(message.executionStatus)}>
                    {message.executionStatus === "changed_files"
                      ? "CHANGED FILES"
                      : message.executionStatus === "executed_no_changes"
                      ? "EXECUTED (NO CHANGES)"
                      : "ANALYZED"}
                  </span>
                  <button
                    style={s.forkButton}
                    onClick={async () => {
                      try {
                        const forkMsgs = await getForkMessages();
                        if (forkMsgs.length === 0) {
                          console.warn("[Tide] No forkable messages available");
                          return;
                        }
                        const idx = Math.min(userMessageIndex, forkMsgs.length - 1);
                        console.debug(`[Tide] Forking from entry ${idx}/${forkMsgs.length}: ${forkMsgs[idx].entryId}`);
                        await forkSession(forkMsgs[idx].entryId);
                      } catch (err) {
                        console.error("[Tide] Fork failed:", err);
                      }
                    }}
                    title="Fork session from this point"
                  >
                    Fork
                  </button>
                </div>
                {message.changedFiles && message.changedFiles.length > 0 && (
                  <div style={s.execFilesList}>
                    {message.changedFiles.map((f) => (
                      <span key={f} style={s.execFileItem}>{f}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );

    case "tool_call":
      return <ToolCallCard tool={message} />;

    case "system":
      return <SystemCard message={message} />;

    case "thinking":
      return <ThinkingIndicator />;

    default:
      return null;
  }
});

// ── Tool Call Group (collapsed view) ────────────────────────

const ToolCallGroup = React.memo(function ToolCallGroup({ tools }: { tools: ToolCallMessage[] }) {
  const [expanded, setExpanded] = useState(false);
  const running = useMemo(() => tools.filter((t) => t.status === "running"), [tools]);
  const completed = useMemo(() => tools.filter((t) => t.status !== "running"), [tools]);
  const hiddenCount = Math.max(0, completed.length - 2);
  const visibleCompleted = expanded ? completed : completed.slice(-2);

  return (
    <>
      {hiddenCount > 0 && (
        <div style={s.toolGroupToggle}>
          <button
            style={s.toolGroupBtn}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? `Hide ${hiddenCount} tool calls` : `Show ${hiddenCount} more`}
          </button>
        </div>
      )}
      {visibleCompleted.map((t) => (
        <ToolCallCard key={t.id} tool={t} />
      ))}
      {running.map((t) => (
        <ToolCallCard key={t.id} tool={t} />
      ))}
    </>
  );
});

// ── Tool Call Card ──────────────────────────────────────────

const SUBAGENT_TOOLS = new Set(["tide_explore", "tide_research", "tide_dispatch"]);

const SUBAGENT_LABELS: Record<string, string> = {
  tide_explore: "Codebase Explorer",
  tide_research: "Web Researcher",
  tide_dispatch: "Parallel Dispatch",
};

/** Friendly labels and icons for common Pi tools */
const TOOL_DISPLAY: Record<string, { label: string; icon: string }> = {
  // File operations
  read: { label: "Read File", icon: "📄" },
  write: { label: "Write File", icon: "✏️" },
  edit: { label: "Edit File", icon: "✏️" },
  multi_edit: { label: "Multi Edit", icon: "✏️" },
  // Search & navigation
  grep: { label: "Search", icon: "🔍" },
  glob: { label: "Find Files", icon: "📂" },
  list: { label: "List Directory", icon: "📁" },
  // Execution
  bash: { label: "Terminal", icon: "⬛" },
  run: { label: "Run Command", icon: "⬛" },
  // Tide extensions
  tide_index_search: { label: "Symbol Search", icon: "🔎" },
  tide_index_file_symbols: { label: "File Symbols", icon: "🏷️" },
  tide_web_search: { label: "Web Search", icon: "🌐" },
  tide_plan_create: { label: "Create Plan", icon: "📋" },
  tide_plan_clarify: { label: "Clarify Plan", icon: "❓" },
  tide_plan_update: { label: "Update Plan", icon: "📋" },
  tide_explore: { label: "Explore Codebase", icon: "🔭" },
  tide_research: { label: "Research", icon: "🌐" },
  tide_dispatch: { label: "Parallel Tasks", icon: "⚡" },
  tide_experts_brainstorm: { label: "Expert Brainstorm", icon: "🧠" },
};

function parseSubagentSummary(resultJson?: string): { tokens?: string; successCount?: number; totalCount?: number } | null {
  if (!resultJson) return null;
  // Match dispatch header: "## Dispatch Results (X/Y succeeded, N tokens)"
  const match = resultJson.match(/(\d+)\/(\d+) succeeded,\s*([\d,.]+[kM]?)\s*tokens?/);
  if (match) {
    return {
      successCount: parseInt(match[1]),
      totalCount: parseInt(match[2]),
      tokens: match[3],
    };
  }
  return null;
}

function parseSubagentModel(resultJson?: string): string | null {
  if (!resultJson) return null;
  // Match "model: provider/model-name" in result text
  const match = resultJson.match(/model:\s*(?:\w+\/)?(\S+)/);
  return match ? match[1] : null;
}

const ToolCallCard = React.memo(function ToolCallCard({ tool }: { tool: ToolCallMessage }) {
  const [expanded, setExpanded] = useState(false);
  const isSubagent = SUBAGENT_TOOLS.has(tool.toolName);
  const display = TOOL_DISPLAY[tool.toolName];
  const displayLabel = display?.label || SUBAGENT_LABELS[tool.toolName] || tool.toolName;

  const statusCls =
    tool.status === "running" ? css.toolCardRunning
    : tool.status === "error" ? css.toolCardError
    : css.toolCardDone;

  const summary = isSubagent && tool.status === "completed" ? parseSubagentSummary(tool.resultJson) : null;
  const subagentModel = isSubagent && tool.status === "completed" ? parseSubagentModel(tool.resultJson) : null;

  // Extract a brief context hint from args (e.g., file path for read/edit, query for grep)
  const contextHint = React.useMemo(() => {
    if (!tool.argsJson || tool.argsJson === "{}") return null;
    try {
      const args = JSON.parse(tool.argsJson);
      // File operations: show the path
      if (args.file_path || args.path || args.file) {
        const p = args.file_path || args.path || args.file;
        // Show just filename + parent dir
        const parts = p.split("/");
        return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : p;
      }
      // Search: show the pattern/query
      if (args.pattern || args.query || args.command) {
        const q = args.pattern || args.query || args.command;
        return q.length > 50 ? q.slice(0, 47) + "..." : q;
      }
    } catch { /* ignore */ }
    return null;
  }, [tool.argsJson]);

  const durationText = tool.durationMs != null
    ? (tool.durationMs < 1000 ? `${tool.durationMs}ms` : `${(tool.durationMs / 1000).toFixed(1)}s`)
    : null;

  return (
    <div className={css.messageEnter} style={s.toolRow}>
      <div className={`${css.toolCard} ${statusCls}`}>
        <div className={css.toolCardHeader} onClick={() => setExpanded(!expanded)}>
          {/* Status indicator */}
          {tool.status === "running" ? (
            <div className={css.toolSpinner} />
          ) : (
            <span style={tool.status === "error" ? s.toolIconError : s.toolIconSuccess}>
              {tool.status === "error" ? "\u2717" : "\u2713"}
            </span>
          )}

          {/* Tool name with friendly label */}
          <span style={s.toolName}>{displayLabel}</span>

          {/* Context hint (file path, search query, etc.) */}
          {contextHint && (
            <span style={s.toolContext}>{contextHint}</span>
          )}

          {/* Subagent metadata */}
          {subagentModel && (
            <span style={s.subagentModel}>{subagentModel}</span>
          )}
          {summary && (
            <span style={s.subagentMeta}>
              {summary.successCount}/{summary.totalCount} ok
              {summary.tokens ? ` \u00b7 ${summary.tokens} tok` : ""}
            </span>
          )}

          {/* Spacer */}
          <span style={{ flex: 1 }} />

          {/* Duration badge */}
          {durationText && (
            <span style={s.toolDuration}>{durationText}</span>
          )}

          {/* Expand chevron */}
          <span style={s.toolChevron}>{expanded ? "\u25BE" : "\u25B8"}</span>
        </div>

        {/* Subagent: show live progress while running */}
        {isSubagent && tool.status === "running" && tool.resultJson && (
          <div style={s.subagentProgress}>
            {tool.resultJson}
          </div>
        )}

        {/* Subagent: show result preview when completed */}
        {isSubagent && tool.status === "completed" && tool.resultJson && !summary && (
          <div style={s.subagentProgress}>
            {tool.resultJson.split("\n").find(l => l.trim() && !l.startsWith("#") && !l.startsWith("*Status")) || "Done"}
          </div>
        )}

        {expanded && (
          <div className={css.toolDetails}>
            {tool.argsJson && tool.argsJson !== "{}" && (
              <div style={s.toolDetailBlock}>
                <span style={s.toolDetailLabel}>Input</span>
                <pre style={s.toolDetailPre}>{formatJson(tool.argsJson)}</pre>
              </div>
            )}
            {tool.resultJson && (
              <div style={s.toolDetailBlock}>
                <span style={s.toolDetailLabel}>Output</span>
                <pre style={s.toolDetailPre}>{isSubagent ? tool.resultJson : formatJson(tool.resultJson)}</pre>
              </div>
            )}
            {tool.error && (
              <div style={s.toolDetailBlock}>
                <span style={s.toolDetailLabelError}>Error</span>
                <span style={s.toolErrorText}>{tool.error}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

function formatJson(raw?: string): string {
  if (!raw) return "";
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}

// ── Thinking Indicator ──────────────────────────────────────

const ThinkingIndicator = React.memo(function ThinkingIndicator() {
  return (
    <div className={css.messageEnter} style={s.thinkingRow}>
      <div style={s.thinkingBubble}>
        <span className={css.thinkingDots}>
          <span style={s.thinkingDot}>{"\u2022"}</span>
          <span style={s.thinkingDot}>{"\u2022"}</span>
          <span style={s.thinkingDot}>{"\u2022"}</span>
        </span>
        <span style={s.thinkingText}>Thinking</span>
      </div>
    </div>
  );
});

// ── System Message Card ─────────────────────────────────────

const SystemCard = React.memo(function SystemCard({ message }: { message: SystemMessage }) {
  const icon = message.icon === "model" ? "⟳" : message.icon === "router" ? "◈" : message.icon === "error" ? "⚠" : "ℹ";
  const isError = message.icon === "error";
  return (
    <div className={css.messageEnter} style={{ ...s.systemRow, ...(isError ? { borderColor: "var(--error)", background: "rgba(239, 68, 68, 0.08)" } : {}) }}>
      <span style={{ ...s.systemIcon, ...(isError ? { color: "var(--error)" } : {}) }}>{icon}</span>
      <span style={s.systemText}>{message.content}</span>
    </div>
  );
});

// ── Empty State ─────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={s.empty}>
      <div style={s.emptyIcon}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div style={s.emptyTitle}>Start a conversation</div>
      <div style={s.emptyHint}>Ask Tide to build, edit, or explain code</div>
    </div>
  );
}

// ── Icons ───────────────────────────────────────────────────

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function SteerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 14 20 9 15 4" />
      <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <rect x="3" y="3" width="10" height="10" rx="1" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function PipelineIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
      <line x1="7" y1="12" x2="10" y2="12" />
      <line x1="14" y1="12" x2="17" y2="12" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

// ── Styles ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const s: Record<string, any> = {
  container: { display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)", position: "relative" as const },
  tabBar: { display: "flex", alignItems: "center", height: 36, padding: "0 6px", background: "var(--bg-tertiary)", borderBottom: "1px solid var(--border)", gap: 0, overflow: "visible" },
  tab: { padding: "0 12px", height: "100%", fontSize: "var(--font-size-sm)", fontFamily: "var(--font-ui)", fontWeight: 500, color: "var(--text-secondary)", background: "transparent", border: "none", borderBottomWidth: 2, borderBottomStyle: "solid", borderBottomColor: "transparent", cursor: "pointer", transition: "color 0.15s", whiteSpace: "nowrap" as const },
  tabActive: { color: "var(--text-bright)", borderBottomColor: "var(--accent)" },
  sessionControls: { display: "flex", alignItems: "center", gap: 4, marginRight: 2, flexShrink: 0 },
  sessionBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, background: "transparent", border: "none", borderRadius: "var(--radius-sm)", color: "var(--text-secondary)", cursor: "pointer", transition: "color 0.15s, background 0.15s", flexShrink: 0 },
  messageList: { display: "flex", flexDirection: "column", gap: 2, padding: "12px 14px 16px" },
  userRow: { display: "flex", flexDirection: "column", gap: 4, marginTop: 8 },
  roleLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-xs)", fontWeight: 600, fontFamily: "var(--font-ui)", color: "var(--text-secondary)", textTransform: "uppercase" as const, letterSpacing: "0.4px" },
  userBubble: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-sm)", lineHeight: 1.55, color: "var(--text-bright)", padding: "8px 12px", background: "rgba(122, 162, 247, 0.08)", borderRadius: "var(--radius-md)", border: "1px solid rgba(122, 162, 247, 0.15)", whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const },
  assistantRow: { display: "flex", flexDirection: "column", gap: 4, marginTop: 8 },
  assistantBubble: { padding: "2px 0" },
  execSummaryWrap: { marginTop: 8, display: "flex", flexDirection: "column", gap: 6 },
  execSummaryRow: { display: "flex", alignItems: "center", gap: 8 },
  execStatusBadge: (status?: "analyzed" | "executed_no_changes" | "changed_files") => ({
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.3px",
    padding: "2px 6px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    color: status === "changed_files" ? "var(--success)" : status === "executed_no_changes" ? "var(--warning, #f0ad4e)" : "var(--text-secondary)",
    background: status === "changed_files" ? "rgba(34,197,94,0.12)" : status === "executed_no_changes" ? "rgba(240,173,78,0.12)" : "rgba(255,255,255,0.04)",
  }),
  execFilesList: { display: "flex", flexDirection: "column", gap: 4 },
  execFileItem: { fontFamily: "var(--font-mono)", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "4px 8px", width: "fit-content" },
  forkButton: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "2px 8px", cursor: "pointer", width: "fit-content", marginTop: 2, opacity: 0.7, transition: "opacity 0.15s" } as React.CSSProperties,
  commandPalette: { position: "absolute" as const, bottom: "100%", left: 0, right: 0, maxHeight: 240, overflowY: "auto" as const, background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginBottom: 4, boxShadow: "0 -4px 12px rgba(0,0,0,0.3)", zIndex: 10 },
  commandItem: { display: "flex", flexDirection: "column" as const, gap: 1, padding: "6px 12px", width: "100%", textAlign: "left" as const, background: "transparent", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", fontFamily: "var(--font-ui)" },
  commandItemActive: { background: "rgba(122, 162, 247, 0.1)" },
  commandRow: { display: "flex", alignItems: "center" as const, gap: 8 },
  commandName: { fontSize: "var(--font-size-sm)", fontFamily: "var(--font-mono)", color: "var(--accent)" },
  commandBadge: { fontSize: 9, fontFamily: "var(--font-ui)", color: "var(--text-secondary)", background: "var(--bg-tertiary)", padding: "0 5px", borderRadius: 3, textTransform: "uppercase" as const, letterSpacing: "0.3px", flexShrink: 0 },
  commandDesc: { fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  commandEmpty: { padding: "8px 12px", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", textAlign: "center" as const },
  streamingDot: { display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", animation: "pulse 1s ease-in-out infinite" },
  toolRow: { margin: "2px 0" },
  toolGroupToggle: { display: "flex", justifyContent: "center", margin: "2px 0" },
  toolGroupBtn: {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: 12,
    color: "var(--text-secondary)",
    fontSize: 10,
    fontFamily: "var(--font-ui)",
    padding: "2px 12px",
    cursor: "pointer",
    opacity: 0.7,
    transition: "opacity 0.15s, background 0.15s",
  },
  toolIconSuccess: { color: "var(--success)", fontSize: 11, lineHeight: 1, flexShrink: 0 },
  toolIconError: { color: "var(--error)", fontSize: 11, lineHeight: 1, flexShrink: 0 },
  toolName: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-bright)", whiteSpace: "nowrap" as const },
  toolContext: { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: 200 },
  toolDuration: { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", opacity: 0.6, flexShrink: 0 },
  toolChevron: { fontSize: 9, color: "var(--text-secondary)", opacity: 0.5, flexShrink: 0 },
  subagentProgress: { padding: "4px 10px 6px 28px", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-secondary)", borderTop: "1px solid var(--border)", lineHeight: 1.5, maxHeight: 60, overflow: "hidden" },
  subagentMeta: { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", opacity: 0.85, flexShrink: 0 },
  subagentModel: { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", opacity: 0.7, flexShrink: 0 },
  toolDetailBlock: { display: "flex", flexDirection: "column", gap: 3, marginTop: 6 },
  toolDetailLabel: { fontSize: 10, fontFamily: "var(--font-ui)", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" as const, letterSpacing: "0.5px" },
  toolDetailLabelError: { fontSize: 10, fontFamily: "var(--font-ui)", fontWeight: 600, color: "var(--error)", textTransform: "uppercase" as const, letterSpacing: "0.5px" },
  toolErrorText: { color: "var(--error)", fontSize: "var(--font-size-xs)", fontFamily: "var(--font-mono)", lineHeight: 1.4 },
  toolDetailPre: { fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.45, color: "var(--text-primary)", background: "var(--bg-primary)", padding: "6px 8px", borderRadius: "var(--radius-sm)", margin: 0, overflowX: "auto" as const, maxHeight: 160, whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const, border: "1px solid var(--border)" },
  thinkingRow: { marginTop: 8 },
  thinkingBubble: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" },
  thinkingDot: { color: "var(--text-secondary)", fontSize: 16, lineHeight: 1, marginRight: 2 },
  thinkingText: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, padding: 24 },
  emptyIcon: { color: "var(--text-secondary)", opacity: 0.35, marginBottom: 4 },
  emptyTitle: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-lg)", fontWeight: 500, color: "var(--text-primary)" },
  emptyHint: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-sm)", color: "var(--text-secondary)" },
  statusBar: { display: "flex", alignItems: "center", gap: 8, padding: "4px 14px", background: "rgba(255,180,0,0.08)", borderTop: "1px solid rgba(255,180,0,0.2)" },
  statusItem: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-xs)", color: "var(--warning, #f0ad4e)", fontWeight: 500 },
  modelBadge: { fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 400, color: "var(--text-secondary)", background: "rgba(255,255,255,0.05)", padding: "0 5px", borderRadius: 3, letterSpacing: "normal", textTransform: "none" as const },
  systemRow: { display: "flex", alignItems: "center", gap: 6, padding: "4px 14px", margin: "2px 0" },
  systemIcon: { fontSize: 11, color: "var(--accent)", opacity: 0.7, flexShrink: 0 },
  systemText: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontStyle: "italic" },
  sessionLoading: { display: "flex", flexDirection: "column" as const, gap: 12, padding: "40px 24px", height: "100%" },
  copyMsgBtn: { marginLeft: "auto", display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, padding: 0, background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", borderRadius: "var(--radius-sm)", opacity: 0.6, transition: "opacity 0.1s" },
  sessionConfirmOverlay: { position: "absolute" as const, inset: 0, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" },
  sessionConfirmText: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-xs)", color: "var(--text-primary)", fontWeight: 500 },
  sessionConfirmYes: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-xs)", fontWeight: 500, color: "#fff", background: "var(--error, #f87171)", border: "none", borderRadius: "var(--radius-sm)", padding: "2px 8px", cursor: "pointer" },
  sessionConfirmNo: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-secondary)", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "2px 8px", cursor: "pointer" },
};
