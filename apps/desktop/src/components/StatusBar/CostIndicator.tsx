import { useEffect, useState, useRef } from "react";
import { useStreamStore } from "../../stores/stream";
import { useIndexStore } from "../../stores/indexStore";
import { getSessionStats } from "../../lib/ipc";

// ── Pricing (per million tokens) ────────────────────────────

const MODEL_PRICING: Record<string, { input: number; output: number; label: string }> = {
  "claude-opus-4-20250514": { input: 15, output: 75, label: "Opus 4" },
  "claude-sonnet-4-20250514": { input: 3, output: 15, label: "Sonnet 4" },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4, label: "Haiku 4.5" },
  "gemini-2.0-flash": { input: 0.075, output: 0.3, label: "Gemini Flash" },
  "gemini-2.5-pro": { input: 1.25, output: 10, label: "Gemini Pro" },
};

// ── Helpers ─────────────────────────────────────────────────

const formatCost = (c: number) => {
  if (c < 0.01) return `$${c.toFixed(4)}`;
  if (c < 1) return `$${c.toFixed(3)}`;
  return `$${c.toFixed(2)}`;
};

const formatTokens = (t: number) => {
  if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(1)}M`;
  if (t >= 1_000) return `${(t / 1_000).toFixed(1)}k`;
  return String(t);
};

// ── Component ───────────────────────────────────────────────

export function CostIndicator() {
  const sessionStats = useStreamStore((s) => s.sessionStats);
  const agentActive = useStreamStore((s) => s.agentActive);
  const modelId = useStreamStore((s) => s.modelId);
  const { indexed, symbolCount } = useIndexStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Refresh stats after each agent turn completes
  useEffect(() => {
    if (!agentActive) {
      getSessionStats().catch(() => {});
    }
  }, [agentActive]);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const cost = sessionStats.totalCost;
  const tokens = sessionStats.totalTokens;

  // Don't show until we have data
  if (!cost && !tokens) return null;

  const inputTokens = sessionStats.inputTokens ?? 0;
  const outputTokens = sessionStats.outputTokens ?? 0;
  const cacheRead = sessionStats.cacheReadTokens ?? 0;
  const cacheWrite = sessionStats.cacheWriteTokens ?? 0;
  const pricing = MODEL_PRICING[modelId || ""] || null;

  // Build tooltip
  const tooltipLines = [
    `Total: ${tokens ?? 0} tokens`,
    `Input: ${formatTokens(inputTokens)} | Output: ${formatTokens(outputTokens)}`,
  ];
  if (cacheRead > 0 || cacheWrite > 0) {
    tooltipLines.push(`Cache: ${formatTokens(cacheRead)} read / ${formatTokens(cacheWrite)} write`);
  }
  if (cost) tooltipLines.push(`Cost: ${formatCost(cost)}`);
  if (pricing) tooltipLines.push(`Model rate: $${pricing.input}/$${pricing.output} per 1M tok`);

  return (
    <div ref={ref} style={s.container}>
      <button
        style={s.button}
        onClick={() => setOpen(!open)}
        title={tooltipLines.join("\n")}
      >
        {tokens != null && tokens > 0 && (
          <span style={s.tokens}>{formatTokens(tokens)} tok</span>
        )}
        {cost != null && cost > 0 && (
          <span style={s.cost}>{formatCost(cost)}</span>
        )}
      </button>

      {open && (
        <div style={s.popover}>
          <div style={s.popoverTitle}>Session Cost Breakdown</div>

          <div style={s.row}>
            <span style={s.rowLabel}>Input tokens</span>
            <span style={s.rowValue}>{formatTokens(inputTokens)}</span>
          </div>
          <div style={s.row}>
            <span style={s.rowLabel}>Output tokens</span>
            <span style={s.rowValue}>{formatTokens(outputTokens)}</span>
          </div>
          {(cacheRead > 0 || cacheWrite > 0) && (
            <>
              <div style={s.row}>
                <span style={s.rowLabel}>Cache read</span>
                <span style={s.rowValue}>{formatTokens(cacheRead)}</span>
              </div>
              <div style={s.row}>
                <span style={s.rowLabel}>Cache write</span>
                <span style={s.rowValue}>{formatTokens(cacheWrite)}</span>
              </div>
            </>
          )}
          <div style={{ ...s.row, borderTop: "1px solid var(--border)", paddingTop: 6, marginTop: 4 }}>
            <span style={{ ...s.rowLabel, fontWeight: 600 }}>Total cost</span>
            <span style={{ ...s.rowValue, color: "var(--accent)", fontWeight: 600 }}>
              {cost ? formatCost(cost) : "N/A"}
            </span>
          </div>

          {pricing && (
            <div style={s.pricingNote}>
              {pricing.label}: ${pricing.input}/${pricing.output} per 1M tokens (in/out)
            </div>
          )}

          {indexed && symbolCount > 0 && (
            <div style={s.pricingNote}>
              Code index active ({symbolCount.toLocaleString()} symbols) — symbol-level retrieval reduces navigation tokens by ~95%
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    position: "relative",
  },
  button: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "0 4px",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    borderRadius: "var(--radius-sm)",
  },
  tokens: {
    color: "var(--text-secondary)",
  },
  cost: {
    color: "var(--accent)",
    fontWeight: 500,
  },
  popover: {
    position: "absolute",
    bottom: 24,
    right: 0,
    minWidth: 220,
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    padding: 10,
    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
    zIndex: 200,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  popoverTitle: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 600,
    color: "var(--text-primary)",
    marginBottom: 4,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLabel: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
  },
  rowValue: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
  },
  pricingNote: {
    fontFamily: "var(--font-ui)",
    fontSize: 10,
    color: "var(--text-secondary)",
    marginTop: 6,
    borderTop: "1px solid var(--border)",
    paddingTop: 6,
    opacity: 0.7,
  },
};
