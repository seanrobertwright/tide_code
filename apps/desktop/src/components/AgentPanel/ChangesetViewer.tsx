import { useEffect, useState } from "react";
import { gitChangedFiles, type ChangedFile } from "../../lib/ipc";
import { openFileByPath } from "../../lib/fileHelpers";
import { useOrchestrationStore } from "../../stores/orchestrationStore";

const STATUS_LABELS: Record<string, { letter: string; color: string }> = {
  modified: { letter: "M", color: "var(--warning, #fb923c)" },
  added: { letter: "A", color: "var(--success, #4ade80)" },
  deleted: { letter: "D", color: "var(--error, #f87171)" },
  renamed: { letter: "R", color: "var(--accent)" },
  untracked: { letter: "?", color: "var(--text-secondary)" },
};

export function ChangesetViewer() {
  const phase = useOrchestrationStore((s) => s.phase);
  const reset = useOrchestrationStore((s) => s.reset);
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (phase !== "complete") return;
    setLoading(true);
    gitChangedFiles()
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [phase]);

  if (phase !== "complete") return null;

  return (
    <div style={s.card}>
      <div style={s.header}>
        <span style={s.headerIcon}>&#x2713;</span>
        <span style={s.headerText}>
          Orchestration Complete
        </span>
        {!loading && (
          <span style={s.fileCount}>
            {files.length} file{files.length !== 1 ? "s" : ""} changed
          </span>
        )}
        <button style={s.dismissBtn} onClick={reset} title="Dismiss">
          &times;
        </button>
      </div>

      {loading ? (
        <div style={s.loadingText}>Loading changes...</div>
      ) : files.length === 0 ? (
        <div style={s.emptyText}>No file changes detected.</div>
      ) : (
        <div style={s.fileList}>
          {files.map((f) => {
            const info = STATUS_LABELS[f.status] || STATUS_LABELS.untracked;
            return (
              <button
                key={f.path}
                style={s.fileRow}
                onClick={() => openFileByPath(f.path)}
                title={`Open ${f.path}`}
              >
                <span style={{ ...s.statusLetter, color: info.color }}>
                  {info.letter}
                </span>
                <span style={s.filePath}>{f.path}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  card: {
    margin: "8px 0",
    padding: "10px 14px",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderLeft: "2px solid var(--success, #4ade80)",
    borderRadius: "var(--radius-md)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  headerIcon: {
    fontSize: 12,
    color: "var(--success, #4ade80)",
    fontWeight: 700,
  },
  headerText: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    fontWeight: 600,
    color: "var(--text-primary)",
    flex: 1,
  },
  fileCount: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--text-secondary)",
  },
  dismissBtn: {
    background: "transparent",
    border: "none",
    fontFamily: "var(--font-ui)",
    fontSize: 14,
    color: "var(--text-secondary)",
    cursor: "pointer",
    padding: "0 2px",
    lineHeight: 1,
  },
  fileList: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    maxHeight: 200,
    overflow: "auto",
  },
  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "3px 6px",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    textAlign: "left" as const,
    width: "100%",
  },
  statusLetter: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 600,
    width: 12,
    textAlign: "center" as const,
    flexShrink: 0,
  },
  filePath: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  loadingText: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    fontStyle: "italic",
  },
  emptyText: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
  },
};
