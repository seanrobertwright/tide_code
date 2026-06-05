/**
 * Tide Subagent Extension
 *
 * Spawns isolated Pi processes for codebase exploration and web research.
 * Results are summarized before returning to the main agent's context,
 * preventing context pollution from raw tool outputs.
 *
 * Follows Pi's official subagent pattern (examples/extensions/subagent/).
 */

import { setMaxListeners } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  type AgentResult,
  type ModelRef,
  createLogger,
  formatTokens,
  loadAgentPrompt,
  mapWithConcurrencyLimit,
  resolveExtensionPath,
  resolveModelFromRegistry,
  resolvePiBinary,
  runAgent,
} from "./tide-agent-utils.js";

const MAX_CONCURRENCY = 4;
const DEFAULT_SUMMARY_MAX_CHARS = 3000;
// Max TEXT turns (tool-call-only messages don't count)
const MAX_TURNS: Record<string, number> = { explore: 10, research: 5 };

const log = createLogger("tide:subagent");

// ── Config ──────────────────────────────────────────────

interface RouterConfig {
  subagentModels?: {
    webSearch?: ModelRef;
    codebaseExploration?: ModelRef;
  };
}

function loadRouterConfig(cwd: string): RouterConfig {
  const configPath = path.join(cwd, ".tide", "router-config.json");
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch { /* ignore */ }
  return {};
}

function resolveSubagentModel(ctx: any, config: RouterConfig, type: "explore" | "research"): string | undefined {
  const ref = type === "explore"
    ? config.subagentModels?.codebaseExploration
    : config.subagentModels?.webSearch;
  return resolveModelFromRegistry(ctx, ref, type);
}

// ── Extension Registration ──────────────────────────────

