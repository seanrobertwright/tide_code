import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";

const TOOL_USE_DIRECTIVE =
  "## Tool Usage Policy\n\n" +
  "You MUST use tools directly to implement changes. Never describe what you would do — " +
  "always execute it using the available tools (write, edit, bash, etc.). " +
  "If a tool call is blocked by the safety system, report the block and move on. " +
  "Do not preemptively refuse to use tools based on configuration comments.";

function stripSafetyPolicy(content: string): string {
  let cleaned = content.replace(/## Safety Policy[\s\S]*?(?=\n## |\n# |$)/i, "");
  cleaned = cleaned.replace(/^(?:write_approval|command_approval|command_policy|command|read|write|git_write|approval_policy):\s*.*$/gim, "");
  cleaned = cleaned.replace(/## Command Allowlist[\s\S]*?(?=\n## |\n# |$)/i, "");
  return cleaned.trim();
}

interface RegionTag {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  label: string;
  note?: string;
  pinned: boolean;
  createdAt: string;
}

function ensureTideDir(workspaceRoot: string): void {
  const tideDir = path.join(workspaceRoot, ".tide");
  if (!fs.existsSync(tideDir)) {
    fs.mkdirSync(tideDir, { recursive: true });
  }
  const tagsDir = path.join(tideDir, "tags");
  if (!fs.existsSync(tagsDir)) {
    fs.mkdirSync(tagsDir, { recursive: true });
  }
  const sessionsDir = path.join(tideDir, "sessions");
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
}

// ── Project Memory ──────────────────────────────────────────

interface MemoryEntry {
  key: string;
  value: string;
  category?: string;
  updatedAt: string;
}

function memoryPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".tide", "memory.json");
}

function loadMemory(workspaceRoot: string): MemoryEntry[] {
  const p = memoryPath(workspaceRoot);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
}

function saveMemory(workspaceRoot: string, entries: MemoryEntry[]): void {
  fs.writeFileSync(memoryPath(workspaceRoot), JSON.stringify(entries, null, 2), "utf-8");
}

function formatMemoryForContext(entries: MemoryEntry[]): string {
  if (entries.length === 0) return "";
  let ctx = "## Project Memory\n\nLearned facts about this project:\n\n";
  for (const e of entries) {
    ctx += `- **${e.key}**${e.category ? ` [${e.category}]` : ""}: ${e.value}\n`;
  }
  return ctx;
}

// ── Session Summaries ───────────────────────────────────────

function sessionsDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".tide", "sessions");
}

