const SHORTCUTS: { category: string; items: { keys: string; description: string }[] }[] = [
  {
    category: "General",
    items: [
      { keys: "Cmd+Shift+P", description: "Command Palette" },
      { keys: "Cmd+O", description: "Open Folder" },
      { keys: "Cmd+B", description: "Toggle File Tree" },
      { keys: "Cmd+,", description: "Open Settings" },
      { keys: "Cmd+T", description: "Toggle Terminal" },
    ],
  },
  {
    category: "Editor",
    items: [
      { keys: "Cmd+S", description: "Save File" },
      { keys: "Cmd+Shift+T", description: "Tag Selected Region (Editor & Terminal)" },
    ],
  },
  {
    category: "Agent Panel",
    items: [
      { keys: "Enter", description: "Send Message" },
      { keys: "Shift+Enter", description: "New Line in Message" },
    ],
  },
  {
    category: "Dialogs",
    items: [
      { keys: "Enter", description: "Approve / Submit" },
      { keys: "Escape", description: "Deny / Cancel / Close" },
      { keys: "Cmd+Enter", description: "Submit Editor Dialog" },
    ],
  },
];

export function KeyboardShortcuts() {
  return (
    <div>
      <h3 style={s.heading}>Keyboard Shortcuts</h3>
      {SHORTCUTS.map((group) => (
        <div key={group.category} style={s.group}>
          <div style={s.category}>{group.category}</div>
          {group.items.map((item) => (
            <div key={item.keys + item.description} style={s.row}>
              <kbd style={s.kbd}>{item.keys}</kbd>
              <span style={s.desc}>{item.description}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: {
    margin: "0 0 16px 0",
    fontSize: "var(--font-size-lg)",
    fontWeight: 600,
    color: "var(--text-bright)",
  },
  group: {
    marginBottom: 16,
  },
  category: {
    fontSize: "var(--font-size-xs)",
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    marginBottom: 6,
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "5px 12px",
    borderBottom: "1px solid var(--border)",
  },
  kbd: {
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-bright)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "2px 8px",
  },
  desc: {
    fontSize: "var(--font-size-sm)",
    color: "var(--text-primary)",
  },
};
