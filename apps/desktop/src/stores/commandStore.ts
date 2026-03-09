import { create } from "zustand";
import { fuzzyMatch } from "../lib/fuzzyMatch";

export interface Command {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  keywords?: string[];
  execute: () => void | Promise<void>;
}

interface CommandState {
  commands: Command[];
  isOpen: boolean;
  query: string;
  register: (cmd: Command) => void;
  registerMany: (cmds: Command[]) => void;
  unregister: (id: string) => void;
  open: () => void;
  close: () => void;
  setQuery: (q: string) => void;
  filtered: () => Command[];
}

export const useCommandStore = create<CommandState>((set, get) => ({
  commands: [],
  isOpen: false,
  query: "",

  register: (cmd) =>
    set((state) => {
      if (state.commands.some((c) => c.id === cmd.id)) return state;
      return { commands: [...state.commands, cmd] };
    }),

  registerMany: (cmds) =>
    set((state) => {
      const existing = new Set(state.commands.map((c) => c.id));
      const newCmds = cmds.filter((c) => !existing.has(c.id));
      if (newCmds.length === 0) return state;
      return { commands: [...state.commands, ...newCmds] };
    }),

  unregister: (id) =>
    set((state) => ({
      commands: state.commands.filter((c) => c.id !== id),
    })),

  open: () => set({ isOpen: true, query: "" }),
  close: () => set({ isOpen: false, query: "" }),
  setQuery: (q) => set({ query: q }),

  filtered: () => {
    const { commands, query } = get();
    if (!query) return commands;
    return commands
      .map((cmd) => {
        const labelMatch = fuzzyMatch(query, cmd.label);
        const catMatch = fuzzyMatch(query, cmd.category);
        const kwMatch = (cmd.keywords ?? []).reduce(
          (best, kw) => {
            const m = fuzzyMatch(query, kw);
            return m.score > best.score ? m : best;
          },
          { match: false, score: 0 },
        );
        const bestScore = Math.max(labelMatch.score, catMatch.score, kwMatch.score);
        const matched = labelMatch.match || catMatch.match || kwMatch.match;
        return { cmd, score: bestScore, matched };
      })
      .filter((r) => r.matched)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.cmd);
  },
}));
