import { create } from "zustand";

interface UiState {
  isLoading: boolean;
  loadingMessage: string;
  fileTreeVisible: boolean;
  startLoading: (message?: string) => void;
  stopLoading: () => void;
  toggleFileTree: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  isLoading: false,
  loadingMessage: "",
  fileTreeVisible: true,
  startLoading: (message = "Loading...") => set({ isLoading: true, loadingMessage: message }),
  stopLoading: () => set({ isLoading: false, loadingMessage: "" }),
  toggleFileTree: () => set((state) => ({ fileTreeVisible: !state.fileTreeVisible })),
}));
