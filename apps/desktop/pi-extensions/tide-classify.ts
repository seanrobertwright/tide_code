/**
 * Shared task complexity classifier used by both tide-router and tide-planner.
 * Extracted to avoid duplicate keyword lists with divergent logic.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export type Tier = "quick" | "standard" | "complex";

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

const CROSS_CODEBASE_KEYWORDS = [
  "across", "all files", "entire", "everywhere", "whole project",
  "whole codebase", "every file", "global", "throughout",
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

/**
 * Classify a prompt into a complexity tier.
 * Single source of truth — used by both router and planner.
 */
export function classifyPrompt(text: string, cwd: string): { tier: Tier; reason: string } {
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
