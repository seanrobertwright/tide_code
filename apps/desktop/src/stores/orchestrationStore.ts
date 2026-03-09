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
  lastHeartbeat: number | null;

  handleEvent: (event: OrcEvent) => void;
  setLastHeartbeat: (ts: number) => void;
  reset: () => void;
}

// ── Store ───────────────────────────────────────────────────

export const useOrchestrationStore = create<OrcState>((set) => ({
  phase: "idle",
  planId: null,
  currentStep: 0,
  totalSteps: 0,
  message: "",
  lastHeartbeat: null,

  handleEvent: (event: OrcEvent) => {
    set({
      phase: event.phase,
      planId: event.planId,
      currentStep: event.currentStep,
      totalSteps: event.totalSteps,
      message: event.message,
    });
  },

  setLastHeartbeat: (ts: number) => set({ lastHeartbeat: ts }),

  reset: () =>
    set({
      phase: "idle",
      planId: null,
      currentStep: 0,
      totalSteps: 0,
      message: "",
      lastHeartbeat: null,
    }),
}));

const STALL_THRESHOLD_MS = 30_000;

/** Check if orchestration appears stalled (no heartbeat in 30s while active). */
export function isOrchestrationStalled(): boolean {
  const { phase, lastHeartbeat } = useOrchestrationStore.getState();
  const isActive = phase !== "idle" && phase !== "complete" && phase !== "failed";
  if (!isActive || lastHeartbeat == null) return false;
  return Date.now() - lastHeartbeat > STALL_THRESHOLD_MS;
}

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

  listen<{ timestamp: number }>("orchestration_heartbeat", (event) => {
    const ts = event.payload.timestamp;
    useOrchestrationStore.getState().setLastHeartbeat(
      typeof ts === "number" ? ts * 1000 : Date.now(), // backend sends seconds
    );
  }).catch((err) => {
    console.error("[orchestration] Failed to set up heartbeat listener:", err);
  });
}
