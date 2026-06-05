/**
 * Tide Expert Communications Extension
 *
 * Loaded into each expert agent process during brainstorming sessions.
 * Provides P2P messaging tools: send_message, check_messages, broadcast, post_finding.
 * Communication happens via file-based mailboxes in the session directory.
 *
 * Environment variables (set by tide-experts.ts):
 *   TIDE_EXPERTS_SESSION_DIR — path to the session directory
 *   TIDE_EXPERTS_AGENT_NAME  — this agent's name (e.g. "architect")
 *   TIDE_EXPERTS_TEAMMATES   — comma-separated list of teammate names
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const log = (msg: string) => process.stderr.write(`[tide:expert-comms] ${msg}\n`);

interface MailboxMessage {
  id: string;
  from: string;
  to: string;
  type: string;
  content: string;
  references: string[];
  inReplyTo: string | null;
  timestamp: string;
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeMessage(sessionDir: string, targetAgent: string, msg: MailboxMessage): void {
  const inboxDir = path.join(sessionDir, "mailboxes", targetAgent, "inbox");
  ensureDir(inboxDir);
  fs.writeFileSync(
    path.join(inboxDir, `${msg.id}.json`),
    JSON.stringify(msg, null, 2),
  );
}

function getTeammates(sessionDir: string, selfName: string): string[] {
  // From env var (fastest)
  const fromEnv = process.env.TIDE_EXPERTS_TEAMMATES;
  if (fromEnv) return fromEnv.split(",").filter(n => n && n !== selfName);

  // Fallback: scan mailboxes directory
  const mailboxesDir = path.join(sessionDir, "mailboxes");
  if (!fs.existsSync(mailboxesDir)) return [];
  return fs.readdirSync(mailboxesDir).filter(n => {
    const stat = fs.statSync(path.join(mailboxesDir, n));
    return stat.isDirectory() && n !== selfName;
  });
}

export default function tideExpertComms(pi: ExtensionAPI) {
  const sessionDirEnv = process.env.TIDE_EXPERTS_SESSION_DIR;
  const agentNameEnv = process.env.TIDE_EXPERTS_AGENT_NAME;

  if (!sessionDirEnv || !agentNameEnv) {
    log("Missing TIDE_EXPERTS_SESSION_DIR or TIDE_EXPERTS_AGENT_NAME, skipping registration");
    return;
  }

  // Re-bind as non-nullable so closures capture the narrowed type.
  const sessionDir: string = sessionDirEnv;
  const agentName: string = agentNameEnv;

  log(`Registered for agent "${agentName}" in session ${path.basename(sessionDir)}`);

  // Ensure own mailbox exists
  ensureDir(path.join(sessionDir, "mailboxes", agentName, "inbox"));
  ensureDir(path.join(sessionDir, "mailboxes", agentName, "outbox"));

  // Track read message IDs
  const readIdsFile = path.join(sessionDir, "mailboxes", agentName, ".read");

  function getReadIds(): Set<string> {
    try {
      if (fs.existsSync(readIdsFile)) {
        return new Set(fs.readFileSync(readIdsFile, "utf-8").split("\n").filter(Boolean));
      }
    } catch { /* ignore */ }
    return new Set();
  }

  function markAsRead(ids: string[]): void {
    const existing = getReadIds();
    for (const id of ids) existing.add(id);
    fs.writeFileSync(readIdsFile, [...existing].join("\n"));
  }

  function readInbox(unreadOnly: boolean): MailboxMessage[] {
    const inboxDir = path.join(sessionDir, "mailboxes", agentName, "inbox");
    if (!fs.existsSync(inboxDir)) return [];

    const readIds = unreadOnly ? getReadIds() : new Set<string>();
    const files = fs.readdirSync(inboxDir).filter(f => f.endsWith(".json")).sort();
    const messages: MailboxMessage[] = [];

    for (const f of files) {
      try {
        const msg: MailboxMessage = JSON.parse(fs.readFileSync(path.join(inboxDir, f), "utf-8"));
        if (!unreadOnly || !readIds.has(msg.id)) {
          messages.push(msg);
        }
      } catch { /* skip malformed messages */ }
    }

    return messages;
  }

  // ── send_message ─────────────────────────────────────────

  pi.registerTool({
    name: "send_message",
    label: "Send Message",
    description:
      "Send a direct message to another expert on your team. " +
      "Use type 'observation' for sharing findings, 'question' to ask something, " +
      "'response' to reply, 'concern' to raise an issue, 'suggestion' to propose an idea.",
    promptSnippet:
      "send_message sends a direct message to a teammate. Use '*' as the target to broadcast to all. " +
      "Types: observation, question, response, concern, suggestion.",
    parameters: Type.Object({
      to: Type.String({
        description: "Target expert name (e.g. 'security'), or '*' for broadcast to all teammates",
      }),
      type: Type.Union([
        Type.Literal("observation"),
        Type.Literal("question"),
        Type.Literal("response"),
        Type.Literal("concern"),
        Type.Literal("suggestion"),
      ], { description: "Message type" }),
      content: Type.String({ description: "Message content" }),
      inReplyTo: Type.Optional(Type.String({ description: "Message ID being replied to (for threading)" })),
      references: Type.Optional(Type.Array(Type.String(), { description: "File paths or URLs referenced" })),
    }),
    async execute(_id, params) {
      const msg: MailboxMessage = {
        id: generateId(),
        from: agentName,
        to: params.to,
        type: params.type,
        content: params.content,
        references: params.references || [],
        inReplyTo: params.inReplyTo || null,
        timestamp: new Date().toISOString(),
      };

      if (params.to === "*") {
        // Broadcast to all teammates
        const teammates = getTeammates(sessionDir, agentName);
        for (const teammate of teammates) {
          writeMessage(sessionDir, teammate, msg);
        }
        log(`Broadcast from ${agentName} to ${teammates.length} teammates`);
      } else {
        writeMessage(sessionDir, params.to, msg);
        log(`Message from ${agentName} to ${params.to}`);
      }

      // Save to own outbox for history
      const outboxDir = path.join(sessionDir, "mailboxes", agentName, "outbox");
      ensureDir(outboxDir);
      fs.writeFileSync(
        path.join(outboxDir, `${msg.id}.json`),
        JSON.stringify(msg, null, 2),
      );

      const target = params.to === "*" ? "all teammates" : params.to;
      return {
        content: [{ type: "text" as const, text: `Message sent to ${target} (id: ${msg.id})` }],
        details: null,
      };
    },
  });

  // ── check_messages ───────────────────────────────────────

  pi.registerTool({
    name: "check_messages",
    label: "Check Messages",
    description:
      "Check your inbox for messages from other experts. " +
      "Returns unread messages by default. Use this periodically to stay in sync with your team.",
    promptSnippet:
      "check_messages reads your inbox. Call it periodically to see what teammates have shared. " +
      "Set unreadOnly=false to see all messages.",
    parameters: Type.Object({
      unreadOnly: Type.Optional(Type.Boolean({
        description: "Only show unread messages (default: true)",
        default: true,
      })),
    }),
    async execute(_id, params) {
      const unreadOnly = params.unreadOnly !== false;
      const messages = readInbox(unreadOnly);

      if (messages.length === 0) {
        return {
          content: [{ type: "text" as const, text: unreadOnly ? "No new messages." : "Inbox is empty." }],
          details: null,
        };
      }

      // Mark as read
      markAsRead(messages.map(m => m.id));

      const formatted = messages.map(m => {
        const header = `**[${m.type}]** from **${m.from}** (${m.timestamp})`;
        const reply = m.inReplyTo ? `  _replying to ${m.inReplyTo}_` : "";
        const refs = m.references.length > 0 ? `\n  Refs: ${m.references.join(", ")}` : "";
        return `${header}${reply}\n${m.content}${refs}`;
      }).join("\n\n---\n\n");

      return {
        content: [{
          type: "text" as const,
          text: `## ${messages.length} message(s)\n\n${formatted}`,
        }],
        details: null,
      };
    },
  });

  // ── post_finding ─────────────────────────────────────────

  pi.registerTool({
    name: "post_finding",
    label: "Post Finding",
    description:
      "Post a finding to the shared team findings board. " +
      "All experts can see findings. Use this for important discoveries that the whole team should know about.",
    promptSnippet:
      "post_finding adds to the shared findings board visible to all experts and the synthesis judge.",
    parameters: Type.Object({
      content: Type.String({ description: "Finding description" }),
      category: Type.Union([
        Type.Literal("architecture"),
        Type.Literal("security"),
        Type.Literal("performance"),
        Type.Literal("quality"),
        Type.Literal("other"),
      ], { description: "Finding category" }),
      severity: Type.Union([
        Type.Literal("info"),
        Type.Literal("warning"),
        Type.Literal("critical"),
      ], { description: "Severity level" }),
      references: Type.Optional(Type.Array(Type.String(), { description: "File paths or URLs" })),
    }),
    async execute(_id, params) {
      const sharedDir = path.join(sessionDir, "shared");
      ensureDir(sharedDir);

      const findingsPath = path.join(sharedDir, "findings.json");

      // Atomic read-modify-write with retry to handle concurrent access
      let findings: any[] = [];
      const maxRetries = 3;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          if (fs.existsSync(findingsPath)) {
            findings = JSON.parse(fs.readFileSync(findingsPath, "utf-8"));
          }
          break;
        } catch {
          if (attempt < maxRetries - 1) {
            // File may be mid-rename from another agent — brief backoff
            await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
          }
        }
      }

      const finding = {
        id: `finding-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        from: agentName,
        content: params.content,
        category: params.category,
        severity: params.severity,
        references: params.references || [],
        timestamp: new Date().toISOString(),
      };

      findings.push(finding);

      // Atomic write: write to temp file, then rename (prevents partial reads)
      const tmpPath = findingsPath + `.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(findings, null, 2));
      fs.renameSync(tmpPath, findingsPath);

      log(`Finding posted by ${agentName}: [${params.severity}] ${params.category}`);

      return {
        content: [{
          type: "text" as const,
          text: `Finding posted to shared board (id: ${finding.id}, ${params.severity} ${params.category})`,
        }],
        details: null,
      };
    },
  });

  // ── read_findings ────────────────────────────────────────

  pi.registerTool({
    name: "read_findings",
    label: "Read Findings",
    description: "Read all findings posted to the shared team findings board.",
    promptSnippet: "read_findings shows all findings from all experts on the shared board.",
    parameters: Type.Object({
      category: Type.Optional(Type.String({ description: "Filter by category (e.g. 'security')" })),
    }),
    async execute(_id, params) {
      const findingsPath = path.join(sessionDir, "shared", "findings.json");
      if (!fs.existsSync(findingsPath)) {
        return { content: [{ type: "text" as const, text: "No findings yet." }] , details: null };
      }

      let findings: any[];
      try {
        findings = JSON.parse(fs.readFileSync(findingsPath, "utf-8"));
      } catch {
        return { content: [{ type: "text" as const, text: "Error reading findings." }] , details: null };
      }

      if (params.category) {
        findings = findings.filter(f => f.category === params.category);
      }

      if (findings.length === 0) {
        return { content: [{ type: "text" as const, text: "No findings match the filter." }] , details: null };
      }

      const formatted = findings.map(f => {
        const badge = f.severity === "critical" ? "🔴" : f.severity === "warning" ? "🟡" : "🔵";
        const refs = f.references?.length > 0 ? `\n  Refs: ${f.references.join(", ")}` : "";
        return `${badge} **[${f.category}]** by **${f.from}** (${f.timestamp})\n${f.content}${refs}`;
      }).join("\n\n");

      return {
        content: [{
          type: "text" as const,
          text: `## ${findings.length} finding(s)\n\n${formatted}`,
        }],
        details: null,
      };
    },
  });

  // ── Unread message notification on agent start ───────────

  pi.on("before_agent_start", async (event) => {
    const messages = readInbox(true);
    if (messages.length === 0) return {};

    // Append unread message hint to system prompt (correct BeforeAgentStartEventResult API)
    return {
      systemPrompt: (event as any).systemPrompt +
        `\n\n[IMPORTANT: You have ${messages.length} unread message(s) from teammates. Use check_messages to read them before continuing your work.]`,
    };
  });
}
