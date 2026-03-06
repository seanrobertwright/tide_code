import { create } from "zustand";
import { writeRouterConfig } from "../lib/ipc";

export type SettingsSection = "providers" | "routing" | "safety" | "skills" | "shortcuts";

export interface TierModelConfig {
  provider: string;
  id: string;
}

interface SettingsState {
  isOpen: boolean;
  activeSection: SettingsSection;
  autoMode: boolean;
  tierModels: {
    quick?: TierModelConfig;
    standard?: TierModelConfig;
    complex?: TierModelConfig;
  };

  open: (section?: SettingsSection) => void;
  close: () => void;
  setSection: (section: SettingsSection) => void;
  setAutoMode: (mode: boolean) => void;
  setTierModel: (tier: "quick" | "standard" | "complex", model: TierModelConfig | undefined) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  isOpen: false,
  activeSection: "providers",
  autoMode: true,
  tierModels: {},

  open: (section) =>
    set({ isOpen: true, activeSection: section ?? "providers" }),
  close: () => set({ isOpen: false }),
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
    // TODO: persist tierModels to router-config.json when backend supports it
  },
}));
