import { create } from "zustand";

type PiStatus = "disconnected" | "connecting" | "connected" | "error";

interface EngineState {
  status: PiStatus;
  errorMessage: string | null;

  setStatus: (status: PiStatus, error?: string) => void;
}

export const useEngineStore = create<EngineState>((set) => ({
  status: "disconnected",
  errorMessage: null,

  setStatus: (status, error) =>
    set({
      status,
      errorMessage: error ?? null,
    }),
}));
