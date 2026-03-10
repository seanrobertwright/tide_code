import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";

function ensureSessionsDir(workspaceRoot: string): string {
  const dir = path.join(workspaceRoot, ".tide", "sessions");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function generateTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export default function tideSession(pi: ExtensionAPI) {
  // Track files changed and tools used during the session
  let filesChanged = new Set<string>();
  let toolsUsed = new Set<string>();
  let sessionStartTime: string | null = null;

  pi.on("session_start", async () => {
    filesChanged = new Set();
    toolsUsed = new Set();
    sessionStartTime = new Date().toISOString();
  });

  // Tool names that indicate file modifications
  const WRITE_TOOLS = new Set([
    "write_file", "edit_file", "create_file", "patch",
    "WriteFile", "EditFile", "CreateFile",
    "write", "edit", "create",
  ]);

  // Track tool executions to build session metadata
  pi.on("tool_execution_end", async (event) => {
    const e = event as any;
    const toolName = e.toolName || e.tool_name || "";
    if (toolName) toolsUsed.add(toolName);

    // Track file modifications using exact tool name matching
    if (WRITE_TOOLS.has(toolName)) {
      const args = e.args || {};
      const filePath = args.file_path || args.filePath || args.path || "";
      if (filePath) filesChanged.add(filePath);
    }
  });

  // Tool: Generate a session summary on demand
  pi.registerTool({
    name: "tide_session_summary",
    label: "Save Summary",
    description: "Generate and save a summary of the current session. Call this at the end of significant work to preserve context for future sessions. The summary is saved to .tide/sessions/ and will be automatically injected as context in future conversations.",
    promptSnippet: "Save a session summary for future context injection",
    promptGuidelines: [
      "Call at the end of significant work sessions to preserve context",
      "Include key decisions and remaining TODOs so future sessions can pick up where you left off",
    ],
    parameters: Type.Object({
      summary: Type.String({ description: "A concise summary of what was accomplished, decisions made, and any remaining TODOs" }),
      keyDecisions: Type.Optional(Type.Array(Type.String(), { description: "List of key decisions made during this session" })),
      todos: Type.Optional(Type.Array(Type.String(), { description: "List of remaining TODOs or follow-up items" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const dir = ensureSessionsDir(ctx.cwd);
      const timestamp = generateTimestamp();
      const filename = `${timestamp}.md`;

      const lines: string[] = [
        `# Session Summary — ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
        "",
        params.summary,
        "",
      ];

      if (filesChanged.size > 0) {
        lines.push("## Files Changed", "");
        for (const f of filesChanged) {
          lines.push(`- \`${f}\``);
        }
        lines.push("");
      }

      if (params.keyDecisions && params.keyDecisions.length > 0) {
        lines.push("## Key Decisions", "");
        for (const d of params.keyDecisions) {
          lines.push(`- ${d}`);
        }
        lines.push("");
      }

      if (toolsUsed.size > 0) {
        lines.push("## Tools Used", "");
        lines.push(`${Array.from(toolsUsed).join(", ")}`);
        lines.push("");
      }

      if (params.todos && params.todos.length > 0) {
        lines.push("## TODOs", "");
        for (const t of params.todos) {
          lines.push(`- [ ] ${t}`);
        }
        lines.push("");
      }

      if (sessionStartTime) {
        lines.push(`---`, `Session started: ${sessionStartTime}`);
      }

      const content = lines.join("\n");
      fs.writeFileSync(path.join(dir, filename), content, "utf-8");

      return {
        content: [{ type: "text" as const, text: `Session summary saved to .tide/sessions/${filename}` }],
        details: { filename, filesChanged: filesChanged.size, toolsUsed: toolsUsed.size },
      };
    },
  });

  // Tool: List past session summaries
  pi.registerTool({
    name: "tide_session_list",
    label: "List Sessions",
    description: "List past session summaries. Returns the most recent sessions with their timestamps and first lines.",
    promptSnippet: "List recent session summaries",
    parameters: Type.Object({
      count: Type.Optional(Type.Number({ description: "Number of sessions to list (default: 5)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const dir = ensureSessionsDir(ctx.cwd);
      const files = fs.readdirSync(dir)
        .filter((f) => f.endsWith(".md"))
        .sort()
        .reverse()
        .slice(0, params.count ?? 5);

      const sessions = files.map((f) => {
        const content = fs.readFileSync(path.join(dir, f), "utf-8");
        const firstLines = content.split("\n").slice(0, 4).join("\n");
        return { file: f, excerpt: firstLines };
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(sessions, null, 2) }],
        details: { count: sessions.length },
      };
    },
  });

  // Tool: Read a specific session summary
  pi.registerTool({
    name: "tide_session_read",
    label: "Read Session",
    description: "Read the full content of a specific session summary file.",
    promptSnippet: "Read a specific session summary file",
    parameters: Type.Object({
      filename: Type.String({ description: "Session filename (e.g. '2026-03-06T14-30-00.md')" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const filePath = path.join(ensureSessionsDir(ctx.cwd), params.filename);
      if (!fs.existsSync(filePath)) {
        return {
          content: [{ type: "text" as const, text: `Session not found: ${params.filename}` }],
          isError: true,
        };
      }
      const content = fs.readFileSync(filePath, "utf-8");
      return { content: [{ type: "text" as const, text: content }] };
    },
  });
}
