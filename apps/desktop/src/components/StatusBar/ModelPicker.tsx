import { useState, useEffect, useRef } from "react";
import { useStreamStore, type AvailableModel } from "../../stores/stream";
import { useSettingsStore } from "../../stores/settingsStore";
import { setPiModel, getPiState } from "../../lib/ipc";

// ── Component ───────────────────────────────────────────────

export function ModelPicker() {
  const modelName = useStreamStore((s) => s.modelName);
  const availableModels = useStreamStore((s) => s.availableModels);

  const autoMode = useSettingsStore((s) => s.autoMode);
  const setAutoMode = useSettingsStore((s) => s.setAutoMode);

  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelectModel = async (provider: string, modelId: string) => {
    setOpen(false);
    setAutoMode(false);
    console.log(`[ModelPicker] Manual selection: ${provider}/${modelId}`);
    setSwitching(true);
    try {
      await setPiModel(provider, modelId);
      await getPiState();
    } catch (err) {
      console.error("Failed to set model:", err);
    } finally {
      setSwitching(false);
    }
  };

  const handleSelectAuto = () => {
    setOpen(false);
    useSettingsStore.getState().setAutoMode(true);
    console.log("[ModelPicker] Auto mode enabled");
  };

  // Display name logic
  let displayName: string;
  if (switching) {
    displayName = "Switching...";
  } else if (autoMode) {
    // In auto mode, the Pi extension handles model selection.
    // Show current model name with "Auto" prefix.
    const name = (typeof modelName === "string" ? modelName : String(modelName)) || "";
    displayName = name ? `Auto · ${name}` : "Auto";
  } else {
    displayName = (typeof modelName === "string" ? modelName : String(modelName)) || "No model";
  }

  const grouped = groupByProvider(availableModels);

  return (
    <div ref={ref} style={s.container}>
      <button
        style={s.button}
        onClick={() => setOpen(!open)}
        disabled={switching}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.6 }}>
          <path d="M8 1a2 2 0 0 1 2 2v1h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-1v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3V3a2 2 0 0 1 2-2z" />
        </svg>
        <span>{displayName}</span>
      </button>

      {open && (
        <div style={s.dropdown}>
          {/* Auto (Router) option */}
          <div style={s.groupLabel}>Router</div>
          <button
            style={{
              ...s.option,
              ...(autoMode ? s.optionActive : {}),
            }}
            onClick={handleSelectAuto}
          >
            <span style={s.optionContent}>
              <span>Auto</span>
              <span style={s.optionHint}>picks model per prompt</span>
            </span>
          </button>

          {/* Divider */}
          <div style={s.divider} />

          {/* Manual model options */}
          {availableModels.length === 0 ? (
            <div style={s.emptyHint}>No models loaded</div>
          ) : (
            Object.entries(grouped).map(([provider, models]) => (
              <div key={provider}>
                <div style={s.groupLabel}>{provider}</div>
                {models.map((m) => {
                  const isActive = !autoMode && (modelName === m.name || modelName === m.id);
                  return (
                    <button
                      key={m.id}
                      style={{
                        ...s.option,
                        ...(isActive ? s.optionActive : {}),
                      }}
                      onClick={() => handleSelectModel(m.provider, m.id)}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
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

// ── Styles ──────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    position: "relative",
  },
  button: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "0 6px",
    height: 20,
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  dropdown: {
    position: "absolute",
    bottom: 24,
    right: 0,
    minWidth: 240,
    maxHeight: 360,
    overflowY: "auto" as const,
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    padding: 4,
    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
    zIndex: 200,
  },
  groupLabel: {
    padding: "6px 10px 2px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  option: {
    display: "block",
    width: "100%",
    padding: "5px 10px",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    textAlign: "left" as const,
  },
  optionContent: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  optionHint: {
    fontFamily: "var(--font-ui)",
    fontSize: 10,
    color: "var(--text-secondary)",
    fontStyle: "italic",
  },
  optionActive: {
    background: "var(--accent)",
    color: "white",
  },
  divider: {
    height: 1,
    background: "var(--border)",
    margin: "4px 6px",
  },
  emptyHint: {
    padding: "8px 10px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    fontStyle: "italic",
  },
};
