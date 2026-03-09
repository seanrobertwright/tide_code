import { useState, useEffect, useCallback } from "react";
import { useStreamStore } from "../../stores/stream";
import { listSessions, switchSession, newSession, deleteSession, type SessionInfo } from "../../lib/ipc";

export function SessionHistoryTab() {
  const sessionDir = useStreamStore((s) => s.sessionDir);
  const currentSessionId = useStreamStore((s) => s.sessionId);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listSessions(sessionDir || undefined);
      setSessions(list);
    } catch (err) {
      console.error("[Tide] Failed to list sessions:", err);
    } finally {
      setLoading(false);
    }
  }, [sessionDir]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSwitch = async (session: SessionInfo) => {
    // Don't switch to the already-active session
    if (currentSessionId && session.file.includes(currentSessionId)) return;
    try {
      await switchSession(session.file);
    } catch (err) {
      console.error("[Tide] Failed to switch session:", err);
    }
  };

  const handleNew = async () => {
    try {
      await newSession();
      refresh();
    } catch (err) {
      console.error("[Tide] Failed to create new session:", err);
    }
  };

  const handleDelete = async (session: SessionInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    const isActive = currentSessionId ? session.file.includes(currentSessionId) : false;
    try {
      await deleteSession(session.file, isActive);
      refresh();
    } catch (err) {
      console.error("[Tide] Failed to delete session:", err);
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "";
    try {
      const d = new Date(timestamp);
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      if (diff < 60000) return "Just now";
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      if (diff < 172800000) return "Yesterday";
      if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
      return d.toLocaleDateString();
    } catch {
      return "";
    }
  };

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>Sessions</span>
        <div style={s.headerActions}>
          <button style={s.headerBtn} onClick={handleNew} title="New Session">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <button style={s.headerBtn} onClick={refresh} title="Refresh">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M14 8A6 6 0 1 1 8 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M14 2v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div style={s.empty}>Loading...</div>
      ) : sessions.length === 0 ? (
        <div style={s.empty}>No sessions found.</div>
      ) : (
        <div style={s.list}>
          {sessions.map((session) => {
            const isActive = currentSessionId ? session.file.includes(currentSessionId) : false;
            return (
              <button
                key={session.file}
                style={{ ...s.entry, ...(isActive ? s.entryActive : {}) }}
                onClick={() => handleSwitch(session)}
                title={session.file}
              >
                <div style={s.entryTop}>
                  <span style={s.entryName}>
                    {session.name || "Untitled"}
                  </span>
                  {isActive && <span style={s.activeBadge}>active</span>}
                </div>
                <div style={s.entryMeta}>
                  {session.messageCount != null && (
                    <span>{session.messageCount} msgs</span>
                  )}
                  <span>{formatDate(session.updatedAt)}</span>
                </div>
                {!isActive && (
                  <button
                    style={s.deleteBtn}
                    onClick={(e) => handleDelete(session, e)}
                    title="Delete session"
                  >
                    ×
                  </button>
                )}
              </button>
            );
          })}
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
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
  },
  title: {
    fontFamily: "var(--font-ui)",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  headerActions: {
    display: "flex",
    gap: 4,
  },
  headerBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    padding: 4,
    borderRadius: 3,
    display: "flex",
    alignItems: "center",
  },
  list: {
    flex: 1,
    overflow: "auto",
    padding: "4px 0",
  },
  entry: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
    padding: "8px 12px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
    background: "transparent",
    border: "none",
    width: "100%",
    textAlign: "left" as const,
    cursor: "pointer",
    position: "relative" as const,
    fontFamily: "var(--font-ui)",
  },
  entryActive: {
    background: "rgba(122, 162, 247, 0.06)",
  },
  entryTop: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  entryName: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    flex: 1,
  },
  activeBadge: {
    fontSize: 9,
    fontWeight: 600,
    color: "var(--accent)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    flexShrink: 0,
  },
  entryMeta: {
    display: "flex",
    gap: 8,
    fontSize: 10,
    color: "var(--text-secondary)",
  },
  deleteBtn: {
    position: "absolute" as const,
    top: 6,
    right: 8,
    background: "transparent",
    border: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
    padding: "0 2px",
    opacity: 0.5,
  },
  empty: {
    fontFamily: "var(--font-ui)",
    fontSize: 12,
    color: "var(--text-secondary)",
    padding: 16,
    textAlign: "center" as const,
  },
};
