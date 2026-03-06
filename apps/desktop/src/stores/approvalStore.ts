import { create } from "zustand";
import { respondUiRequest } from "../lib/ipc";
import { onPiUiRequest, type PiUiRequest } from "../lib/pi-events";
import { usePermissionStore } from "./permissionStore";

// ── UI Request Types ───────────────────────────────────────

export interface UiRequestBase {
  requestId: string;
  title: string;
  message: string;
}

export interface ConfirmRequest extends UiRequestBase {
  method: "confirm";
  toolName?: string;
  safetyLevel?: string;
  filePath?: string;
  originalContent?: string;
  newContent?: string;
}

export interface SelectRequest extends UiRequestBase {
  method: "select";
  options: Array<{ value: string; label: string; description?: string }>;
}

export interface InputRequest extends UiRequestBase {
  method: "input";
  inputType: "text" | "number";
  placeholder?: string;
}

export interface EditorRequest extends UiRequestBase {
  method: "editor";
  initialValue: string;
  language?: string;
}

export interface NotifyRequest {
  id: string;
  method: "notify";
  message: string;
  level: "info" | "warning" | "error" | "success";
  timestamp: number;
}

export interface ClarifyQuestion {
  id: string;
  question: string;
  options: Array<{ value: string; label: string; description?: string }>;
  allowFreeText?: boolean;
}

export type UiRequest = ConfirmRequest | SelectRequest | InputRequest | EditorRequest;

// ── Store ──────────────────────────────────────────────────

interface ApprovalState {
  pendingRequests: UiRequest[];
  currentRequest: UiRequest | null;
  notifications: NotifyRequest[];
  piStatus: Record<string, string>;

  // Clarify Q&A state
  clarifyQuestions: ClarifyQuestion[] | null;
  clarifyInputRequestId: string | null;

  addRequest: (req: UiRequest) => void;
  respond: (requestId: string, response: Record<string, unknown>) => Promise<void>;
  dismissNotification: (id: string) => void;
  setPiStatus: (id: string, text: string) => void;
  respondClarify: (answers: Record<string, string>) => Promise<void>;

  // Legacy compat
  currentApproval: UiRequest | null;
  pendingApprovals: UiRequest[];
  addApproval: (req: UiRequest) => void;
  respondToApproval: (requestId: string, approved: boolean) => Promise<void>;
}

export const useApprovalStore = create<ApprovalState>((set, get) => ({
  pendingRequests: [],
  currentRequest: null,
  notifications: [],
  piStatus: {},
  clarifyQuestions: null,
  clarifyInputRequestId: null,

  addRequest: (req: UiRequest) => {
    set((state) => {
      const updated = [...state.pendingRequests, req];
      return {
        pendingRequests: updated,
        currentRequest: state.currentRequest ?? req,
        // Legacy compat
        pendingApprovals: updated,
        currentApproval: state.currentRequest ?? req,
      };
    });
  },

  respond: async (requestId: string, response: Record<string, unknown>) => {
    try {
      await respondUiRequest(requestId, response);
    } catch (err) {
      console.error("[piui] Failed to send response:", err);
    }

    set((state) => {
      const remaining = state.pendingRequests.filter((r) => r.requestId !== requestId);
      return {
        pendingRequests: remaining,
        currentRequest: remaining[0] ?? null,
        pendingApprovals: remaining,
        currentApproval: remaining[0] ?? null,
      };
    });
  },

  dismissNotification: (id: string) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  setPiStatus: (id: string, text: string) => {
    set((state) => ({
      piStatus: { ...state.piStatus, [id]: text },
    }));
  },

  respondClarify: async (answers: Record<string, string>) => {
    const requestId = get().clarifyInputRequestId;
    if (!requestId) return;
    try {
      await respondUiRequest(requestId, { value: JSON.stringify(answers) });
    } catch (err) {
      console.error("[piui] Failed to respond to clarify:", err);
    }
    set({ clarifyQuestions: null, clarifyInputRequestId: null });
  },

  // Legacy compat
  get currentApproval() { return get().currentRequest; },
  get pendingApprovals() { return get().pendingRequests; },
  addApproval: (req: UiRequest) => get().addRequest(req),
  respondToApproval: async (requestId: string, approved: boolean) => {
    await get().respond(requestId, { confirmed: approved });
  },
}));

