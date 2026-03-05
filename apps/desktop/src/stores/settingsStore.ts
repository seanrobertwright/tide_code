import { create } from "zustand";
import { writeRouterConfig } from "../lib/ipc";

export type SettingsSection = "providers" | "safety" | "skills" | "shortcuts";

interface SettingsState {
  isOpen: boolean;
  activeSection: SettingsSection;
  autoMode: boolean;

  open: (section?: SettingsSection) => void;
  close: () => void;
  setSection: (section: SettingsSection) => void;
  setAutoMode: (mode: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  isOpen: false,
  activeSection: "providers",
  autoMode: true,

  open: (section) =>
    set({ isOpen: true, activeSection: section ?? "providers" }),
  close: () => set({ isOpen: false }),
  setSection: (section) => set({ activeSection: section }),
  setAutoMode: (mode) => {
    set({ autoMode: mode });
    // Persist to .tide/router-config.json so the Pi extension reads it
    writeRouterConfig(mode).catch((e) => console.error("Failed to write router config:", e));
  },
}));
