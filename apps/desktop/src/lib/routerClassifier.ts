// ── Router Classifier (UI-side) ──────────────────────────────
// Heuristic prompt classifier — runs instantly in the frontend.
// Model switching happens via RPC set_model BEFORE sending the prompt.

export type Tier = "quick" | "standard" | "complex";

export interface ModelRef {
  provider: string;
  id: string;
}

export interface ClassifyResult {
  tier: Tier;
  reason: string;
}

// ── Keyword sets ─────────────────────────────────────────────

const COMPLEX_KEYWORDS = [
  // Architecture & restructuring
  "refactor", "architect", "redesign", "migrate",
  "rewrite", "overhaul", "restructure",
  "design system", "build out", "create a full", "entire codebase",
  "end-to-end", "from scratch",
  // New features & planning
  "add a feature", "new feature", "implement a",
  "create ui", "create a ui", "build a ui", "build ui",
  "implement the following plan", "implementation plan",
  "integrate with", "integration",
  "add support for", "full implementation",
  // Multi-step / broad scope
  "multiple files", "across the codebase", "all the",
  "backend and frontend", "frontend and backend",
  "api and ui", "ui and api",
];

const QUICK_KEYWORDS = [
  "fix typo", "rename", "what is", "what does", "explain",
  "one line", "simple", "quick fix", "minor",
  "add a comment", "remove", "delete this", "why does",
  "how does", "what's the", "tell me",
];

// ── Heuristic classifier ────────────────────────────────────

export function classifyPrompt(text: string): ClassifyResult {
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

  // Multi-signal: if the prompt is moderately long and mentions multiple
  // action-oriented concepts, it's likely complex
  if (lower.length > 150) {
    const actionSignals = [
      "add", "create", "build", "implement", "set up", "configure",
      "connect", "endpoint", "api", "ui", "component", "feature",
      "provider", "service", "manager", "generate", "should",
    ];
    const hits = actionSignals.filter((s) => lower.includes(s)).length;
    if (hits >= 4) {
      return { tier: "complex", reason: `Multi-signal: ${hits} action concepts in long prompt` };
    }
  }

  return { tier: "standard", reason: "Default tier" };
}

// ── Model tier hints (substring → tier) ─────────────────────

const QUICK_MODEL_PATTERNS = [
  "flash", "4o-mini", "haiku", "lite", "instant",
  // Note: "nano" and "small" excluded — too weak for coding tasks even at quick tier
];
const COMPLEX_MODEL_PATTERNS = [
  "opus", "o1-pro", "o3-pro", "5.3-codex", "5-codex", "gpt-5",
];
const EXCLUDED_MODEL_PATTERNS = [
  "codex-mini", "embedding", "tts", "whisper", "dall-e", "moderation",
];

export function resolveRouterModels(
  availableModels: Array<{ id: string; provider: string; name?: string }>,
  currentModel?: { id: string; provider: string },
): Record<Tier, ModelRef> | null {
  // Filter out non-chat models
  const chatModels = availableModels.filter((m) => {
    const lower = m.id.toLowerCase();
    return !EXCLUDED_MODEL_PATTERNS.some((p) => lower.includes(p));
  });
  if (chatModels.length === 0) return null;

  const quick: ModelRef[] = [];
  const standard: ModelRef[] = [];
  const complex: ModelRef[] = [];

  for (const m of chatModels) {
    const lower = m.id.toLowerCase();
    if (QUICK_MODEL_PATTERNS.some((p) => lower.includes(p))) {
      quick.push({ provider: m.provider, id: m.id });
    } else if (COMPLEX_MODEL_PATTERNS.some((p) => lower.includes(p))) {
      complex.push({ provider: m.provider, id: m.id });
    } else {
      standard.push({ provider: m.provider, id: m.id });
    }
  }

  const fallback: ModelRef = currentModel
    ? { provider: currentModel.provider, id: currentModel.id }
    : { provider: chatModels[0].provider, id: chatModels[0].id };

  return {
    quick: quick[0] || standard[0] || fallback,
    standard: standard[0] || fallback,
    complex: complex[0] || standard[0] || fallback,
  };
}
