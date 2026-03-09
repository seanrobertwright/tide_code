import { useToastStore } from "../stores/toastStore";

const levelColors: Record<string, { bg: string; border: string }> = {
  error: { bg: "rgba(248, 113, 113, 0.12)", border: "var(--error, #f87171)" },
  info: { bg: "rgba(122, 162, 247, 0.12)", border: "var(--accent)" },
  success: { bg: "rgba(74, 222, 128, 0.12)", border: "var(--success, #4ade80)" },
};

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div style={s.container}>
      {toasts.map((t) => {
        const colors = levelColors[t.level] ?? levelColors.info;
        return (
          <div
            key={t.id}
            style={{ ...s.toast, background: colors.bg, borderColor: colors.border }}
            onClick={() => dismiss(t.id)}
          >
            {t.message}
          </div>
        );
      })}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    bottom: 32,
    right: 16,
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    maxWidth: 360,
    pointerEvents: "auto",
  },
  toast: {
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid",
    fontFamily: "var(--font-ui)",
    fontSize: 12,
    color: "var(--text-primary)",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
  },
};
