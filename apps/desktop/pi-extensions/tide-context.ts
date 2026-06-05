import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

interface CategoryBreakdown {
  category: string;
  tokens: number;
  percentage: number;
}

interface ContextSnapshot {
  categories: CategoryBreakdown[];
  totalTokens: number;
  /** Authoritative context window of the CURRENT model, from Pi (0 if unknown). */
  contextWindow: number;
  /** Authoritative usage fraction (0-1) from Pi, or null right after compaction. */
  percent: number | null;
  timestamp: string;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === "string") return part;
        if (part.text) return part.text;
        if (part.content) return typeof part.content === "string" ? part.content : JSON.stringify(part.content);
        return JSON.stringify(part);
      })
      .join("");
  }
  return JSON.stringify(content ?? "");
}

function exclusionsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".tide", "context-exclusions.json");
}

function snapshotPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".tide", "context-snapshot.json");
}

function loadExclusions(workspaceRoot: string): Set<string> {
  const p = exclusionsPath(workspaceRoot);
  if (!fs.existsSync(p)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf-8"));
    return new Set(Array.isArray(data) ? data : []);
  } catch {
    return new Set();
  }
}

function writeSnapshotAtomic(workspaceRoot: string, snapshot: ContextSnapshot): void {
  const target = snapshotPath(workspaceRoot);
  const tmp = target + ".tmp";
  try {
    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2), "utf-8");
    fs.renameSync(tmp, target);
  } catch {
    // Best effort — don't crash the extension
  }
}

export default function tideContext(pi: ExtensionAPI) {
  let lastSnapshotTokens = 0;
  let lastContextWindow = 0;

  pi.on("context", async (event, ctx) => {
    const workspaceRoot = ctx.cwd;
    const messages = event.messages;

    // --- Compute category breakdown ---
    let systemTokens = 0;
    let conversationTokens = 0;
    let toolResultTokens = 0;

    const excluded = loadExclusions(workspaceRoot);
    let filteredMessages = messages;

    for (const msg of messages) {
      const text = contentToText((msg as any).content);
      const tokens = estimateTokens(text);
      const role = (msg as any).role || (msg as any).type;

      if (role === "system") {
        systemTokens += tokens;
      } else if (role === "user" || role === "assistant") {
        conversationTokens += tokens;
      } else if (role === "tool" || role === "tool_result") {
        toolResultTokens += tokens;
      }
    }

    // Estimate tool definitions based on actual active tool count (~500 tokens each)
    let toolCount = 24; // fallback
    try {
      const allTools = pi.getAllTools();
      if (Array.isArray(allTools)) toolCount = allTools.length;
    } catch { /* use fallback */ }
    const toolDefTokens = toolCount * 500;

    // Prefer Pi's authoritative count if available — eliminates drift between
    // Tide's heuristic (length/3.5) and the LLM's actual tokenization.
    // The category breakdown still uses the heuristic for proportions; we only
    // anchor the TOTAL to Pi.
    const piUsage = ctx.getContextUsage?.();
    const heuristicTotal = systemTokens + conversationTokens + toolResultTokens + toolDefTokens;
    const totalTokens = (piUsage && typeof piUsage.tokens === "number" && piUsage.tokens > 0)
      ? piUsage.tokens
      : heuristicTotal;

    // Pi is the single source of truth for the budget (current model's window) and
    // the usage fraction. Because Pi computes these for whatever model is active —
    // including after the model router auto-switches mid-session — the indicator
    // stays accurate without the frontend reconstructing it from RPC model events.
    // `contextWindow` is 0 and `percent` is null when Pi can't report (e.g. before the
    // first LLM response or right after compaction); the frontend keeps last-known values.
    const contextWindow = (piUsage && typeof piUsage.contextWindow === "number" && piUsage.contextWindow > 0)
      ? piUsage.contextWindow
      : 0;
    const percent = (piUsage && typeof piUsage.percent === "number") ? piUsage.percent : null;

    const categories: CategoryBreakdown[] = [];
    if (systemTokens > 0) {
      categories.push({ category: "System Prompt", tokens: systemTokens, percentage: totalTokens > 0 ? systemTokens / totalTokens : 0 });
    }
    if (conversationTokens > 0) {
      categories.push({ category: "Conversation", tokens: conversationTokens, percentage: totalTokens > 0 ? conversationTokens / totalTokens : 0 });
    }
    if (toolResultTokens > 0) {
      categories.push({ category: "Tool Results", tokens: toolResultTokens, percentage: totalTokens > 0 ? toolResultTokens / totalTokens : 0 });
    }
    categories.push({ category: "Tool Definitions", tokens: toolDefTokens, percentage: totalTokens > 0 ? toolDefTokens / totalTokens : 0 });

    // Write snapshot for frontend consumption. Throttle on token change (>5%), but
    // ALWAYS write when the context window changes — that's a model switch (e.g. the
    // router moving to a different-window model), and the budget denominator must
    // update immediately so the indicator doesn't show a stale percentage.
    const delta = Math.abs(totalTokens - lastSnapshotTokens);
    const windowChanged = contextWindow > 0 && contextWindow !== lastContextWindow;
    if (lastSnapshotTokens === 0 || windowChanged || delta / Math.max(lastSnapshotTokens, 1) > 0.05) {
      writeSnapshotAtomic(workspaceRoot, {
        categories,
        totalTokens,
        contextWindow,
        percent,
        timestamp: new Date().toISOString(),
      });
      lastSnapshotTokens = totalTokens;
      if (contextWindow > 0) lastContextWindow = contextWindow;
    }

    // --- Filter excluded messages ---
    if (excluded.size > 0) {
      filteredMessages = messages.filter((msg: any) => {
        const id = msg.id || msg.entryId;
        return !id || !excluded.has(id);
      });
      if (filteredMessages.length !== messages.length) {
        const removedCount = messages.length - filteredMessages.length;
        process.stderr.write(`[tide:context] Filtered ${removedCount} excluded message(s) from context\n`);
        return { messages: filteredMessages };
      }
    }
  });
}
