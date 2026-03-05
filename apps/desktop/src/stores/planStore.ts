import { create } from "zustand";
import { useApprovalStore } from "./approvalStore";
import { plansList } from "../lib/ipc";

// ── Types ───────────────────────────────────────────────────

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  files?: string[];
}

export interface Plan {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: "planning" | "in_progress" | "completed" | "failed";
  steps: PlanStep[];
  createdAt: string;
  updatedAt: string;
}

interface PlanState {
  activePlan: Plan | null;
  plans: Plan[];
  loading: boolean;

  updateFromPiStatus: (raw: string) => void;
  loadPlans: () => Promise<void>;
  clearActivePlan: () => void;
}

// ── Store ───────────────────────────────────────────────────

export const usePlanStore = create<PlanState>((set) => ({
  activePlan: null,
  plans: [],
  loading: false,

  updateFromPiStatus: (raw: string) => {
    try {
      const plan = JSON.parse(raw) as Plan;
      set({ activePlan: plan });
    } catch { /* ignore */ }
  },

  loadPlans: async () => {
    set({ loading: true });
    try {
      const raw = await plansList();
      const plans = (raw as Plan[]).sort(
        (a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""),
      );
      set({ plans, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  clearActivePlan: () => set({ activePlan: null }),
}));

// ── Auto-subscribe to piStatus["planner"] ───────────────────

let lastPlannerStatus = "";
useApprovalStore.subscribe((state) => {
  const raw = state.piStatus["planner"];
  if (raw && raw !== lastPlannerStatus) {
    lastPlannerStatus = raw;
    usePlanStore.getState().updateFromPiStatus(raw);
  }
});
