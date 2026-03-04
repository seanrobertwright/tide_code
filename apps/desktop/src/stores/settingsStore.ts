import { create } from "zustand";

export type SettingsSection = "providers" | "safety" | "skills";

interface SettingsState {
  isOpen: boolean;
  activeSection: SettingsSection;
  open: (section?: SettingsSection) => void;
  close: () => void;
  setSection: (section: SettingsSection) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  isOpen: false,
  activeSection: "providers",
  open: (section) =>
    set({ isOpen: true, activeSection: section ?? "providers" }),
  close: () => set({ isOpen: false }),
  setSection: (section) => set({ activeSection: section }),
}));
