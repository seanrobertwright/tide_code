import { create } from "zustand";
import { permissionsLoad, permissionsSave } from "../lib/ipc";

export interface Permission {
  id: string;
  toolName: string;       // "write", "edit", "bash", "read", "*"
  scope: "tool" | "pattern";
  pattern?: string;       // glob-like: "src/**/*.ts" or "npm *"
  decision: "allow" | "deny";
  createdAt: number;
}

interface PermissionState {
  permissions: Permission[];
  yoloMode: boolean;
  loaded: boolean;

  load: () => Promise<void>;
  save: () => Promise<void>;
  addPermission: (p: Omit<Permission, "id" | "createdAt">) => void;
  removePermission: (id: string) => void;
  clearAll: () => void;
  setYoloMode: (enabled: boolean) => void;
  checkPermission: (toolName: string, filePath?: string) => "allow" | "deny" | null;
}

function generateId(): string {
  return `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Simple glob-like match: supports * as wildcard */
function matchPattern(pattern: string, value: string): boolean {
  const regex = new RegExp(
    "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"
  );
  return regex.test(value);
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  permissions: [],
  yoloMode: false,
  loaded: false,

  load: async () => {
    try {
      const data = await permissionsLoad();
      set({
        permissions: (data.permissions || []) as Permission[],
        yoloMode: data.yoloMode || false,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  save: async () => {
    const { permissions, yoloMode } = get();
    try {
      await permissionsSave({ permissions: permissions as any, yoloMode });
    } catch (err) {
      console.error("[Tide] Failed to save permissions:", err);
    }
  },

  addPermission: (p) => {
    const perm: Permission = { ...p, id: generateId(), createdAt: Date.now() };
    set((state) => ({ permissions: [...state.permissions, perm] }));
    // Save async
    setTimeout(() => get().save(), 0);
  },

  removePermission: (id) => {
    set((state) => ({ permissions: state.permissions.filter((p) => p.id !== id) }));
    setTimeout(() => get().save(), 0);
  },

  clearAll: () => {
    set({ permissions: [] });
    setTimeout(() => get().save(), 0);
  },

  setYoloMode: (enabled) => {
    set({ yoloMode: enabled });
    setTimeout(() => get().save(), 0);
  },

  checkPermission: (toolName: string, filePath?: string): "allow" | "deny" | null => {
    const { yoloMode, permissions } = get();
    if (yoloMode) return "allow";

    // Check tool-level permissions first (broader), then pattern-level
    for (const p of permissions) {
      if (p.scope === "tool") {
        if (p.toolName === "*" || p.toolName === toolName) {
          return p.decision;
        }
      }
    }

    // Check pattern-level permissions
    if (filePath) {
      for (const p of permissions) {
        if (p.scope === "pattern" && p.pattern && p.toolName === toolName) {
          if (matchPattern(p.pattern, filePath)) {
            return p.decision;
          }
        }
      }
    }

    return null; // No matching permission — show dialog
  },
}));
