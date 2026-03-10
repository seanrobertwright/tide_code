import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as path from "node:path";
import * as fs from "node:fs";

// We read from .tide/index.db using better-sqlite3 if available,
// otherwise fall back to a simple JSON cache approach.
let Database: any;
try {
  Database = require("better-sqlite3");
} catch {
  // better-sqlite3 not available — tools will return helpful error
  Database = null;
}

// ── Cached DB connection ────────────────────────────────────
// Avoids opening/closing SQLite on every tool call. Reuses the
// connection (and its page cache) for the lifetime of the session.
let cachedDb: any = null;
let cachedDbPath: string | null = null;

function closeDb() {
  if (cachedDb) {
    try { cachedDb.close(); } catch { /* ignore */ }
    cachedDb = null;
    cachedDbPath = null;
  }
}

function resolveDbPath(cwd: string): string | null {
  const dbPath = path.join(cwd, ".tide", "index.db");
  if (fs.existsSync(dbPath)) return dbPath;

  // Search parent directories
  let dir = cwd;
  for (let i = 0; i < 5; i++) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
    const parentDbPath = path.join(dir, ".tide", "index.db");
    if (fs.existsSync(parentDbPath)) {
      process.stderr.write(`[tide:index] DB not at ${dbPath}, found at ${parentDbPath}\n`);
      return parentDbPath;
    }
  }
  return null;
}

function getDb(cwd: string) {
  if (!Database) return null;

  const resolvedPath = resolveDbPath(cwd);
  if (!resolvedPath) return null;

  // Return cached connection if path matches
  if (cachedDb && cachedDbPath === resolvedPath) return cachedDb;

  // Close stale connection if path changed
  closeDb();

  try {
    cachedDb = new Database(resolvedPath, { readonly: true });
    cachedDb.pragma("journal_mode = WAL");
    cachedDbPath = resolvedPath;
    return cachedDb;
  } catch {
    return null;
  }
}

function truncateOutput(text: string, maxLen = 50000): string {
  return text.length > maxLen
    ? text.slice(0, maxLen) + "\n\n[Truncated at 50KB]"
    : text;
}

function getRepoId(db: any, cwd: string): number | null {
  // Try exact match first
  let row = db.prepare("SELECT id FROM repos WHERE root_path = ?").get(cwd);
  if (row) return (row as any).id;
  // Fallback: try without trailing slash, or with it
  const trimmed = cwd.endsWith("/") ? cwd.slice(0, -1) : cwd;
  row = db.prepare("SELECT id FROM repos WHERE root_path = ? OR root_path = ?").get(trimmed, trimmed + "/");
  if (row) return (row as any).id;
  // Last resort: if only one repo exists, use it
  row = db.prepare("SELECT id FROM repos LIMIT 2").all();
  if (Array.isArray(row) && row.length === 1) return (row[0] as any).id;
  return null;
}

