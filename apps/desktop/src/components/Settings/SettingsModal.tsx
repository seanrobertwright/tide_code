import { useSettingsStore, type SettingsSection } from "../../stores/settingsStore";
import { GeneralSettings } from "./GeneralSettings";
import { ProviderSettings } from "./ProviderSettings";
import { SafetyPlaceholder } from "./SafetyPlaceholder";
import { SkillsPlaceholder } from "./SkillsPlaceholder";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { RoutingSettings } from "./RoutingSettings";
import { OrchestratorSettings } from "./OrchestratorSettings";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "general", label: "General" },
  { id: "providers", label: "Provider Keys" },
  { id: "routing", label: "Routing" },
  { id: "orchestration", label: "Orchestration" },
  { id: "safety", label: "Safety" },
  { id: "skills", label: "Skills" },
  { id: "shortcuts", label: "Shortcuts" },
];

export function SettingsPanel() {
  const { activeSection, setSection } = useSettingsStore();

  return (
    <div style={s.panel}>
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
        {activeSection === "general" && <GeneralSettings />}
        {activeSection === "providers" && <ProviderSettings />}
        {activeSection === "routing" && <RoutingSettings />}
        {activeSection === "orchestration" && <OrchestratorSettings />}
        {activeSection === "safety" && <SafetyPlaceholder />}
        {activeSection === "skills" && <SkillsPlaceholder />}
        {activeSection === "shortcuts" && <KeyboardShortcuts />}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  panel: {
    display: "flex",
    height: "100%",
    background: "var(--bg-secondary)",
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
};
