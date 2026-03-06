import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Logging ─────────────────────────────────────────────────

function log(msg: string) {
  process.stderr.write(`[tide:router] ${msg}\n`);
}

// ── Tier Classification ─────────────────────────────────────

type Tier = "quick" | "standard" | "complex";

const COMPLEX_KEYWORDS = [
  "refactor", "architect", "redesign", "migrate",
  "rewrite", "overhaul", "restructure",
  "design system", "build out", "create a full", "entire codebase",
  "end-to-end", "from scratch",
  "add a feature", "new feature", "implement a",
  "create ui", "create a ui", "build a ui", "build ui",
  "implement the following plan", "implementation plan",
  "integrate with", "integration",
  "add support for", "full implementation",
  "multiple files", "across the codebase",
  "backend and frontend", "frontend and backend",
  "api and ui", "ui and api",
];

const QUICK_KEYWORDS = [
  "fix typo", "rename", "what is", "what does", "explain",
  "one line", "simple", "quick fix", "minor",
  "add a comment", "remove", "delete this", "why does",
  "how does", "what's the", "tell me",
];

interface IndexStats {
  fileCount: number;
  symbolCount: number;
}

function getIndexStats(cwd: string): IndexStats | null {
  const dbPath = path.join(cwd, ".tide", "index.db");
  if (!fs.existsSync(dbPath)) return null;

  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare("SELECT file_count, symbol_count FROM repos LIMIT 1").get() as any;
    db.close();
    if (row) return { fileCount: row.file_count, symbolCount: row.symbol_count };
  } catch { /* better-sqlite3 not available or db not ready */ }

  return null;
}

const CROSS_CODEBASE_KEYWORDS = [
  "across", "all files", "entire", "everywhere", "whole project",
  "whole codebase", "every file", "global", "throughout",
];

function classifyPrompt(text: string, cwd: string): { tier: Tier; reason: string } {
  const lower = text.toLowerCase().trim();

  if (lower.length < 20) {
    return { tier: "quick", reason: "Very short prompt" };
  }

  for (const kw of COMPLEX_KEYWORDS) {
    if (lower.includes(kw)) {
      return { tier: "complex", reason: `Complex keyword: "${kw}"` };
    }
  }

  for (const kw of QUICK_KEYWORDS) {
    if (lower.includes(kw)) {
      return { tier: "quick", reason: `Quick keyword: "${kw}"` };
    }
  }

  if (lower.length < 50 && lower.includes("?")) {
    return { tier: "quick", reason: "Short question" };
  }

  if (lower.length > 800) {
    return { tier: "complex", reason: "Very long prompt (>800 chars)" };
  }

  const fileRefs = (lower.match(/[\w/]+\.\w{1,5}/g) || []).length;
  if (fileRefs >= 4) {
    return { tier: "complex", reason: `References ${fileRefs}+ files` };
  }

  const indexStats = getIndexStats(cwd);
  if (indexStats && indexStats.fileCount > 100 && indexStats.symbolCount > 500) {
    const hasCrossCodebase = CROSS_CODEBASE_KEYWORDS.some((kw) => lower.includes(kw));
    if (hasCrossCodebase) {
      return {
        tier: "complex",
        reason: `Cross-codebase request in large workspace (${indexStats.fileCount} files, ${indexStats.symbolCount} symbols)`,
      };
    }
  }

  if (indexStats && indexStats.fileCount < 10 && indexStats.symbolCount < 50) {
    if (lower.length > 150) {
      return { tier: "standard", reason: `Small workspace (${indexStats.fileCount} files) — context fits easily` };
    }
  }

  if (lower.length > 150) {
    const actionSignals = [
      "add", "create", "build", "implement", "set up", "configure",
      "connect", "endpoint", "api", "ui", "component", "feature",
      "provider", "service", "manager", "generate", "should",
    ];
    const hits = actionSignals.filter((s) => lower.includes(s)).length;
    if (hits >= 4) {
      return { tier: "complex", reason: `Multi-signal: ${hits} action concepts` };
    }
  }

  return { tier: "standard", reason: "Default tier" };
}

// ── Model Pattern Matching ──────────────────────────────────

const QUICK_MODEL_PATTERNS = ["flash", "4o-mini", "haiku", "lite", "instant"];
const COMPLEX_MODEL_PATTERNS = ["opus", "o1-pro", "o3-pro", "5.3-codex", "5-codex", "gpt-5"];
const EXCLUDED_MODEL_PATTERNS = ["codex-mini", "embedding", "tts", "whisper", "dall-e", "moderation"];

// ── Router Config ───────────────────────────────────────────

interface RouterConfig {
  enabled: boolean;
  autoSwitch?: boolean;
  tierModels?: {
    quick?: { provider: string; id: string };
    standard?: { provider: string; id: string };
    complex?: { provider: string; id: string };
  };
}

function loadRouterConfig(cwd: string): RouterConfig {
  const configPath = path.join(cwd, ".tide", "router-config.json");
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch { /* ignore */ }
  return { enabled: true, autoSwitch: true };
}

