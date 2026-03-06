import { create } from "zustand";

interface UiState {
  isLoading: boolean;
  loadingMessage: string;
  fileTreeVisible: boolean;
  sidebarPanel: "explorer" | "search";
  startLoading: (message?: string) => void;
  stopLoading: () => void;
  toggleFileTree: () => void;
  showFileTree: () => void;
  setSidebarPanel: (panel: "explorer" | "search") => void;
}

export const useUiStore = create<UiState>((set) => ({
  isLoading: false,
  loadingMessage: "",
  fileTreeVisible: true,
  sidebarPanel: "explorer",
  startLoading: (message = "Loading...") => set({ isLoading: true, loadingMessage: message }),
  stopLoading: () => set({ isLoading: false, loadingMessage: "" }),
  toggleFileTree: () => set((state) => ({ fileTreeVisible: !state.fileTreeVisible })),
  showFileTree: () => set({ fileTreeVisible: true, sidebarPanel: "explorer" }),
  setSidebarPanel: (panel) => set({ sidebarPanel: panel, fileTreeVisible: true }),
}));
