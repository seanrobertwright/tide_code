import { useState, useEffect, useRef } from "react";
import { useStreamStore } from "../../stores/stream";
import { sendPrompt, abortAgent } from "../../lib/ipc";
import { LogsTab } from "./LogsTab";
import { MessageRenderer } from "./MessageRenderer";

type TabId = "chat" | "logs";

export function AgentPanel() {
  const [activeTab, setActiveTab] = useState<TabId>("chat");
  const [input, setInput] = useState("");
  const { content, isStreaming, activeToolCalls, reset } = useStreamStore();
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [content]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const msg = input.trim();
    setInput("");
    reset();
    try {
      await sendPrompt(msg);
    } catch (err) {
      console.error("Send failed:", err);
    }
  };

  const handleAbort = async () => {
    try {
      await abortAgent();
    } catch (err) {
      console.error("Abort failed:", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={panelStyles.container}>
      {/* Tab bar */}
      <div style={panelStyles.tabBar}>
        <button
          style={{
            ...panelStyles.tab,
            ...(activeTab === "chat" ? panelStyles.tabActive : {}),
          }}
          onClick={() => setActiveTab("chat")}
        >
          Chat
        </button>
        <button
          style={{
            ...panelStyles.tab,
            ...(activeTab === "logs" ? panelStyles.tabActive : {}),
          }}
          onClick={() => setActiveTab("logs")}
        >
          Logs
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "chat" ? (
        <>
          <div ref={outputRef} style={panelStyles.output}>
            {content ? (
              <MessageRenderer content={content} />
            ) : (
              <p style={panelStyles.placeholder}>
                Send a message to start the agent...
              </p>
            )}
            {activeToolCalls.filter((tc) => tc.status === "running").length > 0 && (
              <div style={panelStyles.toolCalls}>
                {activeToolCalls
                  .filter((tc) => tc.status === "running")
                  .map((tc) => (
                    <span key={tc.id} style={panelStyles.toolCallBadge}>
                      {tc.toolName}...
                    </span>
                  ))}
              </div>
            )}
            {isStreaming && <span style={panelStyles.cursor}>|</span>}
          </div>
          <div style={panelStyles.inputArea}>
            <textarea
              style={panelStyles.textarea}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Cmd+Enter)"
              rows={2}
              disabled={isStreaming}
            />
            {isStreaming ? (
              <button style={panelStyles.abortButton} onClick={handleAbort}>
                Stop
              </button>
            ) : (
              <button
                style={{
                  ...panelStyles.button,
                  opacity: !input.trim() ? 0.5 : 1,
                }}
                onClick={handleSend}
                disabled={!input.trim()}
              >
                Send
              </button>
            )}
          </div>
        </>
      ) : (
        <LogsTab />
      )}
    </div>
  );
}

const panelStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "var(--bg-secondary)",
  },
  tabBar: {
    display: "flex",
    height: 32,
    background: "var(--bg-tertiary)",
    borderBottom: "1px solid var(--border)",
  },
  tab: {
    padding: "0 16px",
    fontSize: "var(--font-size-sm)",
    fontFamily: "var(--font-ui)",
    fontWeight: 500,
    color: "var(--text-secondary)",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    cursor: "pointer",
  },
  tabActive: {
    color: "var(--text-bright)",
    borderBottomColor: "var(--accent)",
  },
  output: {
    flex: 1,
    overflow: "auto",
    padding: 12,
  },
  outputText: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-sm)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    margin: 0,
    lineHeight: 1.5,
  },
  placeholder: {
    color: "var(--text-secondary)",
    fontStyle: "italic",
    fontSize: "var(--font-size-sm)",
  },
  cursor: {
    color: "var(--accent)",
  },
  inputArea: {
    display: "flex",
    gap: 6,
    padding: 8,
    borderTop: "1px solid var(--border)",
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    padding: "6px 8px",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    background: "var(--bg-input)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    resize: "none",
    outline: "none",
  },
  button: {
    padding: "6px 12px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    fontWeight: 500,
    color: "white",
    background: "var(--accent)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  abortButton: {
    padding: "6px 12px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    fontWeight: 500,
    color: "white",
    background: "var(--error)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  toolCalls: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 4,
    marginTop: 8,
  },
  toolCallBadge: {
    display: "inline-block",
    padding: "2px 8px",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
  },
};
