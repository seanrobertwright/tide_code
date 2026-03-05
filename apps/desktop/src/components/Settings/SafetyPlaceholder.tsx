import { useEffect } from "react";
import { usePermissionStore, type Permission } from "../../stores/permissionStore";

export function SafetyPlaceholder() {
  const { permissions, yoloMode, loaded, load, setYoloMode, removePermission, clearAll } =
    usePermissionStore();

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  return (
    <div>
      <h3 style={s.heading}>Safety Settings</h3>

      {/* Yolo Mode Toggle */}
      <div style={s.yoloRow}>
        <div>
          <div style={s.yoloLabel}>Yolo Mode</div>
          <div style={s.yoloDesc}>
            Auto-approve all tool calls without prompting. Use with caution.
          </div>
        </div>
        <button
          style={{
            ...s.toggle,
            background: yoloMode ? "var(--error)" : "var(--bg-primary)",
          }}
          onClick={() => setYoloMode(!yoloMode)}
        >
          {yoloMode ? "ON" : "OFF"}
        </button>
      </div>

      {/* Saved Permissions */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>Saved Permissions ({permissions.length})</span>
          {permissions.length > 0 && (
            <button style={s.clearBtn} onClick={clearAll}>
              Clear All
            </button>
          )}
        </div>

        {permissions.length === 0 ? (
          <p style={s.empty}>
            No saved permissions yet. Use the "Remember" option in approval dialogs to save permissions.
          </p>
        ) : (
          <div style={s.permList}>
            {permissions.map((p) => (
              <PermissionRow key={p.id} permission={p} onRemove={removePermission} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PermissionRow({ permission: p, onRemove }: { permission: Permission; onRemove: (id: string) => void }) {
  const label =
    p.scope === "tool"
      ? `All ${p.toolName} calls`
      : `${p.toolName} on ${p.pattern || "?"}`;

  return (
    <div style={s.permRow}>
      <span
        style={{
          ...s.permBadge,
          background: p.decision === "allow" ? "var(--success)" : "var(--error)",
        }}
      >
        {p.decision}
      </span>
      <span style={s.permLabel}>{label}</span>
      <span style={s.permDate}>
        {new Date(p.createdAt).toLocaleDateString()}
      </span>
      <button style={s.removeBtn} onClick={() => onRemove(p.id)}>
        x
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: {
    margin: "0 0 16px 0",
    fontSize: "var(--font-size-lg)",
    fontWeight: 600,
    color: "var(--text-bright)",
  },
  yoloRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    marginBottom: 20,
  },
  yoloLabel: {
    fontWeight: 600,
    fontSize: "var(--font-size-sm)",
    color: "var(--text-bright)",
  },
  yoloDesc: {
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    marginTop: 2,
  },
  toggle: {
    padding: "4px 16px",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-sm)",
    fontWeight: 600,
    color: "white",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    minWidth: 50,
    textAlign: "center" as const,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: "var(--font-size-sm)",
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  clearBtn: {
    padding: "2px 8px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    color: "var(--error)",
    background: "transparent",
    border: "1px solid var(--error)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  empty: {
    fontSize: "var(--font-size-sm)",
    color: "var(--text-secondary)",
    fontStyle: "italic",
    margin: 0,
  },
  permList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  permRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-size-xs)",
  },
  permBadge: {
    padding: "1px 6px",
    borderRadius: "var(--radius-sm)",
    fontSize: 10,
    fontWeight: 600,
    color: "white",
    textTransform: "uppercase" as const,
  },
  permLabel: {
    flex: 1,
    fontFamily: "var(--font-mono)",
    color: "var(--text-primary)",
  },
  permDate: {
    color: "var(--text-secondary)",
    fontSize: 10,
  },
  removeBtn: {
    padding: "0 4px",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
  },
};
