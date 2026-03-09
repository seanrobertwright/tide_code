interface FileIconProps {
  name: string;
  isDir: boolean;
  isOpen?: boolean;
}

const ICON_COLORS: Record<string, string> = {
  ts: "#3178c6",
  tsx: "#3178c6",
  js: "#f7df1e",
  jsx: "#f7df1e",
  rs: "#dea584",
  json: "#cbcb41",
  md: "#519aba",
  css: "#563d7c",
  html: "#e34c26",
  toml: "#9c4221",
  yaml: "#cb171e",
  yml: "#cb171e",
};

function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function FileIcon({ name, isDir, isOpen }: FileIconProps) {
  if (isDir) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d={
            isOpen
              ? "M1.5 3h4.3l1.2 1.5H14.5v8.5h-13V3z"
              : "M1.5 2h4.3l1.2 1.5H14.5v10h-13V2z"
          }
          fill={isOpen ? "#dcb67a" : "#c09553"}
          stroke="none"
        />
      </svg>
    );
  }

  const ext = getExt(name);
  const color = ICON_COLORS[ext] ?? "var(--text-secondary)";

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 1h6.5L13 4.5V14H3V1z"
        fill="var(--bg-tertiary)"
        stroke={color}
        strokeWidth="0.8"
      />
      {ext && (
        <text
          x="8"
          y="11"
          textAnchor="middle"
          fontSize="5"
          fill={color}
          fontFamily="var(--font-ui)"
          fontWeight="600"
        >
          {ext.slice(0, 3).toUpperCase()}
        </text>
      )}
    </svg>
  );
}
