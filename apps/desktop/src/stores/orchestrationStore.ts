import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";

// ── Types ───────────────────────────────────────────────────

export type OrcPhase =
  | "idle"
  | "routing"
  | "planning"
  | "building"
  | "reviewing"
  | "complete"
  | "failed";

interface OrcEvent {
  phase: OrcPhase;
  planId: string | null;
  currentStep: number;
  totalSteps: number;
  message: string;
}

interface OrcState {
  phase: OrcPhase;
  planId: string | null;
  currentStep: number;
  totalSteps: number;
  message: string;

  handleEvent: (event: OrcEvent) => void;
  reset: () => void;
}

// ── Store ───────────────────────────────────────────────────

export const useOrchestrationStore = create<OrcState>((set) => ({
  phase: "idle",
  planId: null,
  currentStep: 0,
  totalSteps: 0,
  message: "",

  handleEvent: (event: OrcEvent) => {
    set({
      phase: event.phase,
      planId: event.planId,
      currentStep: event.currentStep,
      totalSteps: event.totalSteps,
      message: event.message,
    });
  },

  reset: () =>
    set({
      phase: "idle",
      planId: null,
      currentStep: 0,
      totalSteps: 0,
      message: "",
    }),
}));

// ── Listener ────────────────────────────────────────────────

let listenerInitialized = false;

export function initOrchestrationListener(): void {
  if (listenerInitialized) return;
  listenerInitialized = true;

  listen<OrcEvent>("orchestration_event", (event) => {
    useOrchestrationStore.getState().handleEvent(event.payload);
  }).catch((err) => {
    console.error("[orchestration] Failed to set up listener:", err);
  });
}
