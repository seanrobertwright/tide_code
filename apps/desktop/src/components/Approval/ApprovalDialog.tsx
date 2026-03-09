import { useState, useEffect, useCallback } from "react";
import {
  useApprovalStore,
  type ConfirmRequest,
  type SelectRequest,
  type InputRequest,
  type EditorRequest,
} from "../../stores/approvalStore";
import { usePermissionStore } from "../../stores/permissionStore";
import { DiffPreview } from "../DiffPreview/DiffPreview";

export function ApprovalDialog() {
  const { currentRequest, notifications, dismissNotification } = useApprovalStore();

  return (
    <>
      {/* Modal dialog for interactive requests */}
      {currentRequest && <UiDialog request={currentRequest} />}

      {/* Toast notifications */}
      {notifications.length > 0 && (
        <div style={s.toastContainer}>
          {notifications.map((n) => (
            <div
              key={n.id}
              style={{ ...s.toast, ...toastLevelStyle[n.level] }}
              onClick={() => dismissNotification(n.id)}
            >
              <span style={s.toastIcon}>{toastIcons[n.level]}</span>
              <span>{n.message}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Dialog Router ──────────────────────────────────────────

function UiDialog({ request }: { request: ConfirmRequest | SelectRequest | InputRequest | EditorRequest }) {
  switch (request.method) {
    case "confirm":
      return <ConfirmDialog req={request} />;
    case "select":
      return <SelectDialog req={request} />;
    case "input":
      return <InputDialog req={request} />;
    case "editor":
      return <EditorDialog req={request} />;
    default:
      return null;
  }
}

// ── Confirm Dialog ─────────────────────────────────────────

type RememberScope = "none" | "tool" | "pattern";

function ConfirmDialog({ req }: { req: ConfirmRequest }) {
  const { respond } = useApprovalStore();
  const { addPermission } = usePermissionStore();
  const [rememberScope, setRememberScope] = useState<RememberScope>("none");

  const savePermission = useCallback((decision: "allow" | "deny") => {
    if (rememberScope === "none" || !req.toolName) return;
    if (rememberScope === "tool") {
      addPermission({ toolName: req.toolName, scope: "tool", decision });
    } else if (rememberScope === "pattern" && req.filePath) {
      addPermission({ toolName: req.toolName, scope: "pattern", pattern: req.filePath, decision });
    }
  }, [rememberScope, req.toolName, req.filePath, addPermission]);

  const handleApprove = useCallback(() => {
    savePermission("allow");
    respond(req.requestId, { confirmed: true });
  }, [req.requestId, respond, savePermission]);

  const handleDeny = useCallback(() => {
    savePermission("deny");
    respond(req.requestId, { confirmed: false });
  }, [req.requestId, respond, savePermission]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); handleApprove(); }
      else if (e.key === "Escape") { e.preventDefault(); handleDeny(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleApprove, handleDeny]);

  const isCommand = req.safetyLevel === "command";
  const hasDiff = req.filePath && req.originalContent !== undefined && req.newContent !== undefined;

  return (
    <div style={s.overlay}>
      <div style={{ ...s.dialog, ...(hasDiff ? s.dialogWide : {}) }}>
        <div style={s.header}>
          <span style={s.title}>{req.title}</span>
          {req.safetyLevel && (
            <span style={{ ...s.badge, background: isCommand ? "var(--error)" : "var(--warning)", color: isCommand ? "white" : "#1a1a1a" }}>
              {req.safetyLevel}
            </span>
          )}
        </div>
        <div style={s.body}>
          {req.toolName && <div style={s.toolName}>{req.toolName}</div>}
          {req.message && <pre style={s.pre}>{req.message}</pre>}
        </div>
        {hasDiff && (
          <div style={s.diffContainer}>
            <DiffPreview filePath={req.filePath!} originalContent={req.originalContent!} modifiedContent={req.newContent!} />
          </div>
        )}
        <div style={s.actions}>
          <div style={s.rememberRow}>
            <select
              value={rememberScope}
              onChange={(e) => setRememberScope(e.target.value as RememberScope)}
              style={s.rememberSelect}
            >
              <option value="none">Don't remember</option>
              {req.toolName && <option value="tool">Always allow {req.toolName}</option>}
              {req.filePath && <option value="pattern">Allow for {req.filePath.split("/").pop()}</option>}
            </select>
            <span style={s.hint}>Enter = Approve, Esc = Deny</span>
          </div>
          <div style={s.buttons}>
            <button style={s.denyBtn} onClick={handleDeny}>Deny</button>
            <button style={s.approveBtn} onClick={handleApprove}>Approve</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Select Dialog ──────────────────────────────────────────

function SelectDialog({ req }: { req: SelectRequest }) {
  const { respond } = useApprovalStore();

  const handleSelect = (value: string) => {
    respond(req.requestId, { value });
  };

  const handleCancel = useCallback(() => {
    respond(req.requestId, { cancelled: true });
  }, [req.requestId, respond]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); handleCancel(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleCancel]);

  return (
    <div style={s.overlay}>
      <div style={s.dialog}>
        <div style={s.header}>
          <span style={s.title}>{req.title}</span>
        </div>
        {req.message && (
          <div style={s.body}>
            <p style={s.message}>{req.message}</p>
          </div>
        )}
        <div style={s.optionsList}>
          {req.options.map((opt) => (
            <button
              key={opt.value}
              style={s.optionBtn}
              onClick={() => handleSelect(opt.value)}
            >
              <span style={s.optionLabel}>{opt.label}</span>
              {opt.description && <span style={s.optionDesc}>{opt.description}</span>}
            </button>
          ))}
        </div>
        <div style={s.actions}>
          <span style={s.hint}>Esc = Cancel</span>
          <button style={s.denyBtn} onClick={handleCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Input Dialog ───────────────────────────────────────────

function InputDialog({ req }: { req: InputRequest }) {
  const { respond } = useApprovalStore();
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(() => {
    respond(req.requestId, { value: req.inputType === "number" ? Number(value) : value });
  }, [req.requestId, req.inputType, value, respond]);

  const handleCancel = useCallback(() => {
    respond(req.requestId, { cancelled: true });
  }, [req.requestId, respond]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
      else if (e.key === "Escape") { e.preventDefault(); handleCancel(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSubmit, handleCancel]);

  return (
    <div style={s.overlay}>
      <div style={s.dialog}>
        <div style={s.header}>
          <span style={s.title}>{req.title}</span>
        </div>
        <div style={s.body}>
          {req.message && <p style={s.message}>{req.message}</p>}
          <input
            type={req.inputType === "number" ? "number" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={req.placeholder || "Enter value..."}
            style={s.input}
            autoFocus
          />
        </div>
        <div style={s.actions}>
          <span style={s.hint}>Enter = Submit, Esc = Cancel</span>
          <div style={s.buttons}>
            <button style={s.denyBtn} onClick={handleCancel}>Cancel</button>
            <button style={s.approveBtn} onClick={handleSubmit}>Submit</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Editor Dialog ──────────────────────────────────────────

function EditorDialog({ req }: { req: EditorRequest }) {
  const { respond } = useApprovalStore();
  const [value, setValue] = useState(req.initialValue);

  const handleSubmit = useCallback(() => {
    respond(req.requestId, { value });
  }, [req.requestId, value, respond]);

  const handleCancel = useCallback(() => {
    respond(req.requestId, { cancelled: true });
  }, [req.requestId, respond]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); }
      else if (e.key === "Escape") { e.preventDefault(); handleCancel(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSubmit, handleCancel]);

  return (
    <div style={s.overlay}>
      <div style={{ ...s.dialog, ...s.dialogWide }}>
        <div style={s.header}>
          <span style={s.title}>{req.title}</span>
          {req.language && <span style={s.badge}>{req.language}</span>}
        </div>
        {req.message && (
          <div style={s.body}>
            <p style={s.message}>{req.message}</p>
          </div>
        )}
        <div style={s.editorWrap}>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={s.editor}
            autoFocus
          />
        </div>
        <div style={s.actions}>
          <span style={s.hint}>Cmd+Enter = Submit, Esc = Cancel</span>
          <div style={s.buttons}>
            <button style={s.denyBtn} onClick={handleCancel}>Cancel</button>
            <button style={s.approveBtn} onClick={handleSubmit}>Submit</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Toast Styles ───────────────────────────────────────────

const toastIcons: Record<string, string> = {
  info: "\u2139",
  warning: "\u26A0",
  error: "\u2717",
  success: "\u2713",
};

const toastLevelStyle: Record<string, React.CSSProperties> = {
  info: { borderLeft: "3px solid var(--accent)" },
  warning: { borderLeft: "3px solid var(--warning, #f0ad4e)" },
  error: { borderLeft: "3px solid var(--error)" },
  success: { borderLeft: "3px solid var(--success)" },
};

// ── Styles ─────────────────────────────────────────────────

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
    background: "var(--bg-primary)",
    color: "var(--text-secondary)",
  },
  body: {
    padding: "12px 16px",
  },
  message: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    margin: "0 0 8px 0",
    lineHeight: 1.5,
  },
  toolName: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-md)",
    fontWeight: 600,
    color: "var(--accent)",
    marginBottom: 8,
  },
  pre: {
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
  diffContainer: {
    height: 300,
    borderTop: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
  },

  // Select options
  optionsList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "4px 16px 12px",
    maxHeight: 300,
    overflowY: "auto" as const,
  },
  optionBtn: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "8px 12px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    textAlign: "left" as const,
  },
  optionLabel: {
    fontWeight: 500,
    color: "var(--text-bright)",
  },
  optionDesc: {
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
  },

  // Input
  input: {
    width: "100%",
    padding: "8px 12px",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-bright)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    outline: "none",
    boxSizing: "border-box" as const,
  },

  // Editor
  editorWrap: {
    flex: 1,
    minHeight: 200,
    maxHeight: 400,
    borderTop: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
  },
  editor: {
    width: "100%",
    height: "100%",
    minHeight: 200,
    padding: 12,
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-bright)",
    background: "var(--bg-primary)",
    border: "none",
    resize: "none" as const,
    outline: "none",
    boxSizing: "border-box" as const,
  },

  // Actions
  actions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderTop: "1px solid var(--border)",
  },
  rememberRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  rememberSelect: {
    padding: "3px 8px",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    outline: "none",
    cursor: "pointer",
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

  // Toasts
  toastContainer: {
    position: "fixed",
    bottom: 40,
    right: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    zIndex: 900,
    maxWidth: 360,
  },
  toast: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
    cursor: "pointer",
    animation: "slideIn 0.2s ease-out",
  },
  toastIcon: {
    fontSize: 14,
    flexShrink: 0,
  },
};
