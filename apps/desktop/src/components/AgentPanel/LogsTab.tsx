import { useEffect, useState } from "react";
import { useLogStore, type ToolLogEntry } from "../../stores/logStore";

const STATUS_COLORS: Record<string, string> = {
  success: "var(--success)",
  error: "var(--error)",
  running: "var(--warning)",
  cancelled: "var(--text-secondary)",
};

export function LogsTab() {
  const { logs, filterTool, filterStatus, setFilterTool, setFilterStatus, fetchLogs } =
    useLogStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const filtered = logs.filter((log) => {
    if (filterTool && !log.toolName.includes(filterTool)) return false;
    if (filterStatus && log.status !== filterStatus) return false;
    return true;
  });

  return (
    <div style={s.container}>
      {/* Filters */}
      <div style={s.filters}>
        <input
          style={s.filterInput}
          placeholder="Filter by tool..."
          value={filterTool}
          onChange={(e) => setFilterTool(e.target.value)}
        />
        <select
          style={s.filterSelect}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="running">Running</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Log entries */}
      <div style={s.list}>
        {filtered.length === 0 ? (
          <p style={s.empty}>No tool logs yet</p>
        ) : (
          filtered.map((log) => (
            <LogEntry
              key={log.id}
              log={log}
              expanded={expandedId === log.id}
              onToggle={() =>
                setExpandedId(expandedId === log.id ? null : log.id)
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function LogEntry({
  log,
  expanded,
  onToggle,
}: {
  log: ToolLogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusColor = STATUS_COLORS[log.status] ?? "var(--text-secondary)";

  return (
    <div style={s.entry}>
      <div style={s.entryHeader} onClick={onToggle}>
        <span style={{ ...s.statusDot, background: statusColor }} />
        <span style={s.toolName}>{log.toolName}</span>
        {log.durationMs != null && (
          <span style={s.duration}>{log.durationMs}ms</span>
        )}
        <span style={{ ...s.statusBadge, color: statusColor }}>
          {log.status}
        </span>
        <span style={s.chevron}>{expanded ? "\u25BC" : "\u25B6"}</span>
      </div>
      {expanded && (
        <div style={s.details}>
          <div style={s.detailRow}>
            <span style={s.detailLabel}>Arguments:</span>
            <pre style={s.detailCode}>{log.argsJson}</pre>
          </div>
          {log.resultJson && (
            <div style={s.detailRow}>
              <span style={s.detailLabel}>Result:</span>
              <pre style={s.detailCode}>{log.resultJson}</pre>
            </div>
          )}
          {log.error && (
            <div style={s.detailRow}>
              <span style={s.detailLabel}>Error:</span>
              <span style={{ color: "var(--error)" }}>{log.error}</span>
            </div>
          )}
          <div style={s.detailRow}>
            <span style={s.detailLabel}>Safety:</span>
            <span>{log.safetyLevel}</span>
            {log.approvalRequired && (
              <span style={s.approvalBadge}>approval required</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
  },
  filters: {
    display: "flex",
    gap: 6,
    padding: 8,
    borderBottom: "1px solid var(--border)",
  },
  filterInput: {
    flex: 1,
    padding: "4px 8px",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    background: "var(--bg-input)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    outline: "none",
  },
  filterSelect: {
    padding: "4px 8px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    background: "var(--bg-input)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    outline: "none",
  },
  list: {
    flex: 1,
    overflow: "auto",
  },
  empty: {
    padding: 16,
    color: "var(--text-secondary)",
    fontStyle: "italic",
    fontSize: "var(--font-size-sm)",
    textAlign: "center",
  },
  entry: {
    borderBottom: "1px solid var(--border)",
  },
  entryHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: "var(--font-size-sm)",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
  },
  toolName: {
    fontFamily: "var(--font-mono)",
    color: "var(--text-bright)",
    flex: 1,
  },
  duration: {
    color: "var(--text-secondary)",
    fontSize: "var(--font-size-xs)",
  },
  statusBadge: {
    fontSize: "var(--font-size-xs)",
    fontWeight: 600,
  },
  chevron: {
    fontSize: 8,
    color: "var(--text-secondary)",
  },
  details: {
    padding: "8px 12px 12px 26px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  detailRow: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    fontSize: "var(--font-size-xs)",
  },
  detailLabel: {
    color: "var(--text-secondary)",
    fontWeight: 600,
  },
  detailCode: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    background: "var(--bg-primary)",
    padding: 8,
    borderRadius: "var(--radius-sm)",
    overflow: "auto",
    maxHeight: 120,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    margin: 0,
  },
  approvalBadge: {
    display: "inline-block",
    padding: "1px 6px",
    background: "var(--warning)",
    color: "#1a1a1a",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 600,
    marginLeft: 6,
  },
};
