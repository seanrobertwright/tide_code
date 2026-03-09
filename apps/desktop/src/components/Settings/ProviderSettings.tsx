import { useEffect, useState } from "react";
import { keychainSetKey, keychainDeleteKey, keychainHasKey } from "../../lib/keychain";
import { restartPi, oauthListProviders, oauthLogout, ptyCreate, type OAuthProviderStatus } from "../../lib/ipc";
import { useTerminalStore } from "../../stores/terminalStore";

interface ProviderConfig {
  id: string;
  name: string;
  placeholder: string;
}

const PROVIDERS: ProviderConfig[] = [
  { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-..." },
  { id: "openai", name: "OpenAI", placeholder: "sk-..." },
  { id: "google", name: "Google AI", placeholder: "AIza..." },
];

const SERVICES: ProviderConfig[] = [
  { id: "tavily", name: "Tavily (Web Search)", placeholder: "tvly-..." },
];

/** Known subscription providers that Pi supports via OAuth */
const SUBSCRIPTION_PROVIDERS: { id: string; name: string; description: string }[] = [
  { id: "openai-codex", name: "OpenAI Codex", description: "ChatGPT Plus/Pro subscription" },
  { id: "anthropic-max", name: "Anthropic Max", description: "Claude Pro/Max subscription" },
  { id: "copilot", name: "GitHub Copilot", description: "GitHub Copilot subscription" },
  { id: "gemini-cli", name: "Google Gemini CLI", description: "Google Gemini subscription" },
];

// Inject spin keyframe once
if (typeof document !== "undefined" && !document.getElementById("tide-spin-kf")) {
  const style = document.createElement("style");
  style.id = "tide-spin-kf";
  style.textContent = "@keyframes spin{to{transform:rotate(360deg)}}";
  document.head.appendChild(style);
}

export function ProviderSettings() {
  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderStatus[]>([]);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [oauthRefreshing, setOauthRefreshing] = useState(false);

  const allKeys = [...PROVIDERS, ...SERVICES];

  useEffect(() => {
    checkAllKeys();
    loadOAuthStatus();
  }, []);

  const checkAllKeys = async () => {
    const status: Record<string, boolean> = {};
    for (const p of allKeys) {
      try {
        status[p.id] = await keychainHasKey(p.id);
      } catch {
        status[p.id] = false;
      }
    }
    setKeyStatus(status);
  };

  const loadOAuthStatus = async () => {
    try {
      const providers = await oauthListProviders();
      setOauthProviders(providers);
    } catch (err) {
      console.error("Failed to load OAuth providers:", err);
    }
  };

  const handleSave = async (providerId: string) => {
    if (!keyInput.trim()) return;
    setSaving(true);
    try {
      await keychainSetKey(providerId, keyInput.trim());
      setKeyStatus((prev) => ({ ...prev, [providerId]: true }));
      setEditing(null);
      setKeyInput("");
      setNeedsRestart(true);
    } catch (err) {
      console.error("Failed to save key:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (providerId: string) => {
    try {
      await keychainDeleteKey(providerId);
      setKeyStatus((prev) => ({ ...prev, [providerId]: false }));
      setNeedsRestart(true);
    } catch (err) {
      console.error("Failed to delete key:", err);
    }
  };

  const handleOpenTerminal = async () => {
    try {
      const ptyId = await ptyCreate();
      useTerminalStore.getState().addTab(ptyId);
      useTerminalStore.getState().setVisible(true);
    } catch (err) {
      console.error("Failed to open terminal:", err);
    }
  };

  const handleRefreshOAuth = async () => {
    setOauthRefreshing(true);
    try {
      await loadOAuthStatus();
    } finally {
      setOauthRefreshing(false);
    }
  };

  const handleOAuthLogout = async (providerId: string) => {
    setOauthLoading(providerId);
    try {
      await oauthLogout(providerId);
      await loadOAuthStatus();
      setNeedsRestart(true);
    } catch (err) {
      console.error("Failed to logout:", err);
    } finally {
      setOauthLoading(null);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await restartPi();
      setNeedsRestart(false);
    } catch (err) {
      console.error("Failed to restart Pi:", err);
    } finally {
      setRestarting(false);
    }
  };

  const handleCancel = () => {
    setEditing(null);
    setKeyInput("");
  };

  const isOAuthLoggedIn = (providerId: string) =>
    oauthProviders.some((p) => p.provider === providerId && p.hasCredentials);

  const renderKeyCard = (item: ProviderConfig) => (
    <div key={item.id} style={s.card}>
      <div style={s.cardHeader}>
        <span style={s.providerName}>{item.name}</span>
        <span
          style={{
            ...s.badge,
            background: keyStatus[item.id]
              ? "var(--success)"
              : "var(--bg-tertiary)",
            color: keyStatus[item.id]
              ? "white"
              : "var(--text-secondary)",
          }}
        >
          {keyStatus[item.id] ? "Configured" : "Not set"}
        </span>
      </div>

      {editing === item.id ? (
        <div style={s.editRow}>
          <input
            style={s.input}
            type="password"
            placeholder={item.placeholder}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave(item.id);
              if (e.key === "Escape") handleCancel();
            }}
            autoFocus
          />
          <button
            style={s.saveBtn}
            onClick={() => handleSave(item.id)}
            disabled={saving || !keyInput.trim()}
          >
            Save
          </button>
          <button style={s.cancelBtn} onClick={handleCancel}>
            Cancel
          </button>
        </div>
      ) : (
        <div style={s.actionRow}>
          <button
            style={s.actionBtn}
            onClick={() => {
              setEditing(item.id);
              setKeyInput("");
            }}
          >
            {keyStatus[item.id] ? "Update" : "Add Key"}
          </button>
          {keyStatus[item.id] && (
            <button
              style={s.deleteBtn}
              onClick={() => handleDelete(item.id)}
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );

  const renderSubscriptionCard = (item: typeof SUBSCRIPTION_PROVIDERS[0]) => {
    const loggedIn = isOAuthLoggedIn(item.id);
    return (
      <div key={item.id} style={s.card}>
        <div style={s.cardHeader}>
          <div>
            <span style={s.providerName}>{item.name}</span>
            <span style={s.subDescription}>{item.description}</span>
          </div>
          <span
            style={{
              ...s.badge,
              background: loggedIn ? "var(--success)" : "var(--bg-tertiary)",
              color: loggedIn ? "white" : "var(--text-secondary)",
            }}
          >
            {loggedIn ? "Connected" : "Not connected"}
          </span>
        </div>
        <div style={s.actionRow}>
          {loggedIn ? (
            <button
              style={s.deleteBtn}
              onClick={() => handleOAuthLogout(item.id)}
              disabled={oauthLoading === item.id}
            >
              {oauthLoading === item.id ? "..." : "Disconnect"}
            </button>
          ) : (
            <div style={s.loginSteps}>
              <div style={s.loginStep}>
                <span style={s.stepNum}>1.</span>
                <span style={s.loginHint}>Open a terminal and run</span>
                <code style={s.commandCode}>pi</code>
                <button
                  style={s.copyBtn}
                  title="Copy command"
                  onClick={() => navigator.clipboard.writeText("pi")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              </div>
              <div style={s.loginStep}>
                <span style={s.stepNum}>2.</span>
                <span style={s.loginHint}>Inside Pi, type</span>
                <code style={s.commandCode}>/login</code>
                <button
                  style={s.copyBtn}
                  title="Copy command"
                  onClick={() => navigator.clipboard.writeText("/login")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              </div>
              <button style={s.openTermBtn} onClick={handleOpenTerminal}>
                Open Terminal
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <h3 style={s.heading}>API Keys</h3>
      <p style={s.description}>
        Keys are stored securely in the macOS Keychain. They are never displayed
        after saving.
      </p>

      {needsRestart && (
        <div style={s.restartBanner}>
          <span>Authentication changed. Restart the agent to apply.</span>
          <button
            style={s.restartBtn}
            onClick={handleRestart}
            disabled={restarting}
          >
            {restarting ? "Restarting..." : "Restart Agent"}
          </button>
        </div>
      )}

      <div style={s.list}>
        {PROVIDERS.map((provider) => renderKeyCard(provider))}
      </div>

      <div style={{ ...s.sectionHeader, marginTop: 24 }}>
        <h3 style={s.heading}>Subscriptions</h3>
        <button
          style={s.refreshBtn}
          onClick={handleRefreshOAuth}
          disabled={oauthRefreshing}
          title="Refresh status"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={oauthRefreshing ? { animation: "spin 1s linear infinite" } : undefined}>
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>
      <p style={s.description}>
        Connect subscription-based AI providers via OAuth. After logging in via{" "}
        <code style={s.inlineCode}>pi</code>, click Refresh above to update status.
      </p>
      <div style={s.list}>
        {SUBSCRIPTION_PROVIDERS.map((sub) => renderSubscriptionCard(sub))}
      </div>

      <h3 style={{ ...s.heading, marginTop: 24 }}>Services</h3>
      <p style={s.description}>
        Optional service keys for extended capabilities like web search.
      </p>
      <div style={s.list}>
        {SERVICES.map((service) => renderKeyCard(service))}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: {
    margin: "0 0 4px 0",
    fontSize: "var(--font-size-lg)",
    fontWeight: 600,
    color: "var(--text-bright)",
  },
  description: {
    margin: "0 0 16px 0",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-secondary)",
  },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  card: {
    padding: 12,
    background: "var(--bg-tertiary)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border)",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  providerName: {
    fontWeight: 600,
    fontSize: "var(--font-size-sm)",
    color: "var(--text-bright)",
  },
  subDescription: {
    marginLeft: 8,
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
  },
  badge: {
    padding: "2px 8px",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 600,
  },
  editRow: { display: "flex", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    padding: "6px 10px",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    background: "var(--bg-input)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    outline: "none",
  },
  actionRow: { display: "flex", gap: 8 },
  actionBtn: {
    padding: "4px 12px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 500,
    color: "white",
    background: "var(--accent)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  saveBtn: {
    padding: "4px 12px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 500,
    color: "white",
    background: "var(--success)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  cancelBtn: {
    padding: "4px 12px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 500,
    color: "var(--text-primary)",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  restartBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    marginBottom: 12,
    background: "rgba(59, 130, 246, 0.1)",
    border: "1px solid var(--accent)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
  },
  restartBtn: {
    padding: "4px 12px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 500,
    color: "white",
    background: "var(--accent)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  deleteBtn: {
    padding: "4px 12px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 500,
    color: "var(--error)",
    background: "transparent",
    border: "1px solid var(--error)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  refreshBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    flexShrink: 0,
  },
  loginSteps: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  loginStep: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  stepNum: {
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    fontWeight: 600,
    minWidth: 14,
  },
  loginHint: {
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
  },
  commandCode: {
    background: "var(--bg-primary)",
    padding: "2px 8px",
    borderRadius: 4,
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-bright)",
    border: "1px solid var(--border)",
    userSelect: "all" as const,
  },
  copyBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    flexShrink: 0,
  },
  openTermBtn: {
    padding: "4px 10px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 500,
    color: "var(--text-primary)",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  inlineCode: {
    background: "var(--bg-tertiary)",
    padding: "1px 5px",
    borderRadius: 3,
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
  },
};