// ── Session-Based Routing State ─────────────────────────────
// Router only switches model on the FIRST message of a new chat.
// Subsequent messages reuse the routed model. Manual override via
// ModelPicker still works independently.

interface RouterState {
  sessionId: string;
  routedModel: { provider: string; id: string };
  tier: Tier;
}

// In-memory state — reset on Pi restart (new extension instance)
let currentRouterState: RouterState | null = null;

// ── Extension ───────────────────────────────────────────────

export default function tideRouter(pi: ExtensionAPI) {
  log("Extension registered (first-message routing + classification)");

  pi.on("before_agent_start", async (event, ctx) => {
    const config = loadRouterConfig(ctx.cwd);
    if (!config.enabled) {
      log("Router disabled by config");
      return;
    }

    const prompt = event.prompt || "";
    if (!prompt.trim()) {
      log("Empty prompt, skipping routing");
      return;
    }

    const { tier, reason } = classifyPrompt(prompt, ctx.cwd);
    log(`Classified as ${tier}: ${reason}`);

    if (!config.autoSwitch) {
      log(`Auto-switch disabled, using current model (tier: ${tier})`);
      return;
    }

    // ── First-message-only check ──────────────────────────
    // Detect session identity from ctx or fall back to model check.
    // Pi extensions get a fresh instance per Pi restart, so in-memory
    // state naturally resets on new session / workspace switch.
    const sessionId = (ctx as any).sessionFile || (ctx as any).sessionId || "";

    if (currentRouterState) {
      // Same session — skip routing, keep current model
      if (sessionId && currentRouterState.sessionId === sessionId) {
        log(`Skip: already routed this session (${currentRouterState.tier} → ${currentRouterState.routedModel.provider}/${currentRouterState.routedModel.id})`);
        return;
      }
      // No session ID available — check if model matches what we routed
      if (!sessionId) {
        const current = ctx.model;
        if (current && current.provider === currentRouterState.routedModel.provider
            && current.id === currentRouterState.routedModel.id) {
          log(`Skip: already on routed model ${current.provider}/${current.id}`);
          return;
        }
        log(`No sessionId, model mismatch (current: ${current?.provider}/${current?.id}, routed: ${currentRouterState.routedModel.provider}/${currentRouterState.routedModel.id})`);
      }
    }

    // ── Find target model ─────────────────────────────────
    const available = ctx.modelRegistry.getAvailable();
    log(`Model registry: ${available.length} available models`);
    const chatModels = available.filter((m) => {
      const lower = m.id.toLowerCase();
      return !EXCLUDED_MODEL_PATTERNS.some((p) => lower.includes(p));
    });

    if (chatModels.length === 0) {
      log("No available chat models, skipping routing");
      return;
    }
    log(`Chat models: ${chatModels.map(m => `${m.provider}/${m.id}`).join(", ")}`);

    // Check for explicit tier→model mapping
    const explicitMapping = config.tierModels?.[tier];
    let target = explicitMapping
      ? ctx.modelRegistry.find(explicitMapping.provider, explicitMapping.id)
      : undefined;

    // Auto-resolve if no explicit mapping
    if (!target) {
      const quick = chatModels.filter((m) =>
        QUICK_MODEL_PATTERNS.some((p) => m.id.toLowerCase().includes(p)),
      );
      const complex = chatModels.filter((m) =>
        COMPLEX_MODEL_PATTERNS.some((p) => m.id.toLowerCase().includes(p)),
      );
      const standard = chatModels.filter((m) => {
        const lower = m.id.toLowerCase();
        return !QUICK_MODEL_PATTERNS.some((p) => lower.includes(p))
          && !COMPLEX_MODEL_PATTERNS.some((p) => lower.includes(p));
      });

      if (tier === "quick") target = quick[0] || standard[0] || chatModels[0];
      else if (tier === "complex") target = complex[0] || standard[0] || chatModels[0];
      else target = standard[0] || chatModels[0];
    }

    if (!target) {
      log("No target model found for tier " + tier);
      return;
    }

    // Don't switch if already on the target model
    const current = ctx.model;
    if (current && current.provider === target.provider && current.id === target.id) {
      log(`Already on ${target.provider}/${target.id}, skipping switch`);
      // Still record the routing state so we don't re-evaluate
      currentRouterState = { sessionId, routedModel: { provider: target.provider, id: target.id }, tier };
      return;
    }

    // ── Switch model ──────────────────────────────────────
    const currentModel = ctx.model;
    log(`Switching: ${currentModel?.provider}/${currentModel?.id} → ${target.provider}/${target.id} (tier: ${tier})`);
    try {
      const success = await pi.setModel(target);
      if (success) {
        log(`✓ Switched to ${target.provider}/${target.id} for ${tier} tier`);
        currentRouterState = { sessionId, routedModel: { provider: target.provider, id: target.id }, tier };
      } else {
        log(`✗ Failed to switch to ${target.provider}/${target.id} (setModel returned false — no API key?)`);
      }
    } catch (err) {
      log(`✗ Error switching model: ${err}`);
    }
  });
}
