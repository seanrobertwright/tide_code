import { useState } from "react";
import { useApprovalStore, type ClarifyQuestion } from "../../stores/approvalStore";

// ── Component ───────────────────────────────────────────────

export function ClarifyCard({ questions }: { questions: ClarifyQuestion[] }) {
  const respondClarify = useApprovalStore((s) => s.respondClarify);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState<Record<string, string>>({});
  const [showFreeText, setShowFreeText] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  const allAnswered = questions.every((q) => answers[q.id]);

  const selectOption = (qId: string, value: string) => {
    if (submitted) return;
    setShowFreeText((prev) => ({ ...prev, [qId]: false }));
    setAnswers((prev) => ({ ...prev, [qId]: value }));
  };

  const toggleFreeText = (qId: string) => {
    if (submitted) return;
    setShowFreeText((prev) => ({ ...prev, [qId]: !prev[qId] }));
    // Clear the selected option when switching to free text
    if (!showFreeText[qId]) {
      setAnswers((prev) => {
        const next = { ...prev };
        delete next[qId];
        return next;
      });
    }
  };

  const updateFreeText = (qId: string, text: string) => {
    setFreeText((prev) => ({ ...prev, [qId]: text }));
    if (text.trim()) {
      setAnswers((prev) => ({ ...prev, [qId]: text.trim() }));
    } else {
      setAnswers((prev) => {
        const next = { ...prev };
        delete next[qId];
        return next;
      });
    }
  };

  const handleSubmit = () => {
    if (!allAnswered || submitted) return;
    setSubmitted(true);
    respondClarify(answers);
  };

  return (
    <div style={s.card}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.headerIcon}>◇</span>
        <span style={s.headerText}>
          {submitted ? "Answers submitted" : "Before I plan, a few questions:"}
        </span>
      </div>

      {/* Questions */}
      <div style={s.questions}>
        {questions.map((q, i) => {
          const selected = answers[q.id];
          const isFreeTextActive = showFreeText[q.id];

          return (
            <div key={q.id} style={s.questionBlock}>
              <div style={s.questionRow}>
                <span style={s.questionNumber}>{i + 1}.</span>
                <span style={s.questionText}>{q.question}</span>
              </div>

              <div style={s.optionsRow}>
                {q.options.map((opt) => {
                  const isSelected = selected === opt.value && !isFreeTextActive;
                  return (
                    <button
                      key={opt.value}
                      style={{
                        ...s.optionPill,
                        ...(isSelected ? s.optionPillSelected : {}),
                        ...(submitted ? s.optionPillDisabled : {}),
                      }}
                      onClick={() => selectOption(q.id, opt.value)}
                      disabled={submitted}
                      title={opt.description || opt.label}
                    >
                      {opt.label}
                    </button>
                  );
                })}

                {(q.allowFreeText !== false) && (
                  <button
                    style={{
                      ...s.optionPill,
                      ...s.freeTextToggle,
                      ...(isFreeTextActive ? s.optionPillSelected : {}),
                      ...(submitted ? s.optionPillDisabled : {}),
                    }}
                    onClick={() => toggleFreeText(q.id)}
                    disabled={submitted}
                  >
                    Type your own...
                  </button>
                )}
              </div>

              {isFreeTextActive && !submitted && (
                <input
                  style={s.freeTextInput}
                  type="text"
                  placeholder="Enter your answer..."
                  value={freeText[q.id] || ""}
                  onChange={(e) => updateFreeText(q.id, e.target.value)}
                  autoFocus
                />
              )}

              {/* Show selected answer in submitted state */}
              {submitted && selected && (
                <div style={s.answeredLabel}>
                  {selected}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit */}
      {!submitted && (
        <div style={s.footer}>
          <button
            style={{
              ...s.submitBtn,
              ...(allAnswered ? {} : s.submitBtnDisabled),
            }}
            onClick={handleSubmit}
            disabled={!allAnswered}
          >
            Submit Answers
          </button>
          {!allAnswered && (
            <span style={s.footerHint}>
              {questions.length - Object.keys(answers).length} remaining
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  card: {
    margin: "8px 0",
    padding: "12px 14px",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderLeft: "2px solid var(--accent)",
    borderRadius: "var(--radius-md)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  headerIcon: {
    fontSize: 13,
    color: "var(--accent)",
    lineHeight: 1,
  },
  headerText: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  questions: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  questionBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  questionRow: {
    display: "flex",
    gap: 6,
    alignItems: "baseline",
  },
  questionNumber: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    flexShrink: 0,
    lineHeight: 1.5,
  },
  questionText: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    color: "var(--text-bright)",
    lineHeight: 1.4,
  },
  optionsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    paddingLeft: 16,
  },
  optionPill: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "3px 10px",
    cursor: "pointer",
    transition: "all 0.12s ease",
    whiteSpace: "nowrap" as const,
    lineHeight: 1.5,
  },
  optionPillSelected: {
    background: "rgba(122, 162, 247, 0.15)",
    borderColor: "var(--accent)",
    color: "var(--accent)",
    fontWeight: 500,
  },
  optionPillDisabled: {
    cursor: "default",
    opacity: 0.5,
  },
  freeTextToggle: {
    fontStyle: "italic",
    color: "var(--text-secondary)",
    borderStyle: "dashed",
  },
  freeTextInput: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-bright)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "5px 8px",
    marginLeft: 16,
    outline: "none",
    width: "calc(100% - 16px)",
    boxSizing: "border-box" as const,
  },
  answeredLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--accent)",
    paddingLeft: 16,
    opacity: 0.8,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingTop: 2,
  },
  submitBtn: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    fontWeight: 600,
    color: "var(--bg-primary)",
    background: "var(--accent)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    padding: "5px 14px",
    cursor: "pointer",
    transition: "opacity 0.12s ease",
  },
  submitBtnDisabled: {
    opacity: 0.35,
    cursor: "default",
  },
  footerHint: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--text-secondary)",
    opacity: 0.6,
  },
};