function loadRecentSessions(workspaceRoot: string, count: number): string[] {
  const dir = sessionsDir(workspaceRoot);
  if (!fs.existsSync(dir)) return [];
  try {
    const files = fs.readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse()
      .slice(0, count);
    return files.map((f) => fs.readFileSync(path.join(dir, f), "utf-8"));
  } catch {
    return [];
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function loadTags(workspaceRoot: string): RegionTag[] {
  const tagsFile = path.join(workspaceRoot, ".tide", "tags", "tags.json");
  if (!fs.existsSync(tagsFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(tagsFile, "utf-8"));
  } catch {
    return [];
  }
}

function saveTags(workspaceRoot: string, tags: RegionTag[]): void {
  const tagsDir = path.join(workspaceRoot, ".tide", "tags");
  if (!fs.existsSync(tagsDir)) {
    fs.mkdirSync(tagsDir, { recursive: true });
  }
  const tagsFile = path.join(tagsDir, "tags.json");
  fs.writeFileSync(tagsFile, JSON.stringify(tags, null, 2), "utf-8");
}

function readTagContent(workspaceRoot: string, tag: RegionTag): string | null {
  try {
    const fullPath = path.join(workspaceRoot, tag.filePath);
    if (!fs.existsSync(fullPath)) return null;
    const lines = fs.readFileSync(fullPath, "utf-8").split("\n");
    return lines.slice(tag.startLine - 1, tag.endLine).join("\n");
  } catch {
    return null;
  }
}

function formatTagsForContext(tags: RegionTag[], workspaceRoot: string): string {
  if (tags.length === 0) return "";

  let ctx = "## Pinned Region Tags\n\nThe user has pinned these code regions as important context. Reference them by @label when relevant.\n\n";
  for (const tag of tags) {
    ctx += `### @${tag.label} (${tag.filePath}:${tag.startLine}-${tag.endLine})`;
    if (tag.note) ctx += `\n${tag.note}`;
    const content = readTagContent(workspaceRoot, tag);
    if (content) {
      const ext = tag.filePath.split(".").pop() || "";
      ctx += `\n\`\`\`${ext}\n${content}\n\`\`\``;
    }
    ctx += "\n\n";
  }
  return ctx;
}

export default function tideProject(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ensureTideDir(ctx.cwd);
  });

  // Inject .tide/ context before each agent conversation
  // Priority-based injection with token budgeting:
  //   1. TIDE.md rules (always, never trimmed)
  //   2. Pinned region tags (always)
  //   3. Active feature plan (if exists)
  //   4. Project memory entries (trimmable)
  //   5. Recent session summaries (trimmable)
  pi.on("before_agent_start", async (_event, ctx) => {
    const workspaceRoot = ctx.cwd;
    const prompt = (_event as any).prompt || "";

    // During orchestration, only inject TIDE.md rules (safety-critical).
    // Skip heavy context (tags, plans, memory, sessions) — the orchestrator
    // already provides curated context in each step prompt.
    if (prompt.trimStart().startsWith("[tide:orchestrated]")) {
      const tideMdPath = path.join(workspaceRoot, "TIDE.md");
      if (fs.existsSync(tideMdPath)) {
        try {
          const content = fs.readFileSync(tideMdPath, "utf-8");
          const safeContent = stripSafetyPolicy(content);
          return {
            systemPrompt: (_event as any).systemPrompt +
              "\n\n" + TOOL_USE_DIRECTIVE +
              (safeContent ? "\n\n# Project Configuration (TIDE.md)\n\n" + safeContent : ""),
          };
        } catch { /* ignore */ }
      }
      return {
        systemPrompt: (_event as any).systemPrompt + "\n\n" + TOOL_USE_DIRECTIVE,
      };
    }

    const contextBudget = 8000; // max tokens for injected context
    const parts: string[] = [];
    let usedTokens = 0;

    // 0. Tool usage directive — always inject first
    parts.push(TOOL_USE_DIRECTIVE);
    usedTokens += estimateTokens(TOOL_USE_DIRECTIVE);

    // 1. TIDE.md — inject non-safety content (safety is enforced by tide-safety.ts)
    const tideMdPath = path.join(workspaceRoot, "TIDE.md");
    if (fs.existsSync(tideMdPath)) {
      try {
        const content = fs.readFileSync(tideMdPath, "utf-8");
        const safeContent = stripSafetyPolicy(content);
        if (safeContent) {
          const section = `# Project Configuration (TIDE.md)\n\n${safeContent}`;
          parts.push(section);
          usedTokens += estimateTokens(section);
        }
      } catch { /* ignore */ }
    }

    // 2. Pinned region tags — always inject
    const tags = loadTags(workspaceRoot);
    const pinnedTags = tags.filter((t) => t.pinned);
    if (pinnedTags.length > 0) {
      const section = formatTagsForContext(pinnedTags, workspaceRoot);
      parts.push(section);
      usedTokens += estimateTokens(section);
    }

    // 3. Active feature plan (if exists)
    const plansDir = path.join(workspaceRoot, ".tide", "plans");
    if (fs.existsSync(plansDir)) {
      try {
        const planFiles = fs.readdirSync(plansDir)
          .filter((f) => f.endsWith(".json"))
          .sort()
          .reverse();
        for (const pf of planFiles) {
          const plan = JSON.parse(fs.readFileSync(path.join(plansDir, pf), "utf-8"));
          if (plan.status === "in_progress" || plan.steps?.some((s: any) => s.status === "pending")) {
            const section = `## Active Plan: ${plan.title}\n\n${plan.description}\n\nSteps: ${plan.steps?.map((s: any) => `${s.status === "completed" ? "[x]" : "[ ]"} ${s.title}`).join(", ")}`;
            const tokens = estimateTokens(section);
            if (usedTokens + tokens < contextBudget) {
              parts.push(section);
              usedTokens += tokens;
            }
            break;
          }
        }
      } catch { /* ignore */ }
    }

    // 4. Project memory — trimmable
    const memory = loadMemory(workspaceRoot);
    if (memory.length > 0) {
      const section = formatMemoryForContext(memory);
      const tokens = estimateTokens(section);
      if (usedTokens + tokens < contextBudget) {
        parts.push(section);
        usedTokens += tokens;
      }
    }

    // 5. Recent session summaries — trimmable
    const recentSessions = loadRecentSessions(workspaceRoot, 2);
    if (recentSessions.length > 0) {
      const combined = recentSessions.join("\n\n---\n\n");
      const section = `## Recent Sessions\n\n${combined}`;
      const tokens = estimateTokens(section);
      if (usedTokens + tokens < contextBudget) {
        parts.push(section);
        usedTokens += tokens;
      }
    }

    if (parts.length > 0) {
      return {
        systemPrompt: (_event as any).systemPrompt + "\n\n" + parts.join("\n\n"),
      };
    }
  });

  // Register custom tool for agent to query region tags
  pi.registerTool({
    name: "tide_tags",
    label: "Region Tags",
    description: "List region tags for a file or the entire workspace. Region tags are user-annotated code regions.",
    promptSnippet: "List user-annotated region tags for a file or workspace",
    parameters: Type.Object({
      filePath: Type.Optional(Type.String({ description: "Filter tags by file path" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const tags = loadTags(ctx.cwd);
      const filtered = params.filePath
        ? tags.filter((t) => t.filePath === params.filePath)
        : tags;

      // Include actual source content for each tag
      const enriched = filtered.map((t) => ({
        ...t,
        content: readTagContent(ctx.cwd, t),
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(enriched, null, 2) }],
        details: { count: filtered.length },
      };
    },
  });

  // Register tool for agent to create a region tag
  pi.registerTool({
    name: "tide_tag_create",
    label: "Create Tag",
    description: "Create a new region tag to annotate a code region. Tags help track important code sections.",
    promptSnippet: "Create a region tag to annotate a code section",
    parameters: Type.Object({
      filePath: Type.String({ description: "File path relative to workspace root" }),
      startLine: Type.Number({ description: "Start line number (1-based)" }),
      endLine: Type.Number({ description: "End line number (1-based)" }),
      label: Type.String({ description: "Short label for the tag" }),
      note: Type.Optional(Type.String({ description: "Optional longer note" })),
      pinned: Type.Optional(Type.Boolean({ description: "Pin tag to always include in context" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const tags = loadTags(ctx.cwd);
      const newTag: RegionTag = {
        id: crypto.randomUUID(),
        filePath: params.filePath,
        startLine: params.startLine,
        endLine: params.endLine,
        label: params.label,
        note: params.note,
        pinned: params.pinned ?? false,
        createdAt: new Date().toISOString(),
      };
      tags.push(newTag);
      saveTags(ctx.cwd, tags);

      return {
        content: [{ type: "text" as const, text: `Created tag "${newTag.label}" (${newTag.id})` }],
        details: { tag: newTag },
      };
    },
  });

  // Register tool for agent to delete a region tag
  pi.registerTool({
    name: "tide_tag_delete",
    label: "Delete Tag",
    description: "Delete a region tag by its ID.",
    promptSnippet: "Delete a region tag by ID",
    parameters: Type.Object({
      id: Type.String({ description: "Tag ID to delete" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const tags = loadTags(ctx.cwd);
      const idx = tags.findIndex((t) => t.id === params.id);
      if (idx === -1) {
        return {
          content: [{ type: "text" as const, text: `Tag not found: ${params.id}` }],
          isError: true,
        };
      }
      const removed = tags.splice(idx, 1)[0];
      saveTags(ctx.cwd, tags);

      return {
        content: [{ type: "text" as const, text: `Deleted tag "${removed.label}" (${removed.id})` }],
        details: { deleted: removed },
      };
    },
  });

  // ── Project Memory Tools ────────────────────────────────────

  pi.registerTool({
    name: "tide_memory_read",
    label: "Read Memory",
    description: "Read a project memory entry by key, or list all entries if no key provided. Use this to recall learned facts about the project.",
    promptSnippet: "Read project memory entries (learned facts)",
    parameters: Type.Object({
      key: Type.Optional(Type.String({ description: "Key to read. Omit to list all." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const entries = loadMemory(ctx.cwd);
      if (params.key) {
        const entry = entries.find((e) => e.key === params.key);
        if (!entry) {
          return { content: [{ type: "text" as const, text: `No memory entry for key: ${params.key}` }] };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(entry, null, 2) }] };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(entries, null, 2) }],
        details: { count: entries.length },
      };
    },
  });

  pi.registerTool({
    name: "tide_memory_write",
    label: "Write Memory",
    description: "Store a project fact in memory. Use this to remember architecture decisions, naming conventions, test patterns, and other project knowledge for future sessions.",
    promptSnippet: "Store a project fact in persistent memory",
    promptGuidelines: [
      "Use short, descriptive keys like 'test_framework' or 'api_pattern'",
      "Store facts that would be useful across sessions — conventions, architecture decisions, gotchas",
    ],
    parameters: Type.Object({
      key: Type.String({ description: "Short key for the fact (e.g. 'test_framework', 'api_pattern')" }),
      value: Type.String({ description: "The fact to remember" }),
      category: Type.Optional(Type.String({ description: "Category: architecture, convention, pattern, dependency, or other" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const entries = loadMemory(ctx.cwd);
      const existing = entries.findIndex((e) => e.key === params.key);
      const entry: MemoryEntry = {
        key: params.key,
        value: params.value,
        category: params.category,
        updatedAt: new Date().toISOString(),
      };
      if (existing !== -1) {
        entries[existing] = entry;
      } else {
        entries.push(entry);
      }
      saveMemory(ctx.cwd, entries);
      return {
        content: [{ type: "text" as const, text: `Stored memory: ${params.key}` }],
        details: { entry },
      };
    },
  });

  pi.registerTool({
    name: "tide_memory_delete",
    label: "Delete Memory",
    description: "Delete a project memory entry by key.",
    promptSnippet: "Delete a project memory entry",
    parameters: Type.Object({
      key: Type.String({ description: "Key to delete" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const entries = loadMemory(ctx.cwd);
      const idx = entries.findIndex((e) => e.key === params.key);
      if (idx === -1) {
        return {
          content: [{ type: "text" as const, text: `No memory entry for key: ${params.key}` }],
          isError: true,
        };
      }
      entries.splice(idx, 1);
      saveMemory(ctx.cwd, entries);
      return { content: [{ type: "text" as const, text: `Deleted memory: ${params.key}` }] };
    },
  });
}
