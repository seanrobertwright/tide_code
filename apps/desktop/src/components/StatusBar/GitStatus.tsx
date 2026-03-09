import { useEffect, useState } from "react";
import { getGitStatus, type GitStatusInfo } from "../../lib/ipc";
import { useWorkspaceStore } from "../../stores/workspace";

export function GitStatus() {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const [info, setInfo] = useState<GitStatusInfo | null>(null);

  useEffect(() => {
    if (!rootPath) {
      setInfo(null);
      return;
    }

    let cancelled = false;

    const refresh = async () => {
      try {
        const status = await getGitStatus();
        if (!cancelled) setInfo(status);
      } catch {
        if (!cancelled) setInfo(null);
      }
    };

    refresh();
    const interval = setInterval(refresh, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [rootPath]);

  if (!info) return null;

  const dirty = info.changed + info.staged + info.untracked;

  return (
    <div style={s.container}>
      <svg width={12} height={12} viewBox="0 0 16 16" style={s.icon}>
        <circle cx="8" cy="3" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8" cy="13" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <line x1="8" y1="5" x2="8" y2="11" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span style={s.branch}>{info.branch}</span>
      {dirty > 0 && (
        <span style={s.dirty}>
          {dirty > 99 ? "99+" : dirty}
        </span>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  icon: {
    color: "var(--text-secondary)",
    flexShrink: 0,
  },
  branch: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
  },
  dirty: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 600,
    color: "var(--warning)",
  },
};
