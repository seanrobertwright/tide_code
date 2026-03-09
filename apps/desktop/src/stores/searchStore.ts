import { create } from "zustand";
import { fsSearch, fsReplaceInFile, fsReplaceAll, type SearchFileResult } from "../lib/ipc";
import { useWorkspaceStore } from "./workspace";

interface SearchState {
  query: string;
  replaceText: string;
  isRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  includeGlob: string;
  excludeGlob: string;
  results: SearchFileResult[];
  isSearching: boolean;
  totalMatches: number;
  expanded: Set<string>;

  setQuery: (q: string) => void;
  setReplaceText: (r: string) => void;
  toggleRegex: () => void;
  toggleCase: () => void;
  toggleWholeWord: () => void;
  setIncludeGlob: (g: string) => void;
  setExcludeGlob: (g: string) => void;
  toggleExpanded: (file: string) => void;
  search: () => Promise<void>;
  replaceInFile: (path: string) => Promise<void>;
  replaceAll: () => Promise<void>;
  clear: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: "",
  replaceText: "",
  isRegex: false,
  caseSensitive: false,
  wholeWord: false,
  includeGlob: "",
  excludeGlob: "",
  results: [],
  isSearching: false,
  totalMatches: 0,
  expanded: new Set<string>(),

  setQuery: (q) => set({ query: q }),
  setReplaceText: (r) => set({ replaceText: r }),
  toggleRegex: () => set((s) => ({ isRegex: !s.isRegex })),
  toggleCase: () => set((s) => ({ caseSensitive: !s.caseSensitive })),
  toggleWholeWord: () => set((s) => ({ wholeWord: !s.wholeWord })),
  setIncludeGlob: (g) => set({ includeGlob: g }),
  setExcludeGlob: (g) => set({ excludeGlob: g }),
  toggleExpanded: (file) =>
    set((s) => {
      const next = new Set(s.expanded);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return { expanded: next };
    }),

  search: async () => {
    const { query, isRegex, caseSensitive, wholeWord, includeGlob, excludeGlob } = get();
    if (!query.trim()) {
      set({ results: [], totalMatches: 0 });
      return;
    }
    set({ isSearching: true });
    try {
      const results = await fsSearch({
        query,
        isRegex,
        caseSensitive,
        wholeWord,
        includeGlob: includeGlob || undefined,
        excludeGlob: excludeGlob || undefined,
      });
      const total = results.reduce((sum, r) => sum + r.matches.length, 0);
      // Auto-expand all result files
      const expanded = new Set(results.map((r) => r.file));
      set({ results, totalMatches: total, expanded });
    } catch (err) {
      console.error("search error:", err);
      set({ results: [], totalMatches: 0 });
    } finally {
      set({ isSearching: false });
    }
  },

  replaceInFile: async (path) => {
    const { query, replaceText, isRegex, caseSensitive, wholeWord } = get();
    try {
      await fsReplaceInFile({ path, search: query, replace: replaceText, isRegex, caseSensitive, wholeWord });
      // Re-search to update results
      await get().search();
      useWorkspaceStore.getState().refreshFileTree();
    } catch (err) {
      console.error("replace error:", err);
    }
  },

  replaceAll: async () => {
    const { query, replaceText, isRegex, caseSensitive, wholeWord, includeGlob, excludeGlob } = get();
    try {
      await fsReplaceAll({
        search: query,
        replace: replaceText,
        isRegex,
        caseSensitive,
        wholeWord,
        includeGlob: includeGlob || undefined,
        excludeGlob: excludeGlob || undefined,
      });
      await get().search();
      useWorkspaceStore.getState().refreshFileTree();
    } catch (err) {
      console.error("replaceAll error:", err);
    }
  },

  clear: () => set({ query: "", replaceText: "", results: [], totalMatches: 0, expanded: new Set() }),
}));
