import { create } from "zustand";

export interface TerminalTab {
  id: string;
  title: string;
  panes: string[]; // ptyIds
  splitDirection: "horizontal" | "vertical";
}

interface TerminalState {
  tabs: TerminalTab[];
  activeTabId: string | null;
  activePtyId: string | null;
  visible: boolean;
  counter: number;

  addTab: (ptyId: string) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setActivePty: (ptyId: string) => void;
  toggleVisible: () => void;
  setVisible: (v: boolean) => void;
  renameTab: (id: string, title: string) => void;
  markDead: (ptyId: string) => void;
  clearAll: () => void;
  addPane: (tabId: string, newPtyId: string, direction: "horizontal" | "vertical") => void;
  removePane: (tabId: string, ptyId: string) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  activePtyId: null,
  visible: false,
  counter: 0,

  addTab: (ptyId) => {
    const num = get().counter + 1;
    const tab: TerminalTab = {
      id: ptyId,
      title: `Terminal ${num}`,
      panes: [ptyId],
      splitDirection: "vertical",
    };
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: ptyId,
      activePtyId: ptyId,
      counter: num,
    }));
  },

  removeTab: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id);
      const activeTabId =
        s.activeTabId === id ? (tabs[tabs.length - 1]?.id ?? null) : s.activeTabId;
      const activePtyId = s.activeTabId === id
        ? (tabs.length > 0 ? tabs[tabs.length - 1].panes[0] : null)
        : s.activePtyId;
      return { tabs, activeTabId, activePtyId };
    }),

  setActiveTab: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    set({ activeTabId: id, activePtyId: tab ? tab.panes[0] : null });
  },

  setActivePty: (ptyId) => set({ activePtyId: ptyId }),

  toggleVisible: () => set((s) => ({ visible: !s.visible })),

  setVisible: (v) => set({ visible: v }),

  renameTab: (id, title) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    })),

  markDead: (ptyId) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id === ptyId) return { ...t };
        return t;
      }),
    })),

  clearAll: () => set({ tabs: [], activeTabId: null, activePtyId: null, counter: 0 }),

  addPane: (tabId, newPtyId, direction) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t;
        return { ...t, panes: [...t.panes, newPtyId], splitDirection: direction };
      }),
      activePtyId: newPtyId,
    })),

  removePane: (tabId, ptyId) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId);
      if (!tab) return s;
      const remaining = tab.panes.filter((p) => p !== ptyId);
      if (remaining.length === 0) {
        // Last pane — remove the whole tab
        const tabs = s.tabs.filter((t) => t.id !== tabId);
        return {
          tabs,
          activeTabId: tabs.length > 0 ? tabs[tabs.length - 1].id : null,
          activePtyId: tabs.length > 0 ? tabs[tabs.length - 1].panes[0] : null,
        };
      }
      return {
        tabs: s.tabs.map((t) =>
          t.id === tabId ? { ...t, panes: remaining } : t,
        ),
        activePtyId: remaining.includes(s.activePtyId ?? "") ? s.activePtyId : remaining[0],
      };
    }),
}));