// ── Listener ───────────────────────────────────────────────

let listenerInitialized = false;
export function initApprovalListener(): void {
  if (listenerInitialized) return;
  listenerInitialized = true;

  onPiUiRequest((event: PiUiRequest) => {
    const store = useApprovalStore.getState();
    const payload = event as any;

    switch (event.method) {
      case "confirm": {
        let message = event.message || "";
        let filePath = payload.filePath;
        let originalContent = payload.originalContent;
        let newContent = payload.newContent;
        const toolName = payload.toolName || "";

        // Parse diff data encoded by tide-safety.ts
        const diffMatch = message.match(/<!--TIDE_DIFF:(.*?)-->/s);
        if (diffMatch) {
          try {
            const diffData = JSON.parse(diffMatch[1]);
            filePath = diffData.filePath;
            originalContent = diffData.originalContent;
            newContent = diffData.newContent;
            message = message.replace(/\n<!--TIDE_DIFF:.*?-->/s, "");
          } catch { /* ignore */ }
        }

        // Check permission cache — auto-respond if matched
        const decision = usePermissionStore.getState().checkPermission(toolName, filePath);
        if (decision === "allow") {
          console.log(`[Tide] Auto-approved ${toolName} (cached permission)`);
          respondUiRequest(event.id, { confirmed: true }).catch(() => {});
          break;
        }
        if (decision === "deny") {
          console.log(`[Tide] Auto-denied ${toolName} (cached permission)`);
          respondUiRequest(event.id, { confirmed: false }).catch(() => {});
          break;
        }

        store.addRequest({
          method: "confirm",
          requestId: event.id,
          title: event.title || "Approval Required",
          message,
          toolName,
          safetyLevel: payload.safetyLevel,
          filePath,
          originalContent,
          newContent,
        });
        break;
      }

      case "select": {
        const options = (payload.options || []).map((o: any) =>
          typeof o === "string"
            ? { value: o, label: o }
            : { value: o.value || o.label, label: o.label || o.value, description: o.description }
        );
        store.addRequest({
          method: "select",
          requestId: event.id,
          title: event.title || "Select an option",
          message: event.message || "",
          options,
        });
        break;
      }

      case "input": {
        // If we're in clarify mode, capture the input request ID instead of showing a modal
        const currentClarify = useApprovalStore.getState().clarifyQuestions;
        if (currentClarify && (event.title === "Plan Clarification" || payload.title === "Plan Clarification")) {
          useApprovalStore.setState({ clarifyInputRequestId: event.id });
          break;
        }

        store.addRequest({
          method: "input",
          requestId: event.id,
          title: event.title || "Input required",
          message: event.message || payload.prompt || "",
          inputType: payload.inputType || payload.type || "text",
          placeholder: payload.placeholder,
        });
        break;
      }

      case "editor": {
        store.addRequest({
          method: "editor",
          requestId: event.id,
          title: event.title || "Edit content",
          message: event.message || "",
          initialValue: payload.initialValue || "",
          language: payload.language,
        });
        break;
      }

      case "notify": {
        const id = `notify-${Date.now()}`;
        useApprovalStore.setState((state) => ({
          notifications: [
            ...state.notifications,
            {
              id,
              method: "notify",
              message: event.message || payload.message || "",
              level: payload.level || "info",
              timestamp: Date.now(),
            },
          ],
        }));
        // Auto-dismiss after 5s
        setTimeout(() => {
          useApprovalStore.getState().dismissNotification(id);
        }, 5000);
        break;
      }

      case "setStatus": {
        const statusId = payload.statusKey || payload.id || payload.statusId || "default";
        const statusText = payload.statusText ?? payload.status ?? payload.text ?? "";
        store.setPiStatus(statusId, statusText);

        // Handle clarify status updates
        if (statusId === "clarify") {
          if (statusText) {
            try {
              const data = JSON.parse(statusText);
              useApprovalStore.setState({ clarifyQuestions: data.questions || null });
            } catch { /* ignore */ }
          } else {
            useApprovalStore.setState({ clarifyQuestions: null, clarifyInputRequestId: null });
          }
        }
        break;
      }

      default:
        console.debug("[piui] Unhandled UI request method:", event.method, event);
        break;
    }
  }).catch((err) => {
    console.error("[piui] Failed to set up Pi UI listener:", err);
  });
}
