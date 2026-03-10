import { useEffect, useState } from "react";
import { installCli, getVersionInfo, type VersionInfo } from "../../lib/ipc";
import { useSettingsStore } from "../../stores/settingsStore";
import { terminalThemes } from "../../lib/terminalThemes";
import { appThemes } from "../../lib/appThemes";

export function GeneralSettings() {
  const [cliStatus, setCliStatus] = useState<string | null>(null);
  const [cliError, setCliError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [versions, setVersions] = useState<VersionInfo | null>(null);
  const appTheme = useSettingsStore((s) => s.appTheme);
  const setAppTheme = useSettingsStore((s) => s.setAppTheme);
  const terminalTheme = useSettingsStore((s) => s.terminalTheme);
  const terminalScrollback = useSettingsStore((s) => s.terminalScrollback);
  const setTerminalTheme = useSettingsStore((s) => s.setTerminalTheme);
  const setTerminalScrollback = useSettingsStore((s) => s.setTerminalScrollback);

  useEffect(() => {
    getVersionInfo().then(setVersions).catch(() => {});
  }, []);

  const handleInstallCli = async () => {
    setInstalling(true);
    setCliStatus(null);
    setCliError(null);
    try {
      const msg = await installCli();
      setCliStatus(msg);
    } catch (e: any) {
      setCliError(typeof e === "string" ? e : e?.message || "Failed to install CLI");
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div>
      <h2 style={s.title}>General</h2>

      {versions && (
        <div style={s.section}>
          <h3 style={s.sectionTitle}>About</h3>
          <div style={s.versionRow}>
            <span style={s.versionLabel}>Tide</span>
            <code style={s.versionValue}>v{versions.tide}</code>
          </div>
          <div style={s.versionRow}>
            <span style={s.versionLabel}>Pi Agent</span>
            <code style={s.versionValue}>v{versions.pi}</code>
          </div>
        </div>
      )}

      <div style={s.section}>
        <h3 style={s.sectionTitle}>Command Line</h3>
        <p style={s.description}>
          Install the <code style={s.code}>tide</code> command to open folders from your terminal.
        </p>
        <p style={s.description}>
          After installing, use <code style={s.code}>tide .</code> to open the current folder,
          or <code style={s.code}>tide /path/to/project</code> to open a specific folder.
        </p>
        <button
          style={s.button}
          onClick={handleInstallCli}
          disabled={installing}
        >
          {installing ? "Installing..." : "Install 'tide' command"}
        </button>
        {cliStatus && <p style={s.success}>{cliStatus}</p>}
        {cliError && <pre style={s.error}>{cliError}</pre>}
      </div>

      <div style={s.section}>
        <h3 style={s.sectionTitle}>Appearance</h3>
        <div style={s.settingRow}>
          <label style={s.settingLabel}>App Theme</label>
          <select
            style={s.select}
            value={appTheme}
            onChange={(e) => setAppTheme(e.target.value)}
          >
            {Object.keys(appThemes).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <p style={s.description}>
          Changes the color scheme of the entire application.
        </p>
      </div>

      <div style={s.section}>
        <h3 style={s.sectionTitle}>Terminal</h3>
        <div style={s.settingRow}>
          <label style={s.settingLabel}>Theme</label>
          <select
            style={s.select}
            value={terminalTheme}
            onChange={(e) => setTerminalTheme(e.target.value)}
          >
            {Object.keys(terminalThemes).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div style={s.settingRow}>
          <label style={s.settingLabel}>Scrollback lines</label>
          <input
            style={s.numberInput}
            type="number"
            min={500}
            max={50000}
            step={500}
            value={terminalScrollback}
            onChange={(e) => setTerminalScrollback(parseInt(e.target.value) || 5000)}
          />
        </div>
        <p style={s.description}>
          Scrollback changes apply to new terminal tabs.
        </p>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  title: {
    fontSize: "var(--font-size-lg)",
    fontWeight: 700,
    color: "var(--text-bright)",
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: "var(--font-size-base)",
    fontWeight: 600,
    color: "var(--text-bright)",
    marginBottom: 8,
  },
  description: {
    fontSize: "var(--font-size-sm)",
    color: "var(--text-secondary)",
    marginBottom: 8,
    lineHeight: 1.5,
  },
  code: {
    background: "var(--bg-tertiary)",
    padding: "2px 6px",
    borderRadius: 4,
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
  },
  button: {
    padding: "8px 16px",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: "var(--font-size-sm)",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 4,
  },
  success: {
    marginTop: 8,
    fontSize: "var(--font-size-sm)",
    color: "var(--success, #4ade80)",
  },
  versionRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 0",
    borderBottom: "1px solid var(--border)",
  },
  versionLabel: {
    fontSize: "var(--font-size-sm)",
    color: "var(--text-secondary)",
  },
  versionValue: {
    fontSize: "var(--font-size-sm)",
    fontFamily: "var(--font-mono)",
    color: "var(--text-bright)",
    background: "var(--bg-tertiary)",
    padding: "2px 8px",
    borderRadius: 4,
  },
  error: {
    marginTop: 8,
    fontSize: "var(--font-size-xs)",
    color: "var(--error, #f87171)",
    background: "var(--bg-tertiary)",
    padding: 12,
    borderRadius: 6,
    whiteSpace: "pre-wrap",
    fontFamily: "var(--font-mono)",
  },
  settingRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid var(--border)",
  },
  settingLabel: {
    fontSize: "var(--font-size-sm)",
    color: "var(--text-secondary)",
  },
  select: {
    padding: "4px 8px",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    fontFamily: "var(--font-ui)",
  },
  numberInput: {
    width: 80,
    padding: "4px 8px",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    fontFamily: "var(--font-mono)",
    textAlign: "right" as const,
  },
};
