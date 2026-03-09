import { useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";

export function OrchestratorSettings() {
  const config = useSettingsStore((s) => s.orchestratorConfig);
  const update = useSettingsStore((s) => s.updateOrchestratorConfig);

  // Local state for the QA commands text area (newline-separated)
  const [qaText, setQaText] = useState(config.qaCommands.join("\n"));

  const handleQaBlur = () => {
    const cmds = qaText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    update({ qaCommands: cmds });
  };

  return (
    <div>
      <h3 style={s.heading}>Orchestration</h3>
      <p style={s.desc}>
        Configure how the orchestrator runs multi-step plans: review strategy,
        QA gates, clarification timeouts, and model locking.
      </p>

      {/* Review Mode */}
      <div style={s.field}>
        <label style={s.label}>Review context strategy</label>
        <p style={s.hint}>
          <strong>Fresh session</strong> (default): review starts with clean context — no
          bias from build phase, but must re-read all files.{" "}
          <strong>Compact</strong>: compresses the build session — faster review,
          but may carry forward assumptions.
        </p>
        <select
          style={s.select}
          value={config.reviewMode}
          onChange={(e) =>
            update({ reviewMode: e.target.value as "fresh_session" | "compact" })
          }
        >
          <option value="fresh_session">Fresh session (default)</option>
          <option value="compact">Compact existing session</option>
        </select>
      </div>

      {/* Max Review Iterations */}
      <div style={s.field}>
        <label style={s.label}>Max review iterations</label>
        <p style={s.hint}>
          How many review→fix cycles before the orchestrator stops. Higher values
          allow more thorough QA but cost more tokens.
        </p>
        <input
          type="number"
          min={1}
          max={10}
          style={s.input}
          value={config.maxReviewIterations}
          onChange={(e) =>
            update({ maxReviewIterations: Math.max(1, Math.min(10, Number(e.target.value))) })
          }
        />
      </div>

      {/* QA Commands */}
      <div style={s.field}>
        <label style={s.label}>QA commands</label>
        <p style={s.hint}>
          Shell commands the reviewer must run during QA (one per line). If any
          command fails, the reviewer creates fix steps automatically. Leave
          empty for subjective-only review.
        </p>
        <textarea
          style={s.textarea}
          rows={4}
          placeholder={"npm run build\nnpm test\nnpm run lint"}
          value={qaText}
          onChange={(e) => setQaText(e.target.value)}
          onBlur={handleQaBlur}
        />
      </div>

      {/* Clarify Timeout */}
      <div style={s.field}>
        <label style={s.label}>Clarify timeout (seconds)</label>
        <p style={s.hint}>
          How long the orchestrator waits for you to answer clarifying questions
          before proceeding with best judgment. Set to 0 to wait indefinitely.
        </p>
        <input
          type="number"
          min={0}
          max={600}
          step={10}
          style={s.input}
          value={config.clarifyTimeoutSecs}
          onChange={(e) =>
            update({ clarifyTimeoutSecs: Math.max(0, Math.min(600, Number(e.target.value))) })
          }
        />
      </div>

      {/* Lock Model */}
      <div style={s.field}>
        <label style={s.toggleRow}>
          <input
            type="checkbox"
            checked={config.lockModelDuringOrchestration}
            onChange={(e) =>
              update({ lockModelDuringOrchestration: e.target.checked })
            }
            style={s.checkbox}
          />
          <span>Lock model during orchestration</span>
        </label>
        <p style={s.hint}>
          When enabled, the router won't re-classify and switch models for
          orchestrated steps (plan, build, review). The model selected at the
          start is used throughout. Disable to allow per-step model optimization.
        </p>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: {
    margin: "0 0 8px",
    fontSize: "var(--font-size-md)",
    fontWeight: 600,
    color: "var(--text-bright)",
  },
  desc: {
    margin: "0 0 16px",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    display: "block",
    fontSize: "var(--font-size-sm)",
    fontWeight: 600,
    color: "var(--text-bright)",
    marginBottom: 4,
  },
  hint: {
    margin: "0 0 6px",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    lineHeight: 1.4,
  },
  select: {
    width: "100%",
    padding: "6px 8px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  input: {
    width: 80,
    padding: "5px 8px",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
  },
  textarea: {
    width: "100%",
    padding: "6px 8px",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    resize: "vertical" as const,
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: "var(--font-size-sm)",
    color: "var(--text-bright)",
    cursor: "pointer",
    fontWeight: 600,
  },
  checkbox: {
    accentColor: "var(--accent)",
  },
};
