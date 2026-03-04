export function SafetyPlaceholder() {
  return (
    <div>
      <h3 style={s.heading}>Safety Settings</h3>
      <p style={s.text}>
        TIDE.md safety policy management will be available here.
        Configure approval policies, command allowlists, and test commands.
      </p>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: {
    margin: "0 0 8px 0",
    fontSize: "var(--font-size-lg)",
    fontWeight: 600,
    color: "var(--text-bright)",
  },
  text: {
    fontSize: "var(--font-size-sm)",
    color: "var(--text-secondary)",
    fontStyle: "italic",
  },
};
