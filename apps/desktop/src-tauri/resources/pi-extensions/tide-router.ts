import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { classifyPrompt, type Tier } from "./tide-classify.js";

// Re-export for any extensions that imported from here
export { classifyPrompt, type Tier };

// ── Logging ─────────────────────────────────────────────────

function log(msg: string) {
  process.stderr.write(`[tide:router] ${msg}\n`);
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

interface RouterState {
  sessionId: string;
  routedModel: { provider: string; id: string };
  tier: Tier;
}

let currentRouterState: RouterState | null = null;

function routerStatePath(cwd: string): string {
  return path.join(cwd, ".tide", "router-state.json");
}

function persistRouterState(cwd: string, state: RouterState): void {
  try {
    const dir = path.join(cwd, ".tide");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(routerStatePath(cwd), JSON.stringify(state), "utf-8");
  } catch (err) {
    log(`Failed to persist router state: ${err}`);
  }
}

function loadPersistedRouterState(cwd: string): RouterState | null {
  try {
    const p = routerStatePath(cwd);
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
  } catch { /* ignore corrupt state */ }
  return null;
}

// ── Extension ───────────────────────────────────────────────

export default function tideRouter(pi: ExtensionAPI) {
  log("Extension registered (first-message routing + classification)");

  // Restore persisted state on session start (survives Pi restarts)
  pi.on("session_start", async (_event, ctx) => {
    if (!currentRouterState) {
      currentRouterState = loadPersistedRouterState(ctx.cwd);
      if (currentRouterState) {
        log(`Restored persisted router state: ${currentRouterState.tier} → ${currentRouterState.routedModel.provider}/${currentRouterState.routedModel.id}`);
      }
    }
  });

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

    // Skip routing for orchestrated prompts — the orchestrator manages model selection.
    // The [tide:orchestrated] marker is prepended by the Rust orchestrator.
    if (prompt.trimStart().startsWith("[tide:orchestrated]")) {
      log("Orchestrated prompt detected, skipping routing");
      return;
    }

    const { tier, reason } = classifyPrompt(prompt, ctx.cwd);
    log(`Classified as ${tier}: ${reason}`);

    if (!config.autoSwitch) {
      log(`Auto-switch disabled, using current model (tier: ${tier})`);
      return;
    }

    // ── First-message-only check ──────────────────────────
    const sessionId = (ctx as any).sessionFile || (ctx as any).sessionId || "";

    if (currentRouterState) {
      if (sessionId && currentRouterState.sessionId === sessionId) {
        log(`Skip: already routed this session (${currentRouterState.tier} → ${currentRouterState.routedModel.provider}/${currentRouterState.routedModel.id})`);
        return;
      }
      if (!sessionId) {
        const current = ctx.model;
        if (current && current.provider === currentRouterState.routedModel.provider
            && current.id === currentRouterState.routedModel.id) {
          log(`Skip: already on routed model ${current.provider}/${current.id}`);
          return;
        }
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
      currentRouterState = { sessionId, routedModel: { provider: target.provider, id: target.id }, tier };
      persistRouterState(ctx.cwd, currentRouterState);
      return;
    }

    // ── Switch model with fallback chain ──────────────────
    const currentModel = ctx.model;
    log(`Switching: ${currentModel?.provider}/${currentModel?.id} → ${target.provider}/${target.id} (tier: ${tier})`);
    const success = await trySetModel(pi, target);
    if (success) {
      log(`✓ Switched to ${target.provider}/${target.id} for ${tier} tier`);
      currentRouterState = { sessionId, routedModel: { provider: target.provider, id: target.id }, tier };
      persistRouterState(ctx.cwd, currentRouterState);
    } else {
      // Fallback chain: try other tiers' models
      log(`✗ Failed to switch to ${target.provider}/${target.id}, trying fallback chain...`);
      const fallbackModels = chatModels.filter(
        (m) => m.provider !== target!.provider || m.id !== target!.id
      );

      let fallbackSuccess = false;
      for (const fallback of fallbackModels) {
        log(`Trying fallback: ${fallback.provider}/${fallback.id}`);
        if (await trySetModel(pi, fallback)) {
          log(`✓ Fallback succeeded: ${fallback.provider}/${fallback.id}`);
          currentRouterState = { sessionId, routedModel: { provider: fallback.provider, id: fallback.id }, tier };
          persistRouterState(ctx.cwd, currentRouterState);
          fallbackSuccess = true;
          break;
        }
      }

      if (!fallbackSuccess) {
        log(`✗ All fallbacks failed, staying on current model`);
        if (current) {
          currentRouterState = { sessionId, routedModel: { provider: current.provider, id: current.id }, tier };
          persistRouterState(ctx.cwd, currentRouterState);
        }
      }
    }
  });
}

async function trySetModel(pi: ExtensionAPI, model: { provider: string; id: string }): Promise<boolean> {
  try {
    return await pi.setModel(model);
  } catch (err) {
    log(`Error switching to ${model.provider}/${model.id}: ${err}`);
    return false;
  }
}
