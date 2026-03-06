import { useEffect, useState } from "react";
import { usePlanStore, type Plan, type PlanStep } from "../../stores/planStore";
import { useWorkspaceStore } from "../../stores/workspace";
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

const PLAN_STATUS_DOT: Record<Plan["status"], string> = {
  planning: "var(--accent)",
  in_progress: "var(--warning, #fb923c)",
  completed: "var(--success, #4ade80)",
  failed: "var(--error, #f87171)",
};

// ── Helpers ─────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function stepProgress(plan: Plan): string {
  const done = plan.steps.filter(
    (s) => s.status === "completed" || s.status === "skipped",
  ).length;
  return `${done}/${plan.steps.length}`;
}

// ── Component ───────────────────────────────────────────────

export function PlanTab() {
  const activePlan = usePlanStore((s) => s.activePlan);
  const plans = usePlanStore((s) => s.plans);
  const loading = usePlanStore((s) => s.loading);
  const loadPlans = usePlanStore((s) => s.loadPlans);
  const deletePlan = usePlanStore((s) => s.deletePlan);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [confirmDeleteSlug, setConfirmDeleteSlug] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  // Resolve selected plan: explicit selection > active plan
  const plan =
    plans.find((p) => p.id === selectedPlanId) || activePlan;

  const handlePlanClick = (p: Plan) => {
    setSelectedPlanId(p.id === selectedPlanId ? null : p.id);
    if (rootPath && p.slug) {
      openFileByPath(`${rootPath}/.tide/plans/${p.slug}.json`);
    }
  };

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

  const completedSteps =
    plan?.steps.filter(
      (st) => st.status === "completed" || st.status === "skipped",
    ).length ?? 0;
  const totalSteps = plan?.steps.length ?? 0;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  // Sort plans: most recent first
  const sortedPlans = [...plans].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div style={s.container}>
      {/* Plan List — always visible at top */}
      {sortedPlans.length > 0 && (
        <div style={s.planList}>
          <div style={s.planListHeader}>
            <span style={s.planListLabel}>Plans</span>
            {loading && <span style={s.loadingDot}>loading...</span>}
          </div>
          <div style={s.planListItems}>
            {sortedPlans.map((p) => {
              const isSelected = plan?.id === p.id;
              const isConfirming = confirmDeleteSlug === p.slug;
              return (
                <div key={p.id} style={{ position: "relative" }}>
                  {isConfirming && (
                    <div style={s.confirmOverlay}>
                      <span style={s.confirmText}>Delete this plan?</span>
                      <button
                        style={s.confirmYes}
                        onClick={() => {
                          deletePlan(p.slug);
                          setConfirmDeleteSlug(null);
                          if (selectedPlanId === p.id) setSelectedPlanId(null);
                        }}
                      >
                        Delete
                      </button>
                      <button
                        style={s.confirmNo}
                        onClick={() => setConfirmDeleteSlug(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  <button
                    style={{
                      ...s.planRow,
                      ...(isSelected ? s.planRowActive : {}),
                    }}
                    onClick={() => handlePlanClick(p)}
                  >
                    <span
                      style={{
                        ...s.statusDot,
                        backgroundColor: PLAN_STATUS_DOT[p.status],
                      }}
                    />
                    <span style={s.planRowTitle}>{p.title}</span>
                    <span style={s.planRowProgress}>{stepProgress(p)}</span>
                    <span style={s.planRowDate}>
                      {relativeTime(p.createdAt)}
                    </span>
                    <span
                      style={s.deleteBtn}
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteSlug(p.slug);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      &times;
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Divider */}
      {plan && sortedPlans.length > 0 && <div style={s.divider} />}

      {/* Plan Detail */}
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

  // ── Plan List ──────────────────────────────────────────
  planList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  planListHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 4,
  },
  planListLabel: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  loadingDot: {
    fontFamily: "var(--font-ui)",
    fontSize: 10,
    color: "var(--text-secondary)",
    opacity: 0.6,
  },
  planListItems: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    maxHeight: 200,
    overflow: "auto",
  },
  planRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "6px 8px",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "background 0.1s",
  },
  planRowActive: {
    background: "var(--bg-tertiary)",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    flexShrink: 0,
  },
  planRowTitle: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  planRowProgress: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--text-secondary)",
    flexShrink: 0,
  },
  planRowDate: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--text-secondary)",
    opacity: 0.7,
    flexShrink: 0,
  },
  deleteBtn: {
    fontFamily: "var(--font-ui)",
    fontSize: 14,
    color: "var(--text-secondary)",
    opacity: 0.3,
    cursor: "pointer",
    padding: "0 2px",
    lineHeight: 1,
    flexShrink: 0,
  },
  confirmOverlay: {
    position: "absolute" as const,
    inset: 0,
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: "var(--bg-tertiary)",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
  },
  confirmText: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    fontWeight: 500,
  },
  confirmYes: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 500,
    color: "#fff",
    background: "var(--error, #f87171)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    padding: "2px 8px",
    cursor: "pointer",
  },
  confirmNo: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 500,
    color: "var(--text-secondary)",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "2px 8px",
    cursor: "pointer",
  },

  // ── Divider ────────────────────────────────────────────
  divider: {
    height: 1,
    backgroundColor: "var(--border)",
  },

  // ── Plan Detail ────────────────────────────────────────
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
};