export default function tideIndex(pi: ExtensionAPI) {
  process.stderr.write(`[tide:index] Extension loaded, Database available: ${!!Database}\n`);

  // Close cached DB connection when session ends
  pi.on("session_shutdown", async () => { closeDb(); });

  // Tool: Get file tree with symbol counts
  pi.registerTool({
    name: "tide_index_file_tree",
    label: "File Tree",
    description:
      "Get the workspace file tree with symbol counts per file. Use this to understand project structure before diving into specific files. Much cheaper than listing and reading files individually.",
    promptSnippet: "Get file tree with symbol counts per file",
    parameters: Type.Object({
      subdir: Type.Optional(
        Type.String({ description: "Subdirectory to scope the tree to" }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (signal?.aborted) return { content: [{ type: "text" as const, text: "Cancelled" }], isError: true };
      const db = getDb(ctx.cwd);
      if (!db) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Code index not available. The workspace may not have been indexed yet.",
            },
          ],
          isError: true,
        };
      }

      const repoId = getRepoId(db, ctx.cwd);
      if (!repoId) {
        return {
          content: [
            { type: "text" as const, text: "Workspace not indexed yet." },
          ],
          isError: true,
        };
      }

      let rows;
      if (params.subdir) {
        rows = db
          .prepare(
            `SELECT f.rel_path, f.language, f.line_count, COUNT(s.id) as sym_count
             FROM files f LEFT JOIN symbols s ON s.file_id = f.id
             WHERE f.repo_id = ? AND f.rel_path LIKE ?
             GROUP BY f.id ORDER BY f.rel_path`,
          )
          .all(repoId, `${params.subdir}%`);
      } else {
        rows = db
          .prepare(
            `SELECT f.rel_path, f.language, f.line_count, COUNT(s.id) as sym_count
             FROM files f LEFT JOIN symbols s ON s.file_id = f.id
             WHERE f.repo_id = ?
             GROUP BY f.id ORDER BY f.rel_path`,
          )
          .all(repoId);
      }

      return {
        content: [
          { type: "text" as const, text: truncateOutput(JSON.stringify(rows, null, 2)) },
        ],
        details: { fileCount: rows.length },
      };
    },
  });

  // Tool: Get file outline (symbols with signatures)
  pi.registerTool({
    name: "tide_index_file_outline",
    label: "File Outline",
    description:
      "Get the outline of a file: all symbols (functions, classes, methods, etc.) with their signatures and line numbers. Much cheaper than reading the full file — use this first to understand a file's API surface.",
    promptSnippet: "Get symbol outline of a file (signatures + line numbers)",
    parameters: Type.Object({
      filePath: Type.String({
        description: "File path relative to workspace root",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (signal?.aborted) return { content: [{ type: "text" as const, text: "Cancelled" }], isError: true };
      const db = getDb(ctx.cwd);
      if (!db) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Code index not available.",
            },
          ],
          isError: true,
        };
      }

      const repoId = getRepoId(db, ctx.cwd);
      if (!repoId) {
        return {
          content: [
            { type: "text" as const, text: "Workspace not indexed yet." },
          ],
          isError: true,
        };
      }

      const rows = db
        .prepare(
          `SELECT s.symbol_id, s.name, s.qualified_name, s.kind,
                  s.start_line, s.end_line, s.signature, s.parent_symbol_id
           FROM symbols s JOIN files f ON s.file_id = f.id
           WHERE f.repo_id = ? AND f.rel_path = ?
           ORDER BY s.start_line`,
        )
        .all(repoId, params.filePath);

      if (rows.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No symbols found for "${params.filePath}". File may not be indexed (unsupported language or not in workspace).`,
            },
          ],
        };
      }

      return {
        content: [
          { type: "text" as const, text: truncateOutput(JSON.stringify(rows, null, 2)) },
        ],
        details: { symbolCount: rows.length },
      };
    },
  });

  // Tool: Get a specific symbol's source code
  pi.registerTool({
    name: "tide_index_get_symbol",
    label: "Get Symbol",
    description:
      "Get the full source code of a specific symbol by its ID. Symbol IDs follow the format: '{file_path}::{qualified_name}#{kind}'. Use tide_index_file_outline first to discover symbol IDs.",
    promptSnippet: "Get source code of a symbol by ID (use file_outline to find IDs)",
    promptGuidelines: [
      "Use tide_index_file_outline first to discover symbol IDs before calling this tool",
    ],
    parameters: Type.Object({
      symbolId: Type.String({
        description:
          "Symbol ID (e.g. 'src/lib.rs::AppState#struct' or 'src/App.tsx::App#function')",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (signal?.aborted) return { content: [{ type: "text" as const, text: "Cancelled" }], isError: true };
      const db = getDb(ctx.cwd);
      if (!db) {
        return {
          content: [
            { type: "text" as const, text: "Code index not available." },
          ],
          isError: true,
        };
      }

      const row = db
        .prepare(
          `SELECT s.symbol_id, s.name, s.qualified_name, s.kind,
                  s.start_line, s.end_line, s.signature, s.docstring,
                  f.rel_path
           FROM symbols s JOIN files f ON s.file_id = f.id
           WHERE s.symbol_id = ?
           LIMIT 1`,
        )
        .get(params.symbolId) as any;

      if (!row) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Symbol not found: "${params.symbolId}"`,
            },
          ],
          isError: true,
        };
      }

      // Read the actual source code for this symbol
      const fullPath = path.join(ctx.cwd, row.rel_path);
      let body = "";
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");
        body = lines
          .slice(row.start_line - 1, row.end_line)
          .join("\n");
      }

      const result = {
        symbolId: row.symbol_id,
        name: row.name,
        qualifiedName: row.qualified_name,
        kind: row.kind,
        startLine: row.start_line,
        endLine: row.end_line,
        signature: row.signature,
        docstring: row.docstring,
        filePath: row.rel_path,
        body,
      };

      return {
        content: [
          { type: "text" as const, text: truncateOutput(JSON.stringify(result, null, 2)) },
        ],
        details: { lines: row.end_line - row.start_line + 1 },
      };
    },
  });

  // Tool: Search symbols
  pi.registerTool({
    name: "tide_index_search",
    label: "Symbol Search",
    description:
      "Search for symbols across the workspace by name. Returns matching functions, classes, methods, etc. with their file locations and signatures. Supports fuzzy matching.",
    promptSnippet: "Search symbols by name across the codebase (fuzzy match)",
    parameters: Type.Object({
      query: Type.String({ description: "Search query (fuzzy name match)" }),
      kind: Type.Optional(
        Type.String({
          description:
            "Filter by kind: function, class, method, struct, trait, interface, enum, constant, type",
        }),
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default 20)" }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (signal?.aborted) return { content: [{ type: "text" as const, text: "Cancelled" }], isError: true };
      const db = getDb(ctx.cwd);
      if (!db) {
        return {
          content: [
            { type: "text" as const, text: "Code index not available." },
          ],
          isError: true,
        };
      }

      const repoId = getRepoId(db, ctx.cwd);
      if (!repoId) {
        return {
          content: [
            { type: "text" as const, text: "Workspace not indexed yet." },
          ],
          isError: true,
        };
      }

      const limit = params.limit || 20;
      const ftsQuery = `${params.query.replace(/"/g, "")}*`;

      let rows;
      if (params.kind) {
        rows = db
          .prepare(
            `SELECT s.symbol_id, s.name, s.qualified_name, s.kind,
                    s.start_line, s.end_line, s.signature, f.rel_path
             FROM symbols s
             JOIN files f ON s.file_id = f.id
             JOIN symbols_fts fts ON fts.rowid = s.id
             WHERE f.repo_id = ? AND fts.symbols_fts MATCH ? AND s.kind = ?
             ORDER BY rank LIMIT ?`,
          )
          .all(repoId, ftsQuery, params.kind, limit);
      } else {
        rows = db
          .prepare(
            `SELECT s.symbol_id, s.name, s.qualified_name, s.kind,
                    s.start_line, s.end_line, s.signature, f.rel_path
             FROM symbols s
             JOIN files f ON s.file_id = f.id
             JOIN symbols_fts fts ON fts.rowid = s.id
             WHERE f.repo_id = ? AND fts.symbols_fts MATCH ?
             ORDER BY rank LIMIT ?`,
          )
          .all(repoId, ftsQuery, limit);
      }

      return {
        content: [
          { type: "text" as const, text: truncateOutput(JSON.stringify(rows, null, 2)) },
        ],
        details: { matchCount: rows.length },
      };
    },
  });

  // Tool: Repo outline
  pi.registerTool({
    name: "tide_index_repo_outline",
    label: "Repo Outline",
    description:
      "Get a high-level overview of the entire repository: total file counts, symbol counts per file. Useful for understanding project scope before starting work.",
    promptSnippet: "Get high-level repo overview (file counts, symbol counts)",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
      if (signal?.aborted) return { content: [{ type: "text" as const, text: "Cancelled" }], isError: true };
      const db = getDb(ctx.cwd);
      if (!db) {
        return {
          content: [
            { type: "text" as const, text: "Code index not available." },
          ],
          isError: true,
        };
      }

      const repoId = getRepoId(db, ctx.cwd);
      if (!repoId) {
        return {
          content: [
            { type: "text" as const, text: "Workspace not indexed yet." },
          ],
          isError: true,
        };
      }

      const repo = db
        .prepare("SELECT root_path, file_count, symbol_count FROM repos WHERE id = ?")
        .get(repoId) as any;

      const files = db
        .prepare(
          `SELECT f.rel_path, f.language, f.line_count, COUNT(s.id) as sym_count
           FROM files f LEFT JOIN symbols s ON s.file_id = f.id
           WHERE f.repo_id = ?
           GROUP BY f.id ORDER BY f.rel_path`,
        )
        .all(repoId);

      const result = {
        root: repo.root_path,
        totalFiles: repo.file_count,
        totalSymbols: repo.symbol_count,
        files,
      };

      return {
        content: [
          { type: "text" as const, text: truncateOutput(JSON.stringify(result, null, 2)) },
        ],
        details: {
          fileCount: repo.file_count,
          symbolCount: repo.symbol_count,
        },
      };
    },
  });
}
