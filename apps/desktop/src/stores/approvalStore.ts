import { create } from "zustand";
import { respondUiRequest } from "../lib/ipc";
import { onPiUiRequest, type PiUiRequest } from "../lib/pi-events";

export interface ApprovalRequest {
  requestId: string;
  title: string;
  message: string;
  toolName?: string;
  safetyLevel?: string;
  /** Diff preview data (populated by tide-safety.ts for write/edit tools) */
  filePath?: string;
  originalContent?: string;
  newContent?: string;
}

interface ApprovalState {
  pendingApprovals: ApprovalRequest[];
  currentApproval: ApprovalRequest | null;
  addApproval: (req: ApprovalRequest) => void;
  respondToApproval: (requestId: string, approved: boolean) => Promise<void>;
}

export const useApprovalStore = create<ApprovalState>((set) => ({
  pendingApprovals: [],
  currentApproval: null,

  addApproval: (req: ApprovalRequest) => {
    set((state) => {
      const updated = [...state.pendingApprovals, req];
      return {
        pendingApprovals: updated,
        currentApproval: state.currentApproval ?? req,
      };
    });
  },

  respondToApproval: async (requestId: string, approved: boolean) => {
    try {
      await respondUiRequest(requestId, approved);
    } catch (err) {
      console.error("[approval] Failed to send response:", err);
    }

    set((state) => {
      const remaining = state.pendingApprovals.filter(
        (a) => a.requestId !== requestId,
      );
      return {
        pendingApprovals: remaining,
        currentApproval: remaining[0] ?? null,
      };
    });
  },
}));

// Initialize listener for Pi extension UI requests
let listenerInitialized = false;
export function initApprovalListener(): void {
  if (listenerInitialized) return;
  listenerInitialized = true;

  onPiUiRequest((event: PiUiRequest) => {
    // Map Pi's extension_ui_request to our ApprovalRequest format
    if (event.method === "confirm") {
      const payload = event as any;
      useApprovalStore.getState().addApproval({
        requestId: event.id,
        title: event.title || "Approval Required",
        message: event.message || "",
        toolName: payload.toolName,
        safetyLevel: payload.safetyLevel,
        filePath: payload.filePath,
        originalContent: payload.originalContent,
        newContent: payload.newContent,
      });
    }
  }).catch((err) => {
    console.error("[approval] Failed to set up Pi UI listener:", err);
  });
}
