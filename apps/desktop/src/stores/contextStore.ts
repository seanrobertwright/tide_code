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
    // Refresh context breakdown from Pi state
    try {
      await getPiState();
    } catch {
      // Pi not connected yet
    }
  },

  togglePin: async (id: string) => {
    // Delegate to region tag store — pinning is managed through tags
    const { useRegionTagStore } = await import("./regionTagStore");
    const tagStore = useRegionTagStore.getState();
    const tag = tagStore.tags.get(id);
    if (tag) {
      tagStore.togglePin(id);
    }
  },

  openInspector: () => set({ inspectorOpen: true }),
  closeInspector: () => set({ inspectorOpen: false }),
}));
