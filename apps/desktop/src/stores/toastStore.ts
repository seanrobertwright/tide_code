import { create } from "zustand";

export interface Toast {
  id: string;
  message: string;
  level: "info" | "error" | "success";
  createdAt: number;
}

interface ToastState {
  toasts: Toast[];
  add: (message: string, level?: Toast["level"]) => void;
  dismiss: (id: string) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  add: (message, level = "error") => {
    const id = `toast-${++counter}`;
    const toast: Toast = { id, message, level, createdAt: Date.now() };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    // Auto-dismiss after 5s
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },

  dismiss: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** Shorthand: show an error toast. */
export function showError(message: string) {
  useToastStore.getState().add(message, "error");
}

/** Shorthand: show an info toast. */
export function showInfo(message: string) {
  useToastStore.getState().add(message, "info");
}

/** Shorthand: show a success toast. */
export function showSuccess(message: string) {
  useToastStore.getState().add(message, "success");
}
