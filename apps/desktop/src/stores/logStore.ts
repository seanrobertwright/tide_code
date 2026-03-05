import { create } from "zustand";

export interface ToolLogEntry {
  id: string;
  requestId: string;
  sessionId: string | null;
  toolName: string;
  argsJson: string;
  safetyLevel: string;
  approvalRequired: boolean;
  approvalResult: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  status: "running" | "success" | "error" | "cancelled";
  resultJson: string | null;
  error: string | null;
}

interface LogState {
  logs: ToolLogEntry[];
  filterTool: string;
  filterStatus: string;
  setFilterTool: (tool: string) => void;
  setFilterStatus: (status: string) => void;
  fetchLogs: () => Promise<void>;
  addToolStart: (id: string, toolName: string, extra?: { argsJson?: string }) => void;
  completeToolLog: (id: string, extra?: { resultJson?: string; error?: string }) => void;
}

export const useLogStore = create<LogState>((set) => ({
  logs: [],
  filterTool: "",
  filterStatus: "",

  setFilterTool: (tool: string) => set({ filterTool: tool }),
  setFilterStatus: (status: string) => set({ filterStatus: status }),

  // No-op for now — Pi doesn't expose a log query command.
  // Logs are populated via addToolStart/completeToolLog from Pi events.
  fetchLogs: async () => {},

  addToolStart: (id: string, toolName: string, extra?: { argsJson?: string }) => {
    set((state) => ({
      logs: [
        {
          id,
          requestId: id,
          sessionId: null,
          toolName,
          argsJson: extra?.argsJson ?? "{}",
          safetyLevel: "read",
          approvalRequired: false,
          approvalResult: null,
          startedAt: new Date().toISOString(),
          completedAt: null,
          durationMs: null,
          status: "running",
          resultJson: null,
          error: null,
        },
        ...state.logs,
      ],
    }));
  },

  completeToolLog: (id: string, extra?: { resultJson?: string; error?: string }) => {
    set((state) => ({
      logs: state.logs.map((log) =>
        log.id === id
          ? {
              ...log,
              status: (extra?.error ? "error" : "success") as "error" | "success",
              completedAt: new Date().toISOString(),
              durationMs: Math.round(
                new Date().getTime() - new Date(log.startedAt).getTime(),
              ),
              resultJson: extra?.resultJson ?? null,
              error: extra?.error ?? null,
            }
          : log,
      ),
    }));
  },
}));
