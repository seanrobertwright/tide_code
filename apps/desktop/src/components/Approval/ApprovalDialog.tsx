import { useEffect, useCallback } from "react";
import { useApprovalStore } from "../../stores/approvalStore";
import { DiffPreview } from "../DiffPreview/DiffPreview";

export function ApprovalDialog() {
  const { currentApproval, respondToApproval } = useApprovalStore();

  const handleApprove = useCallback(() => {
    if (currentApproval) {
      respondToApproval(currentApproval.requestId, true);
    }
  }, [currentApproval, respondToApproval]);

  const handleDeny = useCallback(() => {
    if (currentApproval) {
      respondToApproval(currentApproval.requestId, false);
    }
  }, [currentApproval, respondToApproval]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!currentApproval) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleApprove();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleDeny();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentApproval, handleApprove, handleDeny]);

  if (!currentApproval) return null;

  const isCommand = currentApproval.safetyLevel === "command";
  const hasDiff =
    currentApproval.filePath &&
    currentApproval.originalContent !== undefined &&
    currentApproval.newContent !== undefined;

  return (
    <div style={s.overlay}>
      <div style={{ ...s.dialog, ...(hasDiff ? s.dialogWide : {}) }}>
        {/* Header */}
        <div style={s.header}>
          <span style={s.title}>{currentApproval.title}</span>
          {currentApproval.safetyLevel && (
            <span
              style={{
                ...s.badge,
                background: isCommand ? "var(--error)" : "var(--warning)",
                color: isCommand ? "white" : "#1a1a1a",
              }}
            >
              {currentApproval.safetyLevel}
            </span>
          )}
        </div>

        {/* Tool info */}
        <div style={s.toolInfo}>
          {currentApproval.toolName && (
            <div style={s.toolName}>{currentApproval.toolName}</div>
          )}
          {currentApproval.message && (
            <pre style={s.args}>{currentApproval.message}</pre>
          )}
        </div>

        {/* Diff preview (when write/edit tool provides file content) */}
        {hasDiff && (
          <div style={s.diffContainer}>
            <DiffPreview
              filePath={currentApproval.filePath!}
              originalContent={currentApproval.originalContent!}
              modifiedContent={currentApproval.newContent!}
            />
          </div>
        )}

        {/* Actions */}
        <div style={s.actions}>
          <span style={s.hint}>Enter = Approve, Esc = Deny</span>
          <div style={s.buttons}>
            <button style={s.denyBtn} onClick={handleDeny}>
              Deny
            </button>
            <button style={s.approveBtn} onClick={handleApprove}>
              Approve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  dialog: {
    display: "flex",
    flexDirection: "column",
    width: 480,
    maxHeight: "80vh",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    overflow: "hidden",
  },
  dialogWide: {
    width: "80vw",
    maxWidth: 900,
  },
  diffContainer: {
    height: 300,
    borderTop: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    background: "var(--bg-tertiary)",
    borderBottom: "1px solid var(--border)",
  },
  title: {
    fontWeight: 600,
    fontSize: "var(--font-size-md)",
    color: "var(--text-bright)",
  },
  badge: {
    padding: "2px 8px",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 600,
    textTransform: "uppercase" as const,
  },
  toolInfo: {
    padding: "12px 16px",
  },
  toolName: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-md)",
    fontWeight: 600,
    color: "var(--accent)",
    marginBottom: 8,
  },
  args: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    background: "var(--bg-primary)",
    padding: 12,
    borderRadius: "var(--radius-sm)",
    overflow: "auto",
    maxHeight: 200,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    margin: 0,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderTop: "1px solid var(--border)",
  },
  hint: {
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
  },
  buttons: {
    display: "flex",
    gap: 8,
  },
  denyBtn: {
    padding: "6px 16px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    fontWeight: 500,
    color: "white",
    background: "var(--error)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  approveBtn: {
    padding: "6px 16px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    fontWeight: 500,
    color: "white",
    background: "var(--success)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
};
