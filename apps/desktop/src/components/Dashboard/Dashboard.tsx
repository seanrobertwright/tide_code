import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface RecentWorkspace {
  path: string;
  name: string;
  lastOpened: string;
}

const RECENT_WORKSPACES_KEY = "tide_recent_workspaces";

function loadRecentWorkspaces(): RecentWorkspace[] {
  try {
    const raw = localStorage.getItem(RECENT_WORKSPACES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecentWorkspace(path: string): void {
  const workspaces = loadRecentWorkspaces().filter((w) => w.path !== path);
  workspaces.unshift({
    path,
    name: path.split("/").pop() || path,
    lastOpened: new Date().toISOString(),
  });
  // Keep last 10
  localStorage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(workspaces.slice(0, 10)));
}

interface DashboardProps {
  onOpenFolder: () => void;
  onOpenWorkspace: (path: string) => void;
}

export function Dashboard({ onOpenFolder, onOpenWorkspace }: DashboardProps) {
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>([]);

  useEffect(() => {
    setRecentWorkspaces(loadRecentWorkspaces());
  }, []);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      if (diff < 86400000) return "Today";
      if (diff < 172800000) return "Yesterday";
      if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;
      return d.toLocaleDateString();
    } catch {
      return "";
    }
  };

  return (
    <div style={s.container}>
      <div style={s.inner}>
        {/* Hero */}
        <div style={s.hero}>
          <h1 style={s.title}>Tide</h1>
          <p style={s.subtitle}>Agentic Coding Environment</p>
        </div>

        {/* Quick actions */}
        <div style={s.actions}>
          <button style={s.actionBtn} onClick={onOpenFolder}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <path d="M1 3h5l1.5 1.5H15v9H1V3z" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
            <span>Open Folder</span>
          </button>
        </div>

        {/* Recent workspaces */}
        {recentWorkspaces.length > 0 && (
          <div style={s.section}>
            <h3 style={s.sectionTitle}>Recent</h3>
            <div style={s.recentList}>
              {recentWorkspaces.map((w) => (
                <button
                  key={w.path}
                  style={s.recentItem}
                  onClick={() => onOpenWorkspace(w.path)}
                  title={w.path}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M1 2h5l1 1h7v10H1V2z" stroke="currentColor" strokeWidth="1.2" fill="none" />
                  </svg>
                  <div style={s.recentInfo}>
                    <span style={s.recentName}>{w.name}</span>
                    <span style={s.recentPath}>{w.path}</span>
                  </div>
                  <span style={s.recentDate}>{formatDate(w.lastOpened)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Keyboard shortcuts hint */}
        <div style={s.hints}>
          <span style={s.hint}>Cmd+Shift+P — Command Palette</span>
          <span style={s.hint}>Cmd+O — Open Folder</span>
          <span style={s.hint}>Cmd+S — Save File</span>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    background: "var(--bg-primary)",
  },
  inner: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 32,
    maxWidth: 480,
    width: "100%",
    padding: "0 24px",
  },
  hero: {
    textAlign: "center" as const,
  },
  title: {
    fontSize: 36,
    fontWeight: 200,
    color: "var(--text-bright)",
    margin: 0,
    fontFamily: "var(--font-ui)",
    letterSpacing: "-0.5px",
  },
  subtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    marginTop: 4,
    fontFamily: "var(--font-ui)",
  },
  actions: {
    display: "flex",
    gap: 12,
  },
  actionBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 20px",
    fontFamily: "var(--font-ui)",
    fontSize: 13,
    color: "var(--text-primary)",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    cursor: "pointer",
    transition: "background 0.15s",
  },
  section: {
    width: "100%",
  },
  sectionTitle: {
    fontFamily: "var(--font-ui)",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    marginBottom: 8,
  },
  recentList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  recentItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    fontFamily: "var(--font-ui)",
    fontSize: 13,
    color: "var(--text-primary)",
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 4,
    cursor: "pointer",
    textAlign: "left" as const,
    width: "100%",
    transition: "background 0.15s",
  },
  recentInfo: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflow: "hidden",
  },
  recentName: {
    fontWeight: 500,
    fontSize: 13,
  },
  recentPath: {
    fontSize: 11,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  recentDate: {
    fontSize: 11,
    color: "var(--text-secondary)",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  hints: {
    display: "flex",
    gap: 16,
    marginTop: 16,
  },
  hint: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--text-tertiary, var(--text-secondary))",
  },
};