export default function tideSubagent(pi: ExtensionAPI) {
  log("Extension registered (explore, research, dispatch tools)");

  // ── tide_explore ──────────────────────────────────────────

  pi.registerTool({
    name: "tide_explore",
    label: "Explore Codebase",
    description:
      "Spawn an isolated agent to explore the codebase. Returns a summarized report " +
      "of relevant files, patterns, and architecture. Uses the code index for efficient " +
      "symbol-level queries. Results don't pollute your context.",
    promptSnippet:
      "tide_explore spawns an isolated agent to explore the codebase and returns a summary. " +
      "Use it when asked to explore, or for broad codebase discovery. " +
      "For a single symbol/file lookup, tide_index_search is faster.",
    parameters: Type.Object({
      task: Type.String({ description: "What to explore (e.g. 'Find all auth-related files and understand the auth flow')" }),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const config = loadRouterConfig(ctx.cwd);
      const piBinary = resolvePiBinary();
      const systemPrompt = loadAgentPrompt(ctx.cwd, "explorer");
      const model = resolveSubagentModel(ctx, config, "explore");

      const indexExt = resolveExtensionPath("tide-index.ts");
      const extensions = indexExt ? [indexExt] : [];

      log(`Spawning explorer: model=${model || "default"}, task="${params.task.slice(0, 60)}..."`);

      if (onUpdate) {
        onUpdate({ content: [{ type: "text", text: "Exploring codebase..." }], details: null });
      }

      const result = await runAgent({
        type: "explore",
        task: params.task,
        cwd: ctx.cwd,
        piBinary,
        model,
        systemPrompt: systemPrompt || undefined,
        extensions,
        tools: ["read", "grep", "find", "ls"],
        signal,
        summaryMaxChars: DEFAULT_SUMMARY_MAX_CHARS,
        maxTurns: MAX_TURNS.explore,
      });

      const totalTokens = result.usage.input + result.usage.output;
      const usageStr = `(${result.usage.turns} turns, ${formatTokens(totalTokens)} tokens)`;

      if (result.exitCode !== 0) {
        throw new Error(`Exploration failed: ${result.error || "unknown error"}\n${usageStr}`);
      }

      log(`Explorer completed ${usageStr}`);
      return {
        content: [{ type: "text" as const, text: result.output || "(no output)" }],
        details: { usage: result.usage, model: result.model },
      };
    },
  });

  // ── tide_research ─────────────────────────────────────────

  pi.registerTool({
    name: "tide_research",
    label: "Web Research",
    description:
      "Spawn an isolated agent to search the web for documentation, APIs, and best practices. " +
      "Returns a summarized report. Results don't pollute your context.",
    promptSnippet:
      "tide_research spawns an isolated agent to search the web and returns a summary. " +
      "Use it when asked to research, or for multi-source documentation lookup. " +
      "For a single query, web_search is faster.",
    parameters: Type.Object({
      query: Type.String({ description: "What to research (e.g. 'Tauri v2 IPC best practices for background tasks')" }),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const config = loadRouterConfig(ctx.cwd);
      const piBinary = resolvePiBinary();
      const systemPrompt = loadAgentPrompt(ctx.cwd, "researcher");
      const model = resolveSubagentModel(ctx, config, "research");

      const webExt = resolveExtensionPath("tide-web-search.ts");
      const extensions = webExt ? [webExt] : [];

      log(`Spawning researcher: model=${model || "default"}, query="${params.query.slice(0, 60)}..."`);

      if (onUpdate) {
        onUpdate({ content: [{ type: "text", text: "Searching the web..." }], details: null });
      }

      const result = await runAgent({
        type: "research",
        task: params.query,
        cwd: ctx.cwd,
        piBinary,
        model,
        systemPrompt: systemPrompt || undefined,
        extensions,
        tools: ["read"],
        signal,
        summaryMaxChars: DEFAULT_SUMMARY_MAX_CHARS,
        maxTurns: MAX_TURNS.research,
      });

      const totalTokens = result.usage.input + result.usage.output;
      const usageStr = `(${result.usage.turns} turns, ${formatTokens(totalTokens)} tokens)`;

      if (result.exitCode !== 0) {
        throw new Error(`Research failed: ${result.error || "unknown error"}\n${usageStr}`);
      }

      log(`Researcher completed ${usageStr}`);
      return {
        content: [{ type: "text" as const, text: result.output || "(no output)" }],
        details: { usage: result.usage, model: result.model },
      };
    },
  });

  // ── tide_dispatch ─────────────────────────────────────────

  pi.registerTool({
    name: "tide_dispatch",
    label: "Parallel Dispatch",
    description:
      "Run multiple exploration and research tasks in parallel. Each task runs in an isolated " +
      "Pi process with its own context. Returns combined summarized results. " +
      "Use this to explore the codebase AND search documentation simultaneously.",
    promptSnippet:
      "tide_dispatch runs multiple explore/research tasks in parallel with isolated contexts. " +
      "Use it for broad codebase understanding or when combining exploration with web research.",
    parameters: Type.Object({
      tasks: Type.Array(
        Type.Object({
          type: Type.Union([Type.Literal("explore"), Type.Literal("research")], {
            description: '"explore" for codebase discovery, "research" for web search',
          }),
          task: Type.String({ description: "Task description or search query" }),
        }),
        { description: "Array of tasks to run in parallel", minItems: 1, maxItems: 8 },
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const config = loadRouterConfig(ctx.cwd);
      const piBinary = resolvePiBinary();

      const indexExt = resolveExtensionPath("tide-index.ts");
      const webExt = resolveExtensionPath("tide-web-search.ts");
      const explorerPrompt = loadAgentPrompt(ctx.cwd, "explorer");
      const researcherPrompt = loadAgentPrompt(ctx.cwd, "researcher");

      // Resolve models using settings → cheapest fallback
      const exploreModel = resolveSubagentModel(ctx, config, "explore");
      const researchModel = resolveSubagentModel(ctx, config, "research");

      log(`Dispatching ${params.tasks.length} tasks in parallel (max ${MAX_CONCURRENCY} concurrent)`);

      // Prevent MaxListenersExceeded warning for parallel dispatches
      if (signal) {
        try { setMaxListeners(20, signal); } catch { /* ignore if unsupported */ }
      }

      const completedCount = { value: 0 };

      const results = await mapWithConcurrencyLimit(
        params.tasks,
        MAX_CONCURRENCY,
        async (task, index) => {
          const isExplore = task.type === "explore";
          const model = isExplore ? exploreModel : researchModel;

          const result = await runAgent({
            type: task.type,
            task: task.task,
            cwd: ctx.cwd,
            piBinary,
            model,
            systemPrompt: isExplore ? (explorerPrompt || undefined) : (researcherPrompt || undefined),
            extensions: isExplore ? (indexExt ? [indexExt] : []) : (webExt ? [webExt] : []),
            tools: isExplore ? ["read", "grep", "find", "ls"] : ["read"],
            signal,
            summaryMaxChars: DEFAULT_SUMMARY_MAX_CHARS,
            maxTurns: MAX_TURNS[task.type] || 8,
          });

          completedCount.value++;
          if (onUpdate) {
            onUpdate({
              content: [{
                type: "text",
                text: `Progress: ${completedCount.value}/${params.tasks.length} tasks completed`,
              }], details: null });
          }

          return result;
        },
      );

      // Format combined output — tokens only, no cost estimate
      const sections: string[] = [];
      let totalTokens = 0;

      for (const r of results) {
        const header = r.type === "explore" ? "Codebase Exploration" : "Web Research";
        const status = r.exitCode === 0 ? "completed" : "failed";
        totalTokens += r.usage.input + r.usage.output;

        sections.push(
          `### ${header}: ${r.task.slice(0, 80)}\n` +
          `*Status: ${status}${r.model ? `, model: ${r.model}` : ""}, ${r.usage.turns} turns*\n\n` +
          (r.output || r.error || "(no output)")
        );
      }

      const successCount = results.filter((r) => r.exitCode === 0).length;
      const summary =
        `## Dispatch Results (${successCount}/${results.length} succeeded, ${formatTokens(totalTokens)} tokens)\n\n` +
        sections.join("\n\n---\n\n");

      log(`Dispatch completed: ${successCount}/${results.length} succeeded, ${formatTokens(totalTokens)} tokens`);

      return {
        content: [{ type: "text" as const, text: summary }],
        details: {
          taskCount: results.length,
          successCount,
          totalTokens,
        },
      };
    },
  });
}
