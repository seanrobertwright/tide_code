import { useEffect, useState, useCallback } from "react";
import { listSkills, manageSkill, type SkillInfo } from "../../lib/ipc";

export function SkillsPlaceholder() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installSource, setInstallSource] = useState("");
  const [installing, setInstalling] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listSkills();
      setSkills(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const handleInstall = async () => {
    const src = installSource.trim();
    if (!src) return;
    setInstalling(true);
    setActionMsg(null);
    try {
      const result = await manageSkill("install", src);
      setActionMsg({ type: "ok", text: result || `Installed ${src}` });
      setInstallSource("");
      await loadSkills();
    } catch (e) {
      setActionMsg({ type: "err", text: String(e) });
    } finally {
      setInstalling(false);
    }
  };

  const handleRemove = async (skill: SkillInfo) => {
    // Use the package name from source (e.g. "package:pi-skills" → "pi-skills")
    const source = skill.source.startsWith("package:")
      ? skill.source.replace("package:", "")
      : skill.path;
    setActionMsg(null);
    try {
      const result = await manageSkill("remove", source);
      setActionMsg({ type: "ok", text: result || `Removed ${skill.name}` });
      await loadSkills();
    } catch (e) {
      setActionMsg({ type: "err", text: String(e) });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !installing) {
      handleInstall();
    }
  };

  return (
    <div>
      <div style={s.header}>
        <h3 style={s.heading}>Skills</h3>
        <button style={s.refreshBtn} onClick={loadSkills} title="Refresh">
          ↻
        </button>
      </div>
      <p style={s.description}>
        Pi skills are capability packages that load on-demand. Install from npm
        packages, git repos, or local paths.
      </p>

      {/* Install bar */}
      <div style={s.installRow}>
        <input
          style={s.installInput}
          type="text"
          placeholder="npm package, git:url, or local path..."
          value={installSource}
          onChange={(e) => setInstallSource(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={installing}
        />
        <button
          style={s.installBtn}
          onClick={handleInstall}
          disabled={installing || !installSource.trim()}
        >
          {installing ? "Installing..." : "Install"}
        </button>
      </div>

      <p style={s.hint}>
        Examples: <code style={s.code}>pi-skills</code> (npm),{" "}
        <code style={s.code}>git:github.com/user/repo</code>,{" "}
        <code style={s.code}>./my-skill</code> (local).
        Pi restart required after install.
      </p>

      {/* Status messages */}
      {actionMsg && (
        <p style={actionMsg.type === "ok" ? s.success : s.error}>
          {actionMsg.text}
        </p>
      )}

      {loading && <p style={s.status}>Discovering skills...</p>}
      {error && <p style={s.error}>Error: {error}</p>}

      {!loading && skills.length === 0 && (
        <div style={s.empty}>
          <p style={s.emptyText}>No skills installed.</p>
        </div>
      )}

      {skills.length > 0 && (
        <div style={s.list}>
          {skills.map((skill) => (
            <div key={skill.path} style={s.card}>
              <div style={s.cardHeader}>
                <span style={s.name}>{skill.name}</span>
                <div style={s.cardActions}>
                  <span style={s.badge}>{skill.source}</span>
                  <button
                    style={s.removeBtn}
                    onClick={() => handleRemove(skill)}
                    title={`Remove ${skill.name}`}
                  >
                    ×
                  </button>
                </div>
              </div>
              {skill.description && (
                <p style={s.cardDesc}>{skill.description}</p>
              )}
              <p style={s.cardPath}>{skill.path}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  heading: {
    margin: 0,
    fontSize: "var(--font-size-lg)",
    fontWeight: 600,
    color: "var(--text-bright)",
  },
  refreshBtn: {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: 4,
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontSize: 14,
    padding: "2px 6px",
  },
  description: {
    fontSize: "var(--font-size-sm)",
    color: "var(--text-secondary)",
    marginBottom: 12,
  },
  installRow: {
    display: "flex",
    gap: 8,
    marginBottom: 8,
  },
  installInput: {
    flex: 1,
    padding: "6px 10px",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    outline: "none",
  },
  installBtn: {
    padding: "6px 14px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    fontWeight: 600,
    color: "var(--text-bright)",
    background: "var(--accent)",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  hint: {
    fontSize: "var(--font-size-xs, 11px)",
    color: "var(--text-tertiary, #6c7086)",
    margin: "0 0 12px 0",
  },
  code: {
    background: "var(--bg-secondary, #1e1e2e)",
    padding: "1px 4px",
    borderRadius: 3,
    fontSize: "0.9em",
  },
  status: {
    fontSize: "var(--font-size-sm)",
    color: "var(--text-secondary)",
    fontStyle: "italic",
  },
  success: {
    fontSize: "var(--font-size-sm)",
    color: "var(--success, #a6e3a1)",
    margin: "0 0 8px 0",
  },
  error: {
    fontSize: "var(--font-size-sm)",
    color: "var(--error, #f38ba8)",
    margin: "0 0 8px 0",
    wordBreak: "break-word" as const,
  },
  empty: {
    padding: "16px 0",
  },
  emptyText: {
    fontSize: "var(--font-size-sm)",
    color: "var(--text-secondary)",
    fontStyle: "italic",
    margin: 0,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  card: {
    background: "var(--bg-secondary, #1e1e2e)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "10px 12px",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  cardActions: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  name: {
    fontWeight: 600,
    fontSize: "var(--font-size-sm)",
    color: "var(--text-bright)",
  },
  badge: {
    fontSize: "var(--font-size-xs, 11px)",
    color: "var(--text-secondary)",
    background: "var(--bg-tertiary, #313244)",
    padding: "1px 6px",
    borderRadius: 3,
  },
  removeBtn: {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: 3,
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
    padding: "0 4px",
    opacity: 0.6,
  },
  cardDesc: {
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    margin: "0 0 4px 0",
  },
  cardPath: {
    fontSize: "var(--font-size-xs, 11px)",
    color: "var(--text-tertiary, #6c7086)",
    margin: 0,
    fontFamily: "monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
};
