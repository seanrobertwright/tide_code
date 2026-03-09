import { useState, useEffect, useRef } from "react";
import { useStreamStore, type ThinkingLevel } from "../../stores/stream";
import { setThinkingLevel as setThinkingLevelIpc } from "../../lib/ipc";

const LEVELS: { value: ThinkingLevel; label: string; icon: string }[] = [
  { value: "off", label: "Off", icon: "\u25CB" },
  { value: "minimal", label: "Minimal", icon: "\u25D4" },
  { value: "low", label: "Low", icon: "\u25D1" },
  { value: "medium", label: "Medium", icon: "\u25D5" },
  { value: "high", label: "High", icon: "\u25CF" },
  { value: "xhigh", label: "Max", icon: "\u2B24" },
];

export function ThinkingLevelPicker() {
  const thinkingLevel = useStreamStore((s) => s.thinkingLevel);
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

  const handleSelect = async (level: ThinkingLevel) => {
    setOpen(false);
    setSwitching(true);
    useStreamStore.setState({ thinkingLevel: level }); // optimistic update
    try {
      await setThinkingLevelIpc(level);
    } catch (err) {
      console.error("Failed to set thinking level:", err);
    } finally {
      setSwitching(false);
    }
  };

  const current = LEVELS.find((l) => l.value === thinkingLevel) || LEVELS[3];

  return (
    <div ref={ref} style={s.container}>
      <button
        style={s.button}
        onClick={() => setOpen(!open)}
        disabled={switching}
        title="Thinking Level"
      >
        <span style={{ fontSize: 10 }}>{current.icon}</span>
        <span>{switching ? "..." : current.label}</span>
      </button>

      {open && (
        <div style={s.dropdown}>
          {LEVELS.map((l) => (
            <button
              key={l.value}
              style={{
                ...s.option,
                ...(thinkingLevel === l.value ? s.optionActive : {}),
              }}
              onClick={() => handleSelect(l.value)}
            >
              <span style={{ fontSize: 10, width: 14, textAlign: "center" as const }}>{l.icon}</span>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
    minWidth: 140,
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    padding: 4,
    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
    zIndex: 200,
  },
  option: {
    display: "flex",
    alignItems: "center",
    gap: 8,
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
  optionActive: {
    background: "var(--accent)",
    color: "white",
  },
};
