import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

interface SafetyConfig {
  approvalPolicy: {
    read: "never";
    write: "always" | "ask" | "never";
    command: "disabled" | "always" | "allowlist";
  };
  commandAllowlist: string[];
}

const DEFAULT_CONFIG: SafetyConfig = {
  approvalPolicy: {
    read: "never",
    write: "always",
    command: "always",
  },
  commandAllowlist: [],
};

type SafetyLevel = "read" | "write" | "command";

function classifyTool(toolName: string): SafetyLevel {
  switch (toolName) {
    case "read":
    case "ls":
    case "grep":
    case "find":
      return "read";
    case "write":
    case "edit":
      return "write";
    case "bash":
      return "command";
    default:
      return "read";
  }
}

function loadSafetyConfig(workspaceRoot: string): SafetyConfig {
  const tideMdPath = path.join(workspaceRoot, "TIDE.md");
  if (!fs.existsSync(tideMdPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const content = fs.readFileSync(tideMdPath, "utf-8");
    const config = { ...DEFAULT_CONFIG };

    // Parse approval policy
    const writePolicy = content.match(/write_approval:\s*(always|ask|never)/i);
    if (writePolicy) {
      config.approvalPolicy.write = writePolicy[1].toLowerCase() as "always" | "ask" | "never";
    }

    const cmdPolicy = content.match(/command_approval:\s*(disabled|always|allowlist)/i);
    if (cmdPolicy) {
      config.approvalPolicy.command = cmdPolicy[1].toLowerCase() as "disabled" | "always" | "allowlist";
    }

    // Parse command allowlist
    const allowlistMatch = content.match(/command_allowlist:\s*\[([^\]]*)\]/i);
    if (allowlistMatch) {
      config.commandAllowlist = allowlistMatch[1]
        .split(",")
        .map((s) => s.trim().replace(/['"]/g, ""))
        .filter(Boolean);
    }

    return config;
  } catch {
    return DEFAULT_CONFIG;
  }
}

function shouldRequireApproval(
  level: SafetyLevel,
  config: SafetyConfig,
  toolName: string,
  args: Record<string, unknown>,
): boolean {
  if (level === "read") return false;

  if (level === "write") {
    return config.approvalPolicy.write === "always";
  }

  if (level === "command") {
    const policy = config.approvalPolicy.command;
    if (policy === "disabled") return true; // Will block entirely
    if (policy === "always") return true;
    if (policy === "allowlist") {
      const cmd = typeof args.command === "string" ? args.command.split(/\s+/)[0] : "";
      return !config.commandAllowlist.includes(cmd);
    }
  }

  return false;
}

function formatToolCallDescription(
  toolName: string,
  args: Record<string, unknown>,
  workspaceRoot: string,
): string {
  switch (toolName) {
    case "write": {
      const filePath = typeof args.path === "string" ? args.path : "unknown";
      const newContent = typeof args.content === "string" ? args.content : "";
      // Read existing file content for diff preview
      let originalContent = "";
      try {
        const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
        if (fs.existsSync(absPath)) {
          originalContent = fs.readFileSync(absPath, "utf-8");
        }
      } catch { /* new file */ }
      // Encode diff data as JSON after a delimiter for the frontend to parse
      const diffData = JSON.stringify({ filePath, originalContent, newContent });
      return `Write to: ${filePath}\n<!--TIDE_DIFF:${diffData}-->`;
    }
    case "edit": {
      const filePath = typeof args.path === "string" ? args.path : "unknown";
      const oldStr = typeof args.old_string === "string" ? args.old_string : "";
      const newStr = typeof args.new_string === "string" ? args.new_string : "";
      // Read existing file content for diff preview
      let originalContent = "";
      try {
        const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
        if (fs.existsSync(absPath)) {
          originalContent = fs.readFileSync(absPath, "utf-8");
        }
      } catch { /* ignore */ }
      // Compute new content by applying the edit
      const newContent = originalContent.includes(oldStr)
        ? originalContent.replace(oldStr, newStr)
        : originalContent;
      const diffData = JSON.stringify({ filePath, originalContent, newContent });
      return `Edit: ${filePath}\n<!--TIDE_DIFF:${diffData}-->`;
    }
    case "bash":
      return `Run command: ${args.command || "unknown"}`;
    default:
      return `${toolName}: ${JSON.stringify(args).slice(0, 200)}`;
  }
}

export default function tideSafety(pi: ExtensionAPI) {
  let safetyConfig: SafetyConfig = DEFAULT_CONFIG;

  pi.on("session_start", async (_event, ctx) => {
    safetyConfig = loadSafetyConfig(ctx.cwd);
  });

  pi.on("tool_call", async (event, ctx) => {
    const toolName = event.toolName;
    const args = (event.input ?? {}) as Record<string, unknown>;
    const level = classifyTool(toolName);

    // Check if command is disabled entirely
    if (level === "command" && safetyConfig.approvalPolicy.command === "disabled") {
      return { block: true, reason: "Command execution is disabled in TIDE.md" };
    }

    if (!shouldRequireApproval(level, safetyConfig, toolName, args)) {
      return; // Allow tool call to proceed
    }

    const description = formatToolCallDescription(toolName, args, ctx.cwd);
    const approved = await ctx.ui.confirm(
      `[${level.toUpperCase()}] Approve tool call?`,
      description,
    );

    if (!approved) {
      return { block: true, reason: "User denied tool execution" };
    }
  });
}
