export function SkillsPlaceholder() {
  return (
    <div>
      <h3 style={s.heading}>Skills</h3>
      <p style={s.text}>
        Installed skills and their management will be available here.
        View, enable/disable, and trust workspace-local skills.
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
