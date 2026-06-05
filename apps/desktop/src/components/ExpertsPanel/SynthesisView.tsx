import React, { useState } from "react";
import { useExpertsStore } from "../../stores/expertsStore";

// ── Helpers ────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Component ──────────────────────────────────────────────

export function SynthesisView({ onExecute }: { onExecute?: () => Promise<void> }) {
  const activeSession = useExpertsStore((s) => s.activeSession);
  const timeLimitReached = useExpertsStore((s) => s.timeLimitReached);
  const phase = useExpertsStore((s) => s.phase);
  const [executing, setExecuting] = useState(false);

  if (!activeSession?.synthesis) {
    return (
      <div style={s.empty}>
        <span style={s.emptyText}>
          {phase === "synthesis"
            ? "Synthesizing results..."
            : "No synthesis available yet"}
        </span>
      </div>
    );
  }

  const { synthesis, usage } = activeSession;

  const handleExecute = async () => {
    if (!onExecute) return;
    setExecuting(true);
    try {
      await onExecute();
    } catch (err) {
      console.error("[experts] Failed to execute via orchestrator:", err);
    } finally {
      setExecuting(false);
    }
  };

  const handleRerun = () => {
    // Re-running would require calling the backend start again.
    // For now this is a placeholder — the parent ExpertsTab handles start.
    console.log("[experts] Re-run requested for session:", activeSession.id);
  };

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <h4 style={s.title}>Synthesis</h4>
        {timeLimitReached && (
          <span style={s.timeLimitBadge}>Time limit reached</span>
        )}
        {synthesis.isFallback && (
          <span
            style={s.fallbackBadge}
            title="The leader did not emit an explicit [SYNTHESIS] marker. This is its last message and may be incomplete."
          >
            Unverified
          </span>
        )}
      </div>

      {/* Judge info */}
      <div style={s.judgeLine}>
        <span style={s.judgeLabel}>Judge:</span>
        <span style={s.judgeValue}>{synthesis.judge}</span>
        <span style={s.judgeTimestamp}>
          {new Date(synthesis.timestamp).toLocaleString()}
        </span>
      </div>

      {/* Synthesis content */}
      <div style={s.content}>
        {synthesis.raw.split("\n").map((line, i) => {
          // Basic markdown-ish rendering: headers, bold, bullets
          if (line.startsWith("# ")) {
            return (
              <h3 key={i} style={s.mdH1}>
                {line.slice(2)}
              </h3>
            );
          }
          if (line.startsWith("## ")) {
            return (
              <h4 key={i} style={s.mdH2}>
                {line.slice(3)}
              </h4>
            );
          }
          if (line.startsWith("### ")) {
            return (
              <h5 key={i} style={s.mdH3}>
                {line.slice(4)}
              </h5>
            );
          }
          if (line.startsWith("- ") || line.startsWith("* ")) {
            return (
              <div key={i} style={s.mdBullet}>
                <span style={s.bulletDot}>{"\u2022"}</span>
                <span>{line.slice(2)}</span>
              </div>
            );
          }
          if (line.trim() === "") {
            return <div key={i} style={{ height: 8 }} />;
          }
          return (
            <p key={i} style={s.mdParagraph}>
              {line}
            </p>
          );
        })}
      </div>

      {/* Token usage */}
      <div style={s.usageRow}>
        <span style={s.usageItem}>
          <span style={s.usageLabel}>Input:</span>
          <span style={s.usageValue}>{formatTokens(usage.inputTokens)}</span>
        </span>
        <span style={s.usageItem}>
          <span style={s.usageLabel}>Output:</span>
          <span style={s.usageValue}>{formatTokens(usage.outputTokens)}</span>
        </span>
        <span style={s.usageItem}>
          <span style={s.usageLabel}>Total:</span>
          <span style={s.usageValue}>
            {formatTokens(usage.inputTokens + usage.outputTokens)}
          </span>
        </span>
      </div>

      {/* Actions */}
      <div style={s.actions}>
        <button
          style={{
            ...s.actionBtn,
            ...s.primaryBtn,
            opacity: executing ? 0.6 : 1,
          }}
          onClick={handleExecute}
          disabled={executing}
        >
          {executing ? "Executing..." : "Execute via Orchestrator"}
        </button>
        <button style={{ ...s.actionBtn, ...s.secondaryBtn }} onClick={handleRerun}>
          Re-run
        </button>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "8px 0",
  },
  empty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    opacity: 0.5,
  },
  emptyText: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-secondary)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    fontWeight: 600,
    color: "var(--text-bright)",
    margin: 0,
  },
  timeLimitBadge: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--warning)",
    backgroundColor: "rgba(224, 175, 104, 0.15)",
    padding: "1px 6px",
    borderRadius: "var(--radius-sm)",
    fontWeight: 500,
  },
  fallbackBadge: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--error, #e06c75)",
    backgroundColor: "rgba(224, 108, 117, 0.15)",
    padding: "1px 6px",
    borderRadius: "var(--radius-sm)",
    fontWeight: 500,
    cursor: "help",
  },
  judgeLine: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  judgeLabel: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
  },
  judgeValue: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--accent)",
  },
  judgeTimestamp: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--text-secondary)",
    opacity: 0.6,
    marginLeft: "auto",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "8px 12px",
    backgroundColor: "var(--bg-secondary)",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border, rgba(86, 95, 137, 0.2))",
    maxHeight: 400,
    overflowY: "auto",
  },
  mdH1: {
    fontFamily: "var(--font-ui)",
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-bright)",
    margin: "8px 0 4px",
  },
  mdH2: {
    fontFamily: "var(--font-ui)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-bright)",
    margin: "6px 0 2px",
  },
  mdH3: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: "4px 0 2px",
  },
  mdBullet: {
    display: "flex",
    gap: 6,
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    lineHeight: 1.5,
    paddingLeft: 4,
  },
  bulletDot: {
    color: "var(--accent)",
    flexShrink: 0,
  },
  mdParagraph: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    lineHeight: 1.5,
    margin: 0,
  },
  usageRow: {
    display: "flex",
    gap: 16,
    padding: "4px 0",
  },
  usageItem: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  usageLabel: {
    fontFamily: "var(--font-ui)",
    fontSize: 10,
    color: "var(--text-secondary)",
  },
  usageValue: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--text-primary)",
    fontWeight: 500,
  },
  actions: {
    display: "flex",
    gap: 8,
  },
  actionBtn: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 500,
    padding: "5px 12px",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    border: "none",
    transition: "opacity 0.15s",
  },
  primaryBtn: {
    color: "#fff",
    backgroundColor: "var(--accent)",
  },
  secondaryBtn: {
    color: "var(--text-primary)",
    backgroundColor: "var(--bg-tertiary)",
    border: "1px solid var(--border, rgba(86, 95, 137, 0.3))",
  },
};
