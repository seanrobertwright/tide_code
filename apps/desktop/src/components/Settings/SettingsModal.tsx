import { useEffect } from "react";
import { useSettingsStore, type SettingsSection } from "../../stores/settingsStore";
import { ProviderSettings } from "./ProviderSettings";
import { SafetyPlaceholder } from "./SafetyPlaceholder";
import { SkillsPlaceholder } from "./SkillsPlaceholder";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "providers", label: "Provider Keys" },
  { id: "safety", label: "Safety" },
  { id: "skills", label: "Skills" },
];

export function SettingsModal() {
  const { isOpen, activeSection, close, setSection } = useSettingsStore();

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    <div style={s.overlay} onClick={close}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Sidebar */}
        <div style={s.sidebar}>
          <div style={s.sidebarTitle}>Settings</div>
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              style={{
                ...s.sidebarItem,
                ...(activeSection === section.id ? s.sidebarItemActive : {}),
              }}
              onClick={() => setSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={s.content}>
          {activeSection === "providers" && <ProviderSettings />}
          {activeSection === "safety" && <SafetyPlaceholder />}
          {activeSection === "skills" && <SkillsPlaceholder />}
        </div>

        {/* Close button */}
        <button style={s.closeBtn} onClick={close} title="Close">
          &times;
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.6)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modal: {
    position: "relative",
    display: "flex",
    width: 640,
    maxHeight: "80vh",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
    overflow: "hidden",
  },
  sidebar: {
    width: 160,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-primary)",
    borderRight: "1px solid var(--border)",
    padding: "8px 0",
  },
  sidebarTitle: {
    padding: "8px 16px 12px",
    fontSize: "var(--font-size-sm)",
    fontWeight: 700,
    color: "var(--text-bright)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  sidebarItem: {
    display: "block",
    width: "100%",
    padding: "8px 16px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    background: "transparent",
    border: "none",
    borderLeft: "2px solid transparent",
    textAlign: "left" as const,
    cursor: "pointer",
  },
  sidebarItemActive: {
    background: "var(--bg-tertiary)",
    borderLeftColor: "var(--accent)",
    color: "var(--text-bright)",
  },
  content: {
    flex: 1,
    padding: 20,
    overflowY: "auto" as const,
  },
  closeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-ui)",
    fontSize: 18,
    color: "var(--text-secondary)",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
};
