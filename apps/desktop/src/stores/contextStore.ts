import { create } from "zustand";
import { getPiState } from "../lib/ipc";

export type ThresholdColor = "green" | "yellow" | "red";

export interface CategoryBreakdown {
  category: string;
  tokens: number;
  percentage: number;
}

export interface BudgetBreakdown {
  totalTokens: number;
  budgetTokens: number;
  usagePercent: number;
  thresholdColor: ThresholdColor;
  categories: CategoryBreakdown[];
}

export interface ContextItem {
  id: string;
  type: string;
  source: string;
  content: string;
  tokenEstimate: number;
  pinned: boolean;
  priority: number;
  trimmable: boolean;
}

export interface ContextPack {
  items: ContextItem[];
  totalTokens: number;
  budgetTokens: number;
  usagePercent: number;
  trimmedItems: ContextItem[];
}

function computeThreshold(percent: number): ThresholdColor {
  if (percent >= 0.85) return "red";
  if (percent >= 0.6) return "yellow";
  return "green";
}

interface ContextState {
  breakdown: BudgetBreakdown | null;
  contextPack: ContextPack | null;
  inspectorOpen: boolean;

  refreshBreakdown: () => Promise<void>;
  updateFromPiState: (totalTokens: number, budgetTokens: number) => void;
  refreshItems: () => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  openInspector: () => void;
  closeInspector: () => void;
}

export const useContextStore = create<ContextState>((set) => ({
  breakdown: null,
  contextPack: null,
  inspectorOpen: false,

  refreshBreakdown: async () => {
    // Ask Pi for current state — response arrives as a "response" event
    // handled by stream.ts, which calls updateFromPiState
    try {
      await getPiState();
    } catch {
      // Pi not connected yet — ignore
    }
  },

  updateFromPiState: (totalTokens: number, budgetTokens: number) => {
    const usagePercent = budgetTokens > 0 ? totalTokens / budgetTokens : 0;
    set({
      breakdown: {
        totalTokens,
        budgetTokens,
        usagePercent,
        thresholdColor: computeThreshold(usagePercent),
        categories: [],
      },
    });
  },

  refreshItems: async () => {
    // Context items not yet exposed by Pi
  },

  togglePin: async (_id: string) => {
    // Region-based pinning handled via tide_tags tool (TIDE-062)
  },

  openInspector: () => set({ inspectorOpen: true }),
  closeInspector: () => set({ inspectorOpen: false }),
}));
