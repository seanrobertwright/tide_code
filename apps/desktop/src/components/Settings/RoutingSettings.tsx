import { useSettingsStore, type TierModelConfig } from "../../stores/settingsStore";
import { useStreamStore, type AvailableModel } from "../../stores/stream";

const TIERS = [
  { id: "quick" as const, label: "Quick", desc: "Short questions, typos, renames" },
  { id: "standard" as const, label: "Standard", desc: "General coding tasks" },
  { id: "complex" as const, label: "Complex", desc: "Refactors, multi-file features" },
];

export function RoutingSettings() {
  const autoMode = useSettingsStore((s) => s.autoMode);
  const setAutoMode = useSettingsStore((s) => s.setAutoMode);
  const tierModels = useSettingsStore((s) => s.tierModels);
  const setTierModel = useSettingsStore((s) => s.setTierModel);
  const availableModels = useStreamStore((s) => s.availableModels);

  const grouped = groupByProvider(availableModels);

  const handleTierChange = (tier: "quick" | "standard" | "complex", value: string) => {
    if (value === "auto") {
      setTierModel(tier, undefined);
    } else {
      const [provider, ...rest] = value.split("/");
      const id = rest.join("/");
      setTierModel(tier, { provider, id });
    }
  };

  const tierValue = (tier: "quick" | "standard" | "complex"): string => {
    const m = tierModels[tier];
    return m ? `${m.provider}/${m.id}` : "auto";
  };

  return (
    <div>
      <h3 style={s.heading}>Model Routing</h3>
      <p style={s.desc}>
        When auto-routing is enabled, Tide classifies each prompt and picks a model tier.
        You can override which model is used for each tier.
      </p>

      {/* Auto-switch toggle */}
      <label style={s.toggleRow}>
        <input
          type="checkbox"
          checked={autoMode}
          onChange={(e) => setAutoMode(e.target.checked)}
          style={s.checkbox}
        />
        <span>Enable auto-routing</span>
      </label>

      {/* Tier → Model mapping */}
      <div style={{ opacity: autoMode ? 1 : 0.5, pointerEvents: autoMode ? "auto" : "none" }}>
        <div style={s.tierGrid}>
          {TIERS.map((tier) => (
            <div key={tier.id} style={s.tierRow}>
              <div>
                <div style={s.tierLabel}>{tier.label}</div>
                <div style={s.tierDesc}>{tier.desc}</div>
              </div>
              <select
                style={s.select}
                value={tierValue(tier.id)}
                onChange={(e) => handleTierChange(tier.id, e.target.value)}
              >
                <option value="auto">Auto-detect</option>
                {Object.entries(grouped).map(([provider, models]) => (
                  <optgroup key={provider} label={provider}>
                    {models.map((m) => (
                      <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                        {m.name || m.id}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div style={s.note}>
        Tip: The router only switches models on the first message of a new chat.
        Use the model picker in the status bar for manual overrides.
      </div>
    </div>
  );
}

function groupByProvider(models: AvailableModel[]): Record<string, AvailableModel[]> {
  const groups: Record<string, AvailableModel[]> = {};
  for (const m of models) {
    const p = m.provider || "other";
    if (!groups[p]) groups[p] = [];
    groups[p].push(m);
  }
  return groups;
}

const s: Record<string, React.CSSProperties> = {
  heading: {
    margin: "0 0 8px",
    fontSize: "var(--font-size-md)",
    fontWeight: 600,
    color: "var(--text-bright)",
  },
  desc: {
    margin: "0 0 16px",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    cursor: "pointer",
  },
  checkbox: {
    accentColor: "var(--accent)",
  },
  tierGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  tierRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 12px",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
  },
  tierLabel: {
    fontSize: "var(--font-size-sm)",
    fontWeight: 600,
    color: "var(--text-bright)",
  },
  tierDesc: {
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    marginTop: 2,
  },
  select: {
    flexShrink: 0,
    minWidth: 180,
    padding: "5px 8px",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  note: {
    marginTop: 20,
    padding: "10px 12px",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    lineHeight: 1.5,
  },
};
