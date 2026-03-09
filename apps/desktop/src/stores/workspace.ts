import { create } from "zustand";
import { fsListDir, fsWriteFile } from "../lib/ipc";
import { showError, showSuccess } from "./toastStore";

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  children?: FsEntry[];
}

export interface OpenTab {
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
  language: string;
}

interface WorkspaceState {
  rootPath: string | null;
  fileTree: FsEntry[];
  expandedDirs: Set<string>;
  openTabs: OpenTab[];
  activeTabPath: string | null;

  setRootPath: (path: string) => void;
  setFileTree: (entries: FsEntry[]) => void;
  toggleDir: (path: string) => void;
  setDirChildren: (dirPath: string, children: FsEntry[]) => void;
  openFile: (tab: OpenTab) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string | null) => void;
  updateTabContent: (path: string, content: string) => void;
  saveActiveFile: () => Promise<void>;
  refreshFileTree: () => void;
}

function insertChildren(entries: FsEntry[], dirPath: string, children: FsEntry[]): FsEntry[] {
  return entries.map((entry) => {
    if (entry.path === dirPath && entry.isDir) {
      return { ...entry, children };
    }
    if (entry.children) {
      return { ...entry, children: insertChildren(entry.children, dirPath, children) };
    }
    return entry;
  });
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  rootPath: null,
  fileTree: [],
  expandedDirs: new Set(),
  openTabs: [],
  activeTabPath: null,

  setRootPath: (path) => set({ rootPath: path }),

  setFileTree: (entries) => set({ fileTree: entries }),

  toggleDir: (path) =>
    set((state) => {
      const next = new Set(state.expandedDirs);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { expandedDirs: next };
    }),

  setDirChildren: (dirPath, children) =>
    set((state) => ({
      fileTree: insertChildren(state.fileTree, dirPath, children),
    })),

  openFile: (tab) =>
    set((state) => {
      const existing = state.openTabs.find((t) => t.path === tab.path);
      if (existing) {
        return { activeTabPath: tab.path };
      }
      return {
        openTabs: [...state.openTabs, tab],
        activeTabPath: tab.path,
      };
    }),

  closeTab: (path) =>
    set((state) => {
      const tabs = state.openTabs.filter((t) => t.path !== path);
      let activeTabPath = state.activeTabPath;
      if (activeTabPath === path) {
        const idx = state.openTabs.findIndex((t) => t.path === path);
        activeTabPath = tabs[Math.min(idx, tabs.length - 1)]?.path ?? null;
      }
      return { openTabs: tabs, activeTabPath };
    }),

  setActiveTab: (path) => set({ activeTabPath: path }),

  updateTabContent: (path, content) =>
    set((state) => ({
      openTabs: state.openTabs.map((t) =>
        t.path === path ? { ...t, content, isDirty: true } : t,
      ),
    })),

  saveActiveFile: async () => {
    const { activeTabPath, openTabs } = get();
    if (!activeTabPath) return;
    const tab = openTabs.find((t) => t.path === activeTabPath);
    if (!tab || !tab.isDirty) return;
    try {
      await fsWriteFile(tab.path, tab.content);
      set((state) => ({
        openTabs: state.openTabs.map((t) =>
          t.path === tab.path ? { ...t, isDirty: false } : t,
        ),
      }));
      showSuccess(`Saved ${tab.name}`);
    } catch (err) {
      showError(`Save failed: ${err}`);
    }
  },

  refreshFileTree: () => {
    const { rootPath, expandedDirs } = get();
    if (!rootPath) return;

    const mapEntries = (raw: any[]): FsEntry[] =>
      raw.map((e) => ({
        name: e.name,
        path: e.path,
        isDir: e.type === "directory",
        size: e.size,
      }));

    // Refresh root
    fsListDir(rootPath).then(async (entries) => {
      let tree = mapEntries(entries as any[]);

      // Re-fetch children of expanded directories
      const refreshChildren = async (items: FsEntry[]): Promise<FsEntry[]> => {
        return Promise.all(
          items.map(async (item) => {
            if (item.isDir && expandedDirs.has(item.path)) {
              try {
                const childEntries = await fsListDir(item.path);
                let children = mapEntries(childEntries as any[]);
                // Recursively refresh nested expanded dirs
                children = await refreshChildren(children);
                return { ...item, children };
              } catch {
                return item;
              }
            }
            return item;
          }),
        );
      };

      tree = await refreshChildren(tree);
      set({ fileTree: tree });
    }).catch((err) => {
      console.error("[Tide] Failed to refresh file tree:", err);
    });
  },
}));
