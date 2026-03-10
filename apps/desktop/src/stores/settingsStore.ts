import { create } from "zustand";
import {
  readRouterConfig,
  writeRouterConfig,
  readOrchestratorConfig,
  writeOrchestratorConfig,
  type OrchestratorConfig,
} from "../lib/ipc";
import { useWorkspaceStore } from "./workspace";
import { applyAppTheme, saveAppTheme, loadAppTheme, defaultAppTheme } from "../lib/appThemes";

export const SETTINGS_TAB_PATH = "__settings__";

export type SettingsSection = "general" | "providers" | "routing" | "orchestration" | "safety" | "skills" | "shortcuts";

export interface TierModelConfig {
  provider: string;
  id: string;
}

const DEFAULT_ORC_CONFIG: OrchestratorConfig = {
  reviewMode: "fresh_session",
  maxReviewIterations: 2,
  qaCommands: [],
  clarifyTimeoutSecs: 120,
  lockModelDuringOrchestration: true,
};

interface SettingsState {
  activeSection: SettingsSection;
  autoMode: boolean;
  tierModels: {
    quick?: TierModelConfig;
    standard?: TierModelConfig;
    complex?: TierModelConfig;
  };
  orchestratorConfig: OrchestratorConfig;
  appTheme: string;
  terminalTheme: string;
  terminalScrollback: number;

  load: () => Promise<void>;
  open: (section?: SettingsSection) => void;
  close: () => void;
  setSection: (section: SettingsSection) => void;
  setAutoMode: (mode: boolean) => void;
  setTierModel: (tier: "quick" | "standard" | "complex", model: TierModelConfig | undefined) => void;
  updateOrchestratorConfig: (partial: Partial<OrchestratorConfig>) => void;
  setAppTheme: (theme: string) => void;
  setTerminalTheme: (theme: string) => void;
  setTerminalScrollback: (size: number) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  activeSection: "general",
  autoMode: true,
  tierModels: {},
  orchestratorConfig: { ...DEFAULT_ORC_CONFIG },
  appTheme: loadAppTheme(),
  terminalTheme: (() => {
    try { return localStorage.getItem("tide-terminal-theme") || "Tokyo Night"; } catch { return "Tokyo Night"; }
  })(),
  terminalScrollback: (() => {
    try { return parseInt(localStorage.getItem("tide-terminal-scrollback") || "5000") || 5000; } catch { return 5000; }
  })(),

  load: async () => {
    try {
      const config = await readRouterConfig() as any;
      set({ autoMode: config.autoSwitch });
      if (config.tierModels) {
        set({ tierModels: config.tierModels });
      }
    } catch {
      // keep defaults
    }
    try {
      const orcConfig = await readOrchestratorConfig();
      set({ orchestratorConfig: { ...DEFAULT_ORC_CONFIG, ...orcConfig } });
    } catch {
      // keep defaults
    }
  },

  open: (section) => {
    if (section) set({ activeSection: section });
    const ws = useWorkspaceStore.getState();
    ws.openFile({
      path: SETTINGS_TAB_PATH,
      name: "Settings",
      content: "",
      isDirty: false,
      language: "",
    });
  },
  close: () => {
    useWorkspaceStore.getState().closeTab(SETTINGS_TAB_PATH);
  },
  setSection: (section) => set({ activeSection: section }),
  setAutoMode: (mode) => {
    set({ autoMode: mode });
    writeRouterConfig(mode).catch((e) => console.error("Failed to write router config:", e));
  },
  setTierModel: (tier, model) => {
    const tierModels = { ...get().tierModels };
    if (model) {
      tierModels[tier] = model;
    } else {
      delete tierModels[tier];
    }
    set({ tierModels });
    writeRouterConfig(get().autoMode, tierModels).catch((e) =>
      console.error("Failed to persist tier models:", e),
    );
  },
  updateOrchestratorConfig: (partial) => {
    const merged = { ...get().orchestratorConfig, ...partial };
    set({ orchestratorConfig: merged });
    writeOrchestratorConfig(merged).catch((e) =>
      console.error("Failed to write orchestrator config:", e),
    );
  },
  setAppTheme: (theme) => {
    set({ appTheme: theme });
    applyAppTheme(theme);
    saveAppTheme(theme);
  },
  setTerminalTheme: (theme) => {
    set({ terminalTheme: theme });
    try { localStorage.setItem("tide-terminal-theme", theme); } catch {}
  },
  setTerminalScrollback: (size) => {
    const clamped = Math.max(500, Math.min(50000, size));
    set({ terminalScrollback: clamped });
    try { localStorage.setItem("tide-terminal-scrollback", String(clamped)); } catch {}
  },
}));
