import { useEffect, useState } from "react";
import { usePlanStore, type Plan, type PlanStep } from "../../stores/planStore";
import { openFileByPath } from "../../lib/fileHelpers";

// ── Status Icons ────────────────────────────────────────────

const STATUS_ICONS: Record<PlanStep["status"], string> = {
  pending: "○",
  in_progress: "◑",
  completed: "●",
  skipped: "⊘",
};

const STATUS_COLORS: Record<PlanStep["status"], string> = {
  pending: "var(--text-secondary)",
  in_progress: "var(--warning, #fb923c)",
  completed: "var(--success, #4ade80)",
  skipped: "var(--text-secondary)",
};

const PLAN_STATUS_COLORS: Record<Plan["status"], string> = {
  planning: "var(--accent)",
  in_progress: "var(--warning, #fb923c)",
  completed: "var(--success, #4ade80)",
  failed: "var(--error, #f87171)",
};

// ── Component ───────────────────────────────────────────────

export function PlanTab() {
  const activePlan = usePlanStore((s) => s.activePlan);
  const plans = usePlanStore((s) => s.plans);
  const loading = usePlanStore((s) => s.loading);
  const loadPlans = usePlanStore((s) => s.loadPlans);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const plan = selectedPlan || activePlan;

  if (!plan && plans.length === 0) {
    return (
      <div style={s.container}>
        <div style={s.empty}>
          <p style={s.emptyTitle}>No active plan</p>
          <p style={s.emptyText}>
            Complex tasks will automatically generate structured plans.
            Plans break work into trackable steps.
          </p>
        </div>
      </div>
    );
  }

  const completedSteps = plan?.steps.filter(
    (st) => st.status === "completed" || st.status === "skipped",
  ).length ?? 0;
  const totalSteps = plan?.steps.length ?? 0;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return (
    <div style={s.container}>
      {/* Plan Header */}
      {plan && (
        <>
          <div style={s.header}>
            <div style={s.headerTop}>
              <h3 style={s.title}>{plan.title}</h3>
              <span
                style={{
                  ...s.statusBadge,
                  color: PLAN_STATUS_COLORS[plan.status],
                  borderColor: PLAN_STATUS_COLORS[plan.status],
                }}
              >
                {plan.status}
              </span>
            </div>
            {plan.description && (
              <p style={s.description}>{plan.description}</p>
            )}
          </div>

          {/* Progress Bar */}
          <div style={s.progressContainer}>
            <div style={s.progressBar}>
              <div
                style={{
                  ...s.progressFill,
                  width: `${progress}%`,
                  backgroundColor:
                    progress === 100
                      ? "var(--success, #4ade80)"
                      : "var(--accent)",
                }}
              />
            </div>
            <span style={s.progressLabel}>
              {completedSteps}/{totalSteps} steps
            </span>
          </div>

          {/* Steps */}
          <div style={s.steps}>
            {plan.steps.map((step) => (
              <StepItem key={step.id} step={step} />
            ))}
          </div>
        </>
      )}

      {/* History Toggle */}
      {plans.length > 0 && (
        <div style={s.historySection}>
          <button
            style={s.historyToggle}
            onClick={() => {
              if (!showHistory) loadPlans();
              setShowHistory(!showHistory);
            }}
          >
            {showHistory ? "▾" : "▸"} History ({plans.length})
          </button>

          {showHistory && (
            <div style={s.historyList}>
              {loading && <p style={s.loadingText}>Loading...</p>}
              {plans.map((p) => (
                <button
                  key={p.id}
                  style={{
                    ...s.historyItem,
                    ...(plan?.id === p.id ? s.historyItemActive : {}),
                  }}
                  onClick={() => setSelectedPlan(p.id === plan?.id ? null : p)}
                >
                  <span style={s.historyTitle}>{p.title}</span>
                  <span
                    style={{
                      ...s.historyStatus,
                      color: PLAN_STATUS_COLORS[p.status],
                    }}
                  >
                    {p.status}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step Item ───────────────────────────────────────────────

function StepItem({ step }: { step: PlanStep }) {
  const [expanded, setExpanded] = useState(step.status === "in_progress");

  return (
    <div style={s.step}>
      <button style={s.stepHeader} onClick={() => setExpanded(!expanded)}>
        <span style={{ color: STATUS_COLORS[step.status], marginRight: 6 }}>
          {STATUS_ICONS[step.status]}
        </span>
        <span
          style={{
            ...s.stepTitle,
            ...(step.status === "completed" ? s.stepTitleDone : {}),
          }}
        >
          {step.title}
        </span>
      </button>

      {expanded && (
        <div style={s.stepBody}>
          <p style={s.stepDesc}>{step.description}</p>
          {step.files && step.files.length > 0 && (
            <div style={s.stepFiles}>
              {step.files.map((f) => (
                <button
                  key={f}
                  style={s.fileChip}
                  onClick={() => openFileByPath(f)}
                  title={`Open ${f}`}
                >
                  {f}
                </button>
              ))}
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
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "auto",
    padding: "12px 16px",
    gap: 12,
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 8,
    opacity: 0.6,
  },
  emptyTitle: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-md)",
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: 0,
  },
  emptyText: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-secondary)",
    textAlign: "center",
    maxWidth: 280,
    margin: 0,
    lineHeight: 1.5,
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  headerTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-md)",
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: 0,
  },
  statusBadge: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 500,
    padding: "1px 6px",
    border: "1px solid",
    borderRadius: "var(--radius-sm)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    flexShrink: 0,
  },
  description: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-secondary)",
    margin: 0,
    lineHeight: 1.4,
  },
  progressContainer: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: "var(--bg-tertiary)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    transition: "width 0.3s ease",
  },
  progressLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    flexShrink: 0,
  },
  steps: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  step: {
    borderRadius: "var(--radius-sm)",
  },
  stepHeader: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    padding: "6px 8px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    textAlign: "left" as const,
    borderRadius: "var(--radius-sm)",
  },
  stepTitle: {
    flex: 1,
  },
  stepTitleDone: {
    textDecoration: "line-through",
    opacity: 0.6,
  },
  stepBody: {
    padding: "4px 8px 8px 28px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  stepDesc: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    margin: 0,
    lineHeight: 1.4,
  },
  stepFiles: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
  },
  fileChip: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--accent)",
    backgroundColor: "rgba(96, 165, 250, 0.1)",
    padding: "1px 6px",
    borderRadius: "var(--radius-sm)",
    border: "none",
    cursor: "pointer",
    textAlign: "left" as const,
  },
  historySection: {
    borderTop: "1px solid var(--border)",
    paddingTop: 8,
    marginTop: "auto",
  },
  historyToggle: {
    background: "transparent",
    border: "none",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    padding: "4px 0",
  },
  historyList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    marginTop: 4,
  },
  historyItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "4px 8px",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    textAlign: "left" as const,
  },
  historyItemActive: {
    background: "var(--bg-tertiary)",
  },
  historyTitle: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
  },
  historyStatus: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 500,
  },
  loadingText: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    margin: 0,
    padding: "4px 8px",
  },
};
