import { create } from "zustand";

export interface TerminalTab {
  id: string;
  title: string;
  alive: boolean;
}

interface TerminalState {
  tabs: TerminalTab[];
  activeTabId: string | null;
  visible: boolean;
  counter: number;

  addTab: (ptyId: string) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  toggleVisible: () => void;
  setVisible: (v: boolean) => void;
  markDead: (id: string) => void;
  clearAll: () => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  visible: false,
  counter: 0,

  addTab: (ptyId) => {
    const num = get().counter + 1;
    const tab: TerminalTab = { id: ptyId, title: `Terminal ${num}`, alive: true };
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: ptyId,
      counter: num,
    }));
  },

  removeTab: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id);
      const activeTabId =
        s.activeTabId === id ? (tabs[tabs.length - 1]?.id ?? null) : s.activeTabId;
      return { tabs, activeTabId };
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  toggleVisible: () =>
    set((s) => ({ visible: !s.visible })),

  setVisible: (v) => set({ visible: v }),

  markDead: (id) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, alive: false } : t)),
    })),

  clearAll: () => set({ tabs: [], activeTabId: null, counter: 0 }),
}));
