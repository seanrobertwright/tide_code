import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";

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
  pi.on("before_agent_start", async (_event, ctx) => {
    const workspaceRoot = ctx.cwd;
    const parts: string[] = [];

    // Read TIDE.md for project-specific instructions
    const tideMdPath = path.join(workspaceRoot, "TIDE.md");
    if (fs.existsSync(tideMdPath)) {
      try {
        const content = fs.readFileSync(tideMdPath, "utf-8");
        parts.push(`# Project Configuration (TIDE.md)\n\n${content}`);
      } catch { /* ignore */ }
    }

    // Inject pinned region tags as context
    const tags = loadTags(workspaceRoot);
    const pinnedTags = tags.filter((t) => t.pinned);
    if (pinnedTags.length > 0) {
      parts.push(formatTagsForContext(pinnedTags, workspaceRoot));
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
    description: "List region tags for a file or the entire workspace. Region tags are user-annotated code regions.",
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
    description: "Create a new region tag to annotate a code region. Tags help track important code sections.",
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
    description: "Delete a region tag by its ID.",
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
}
