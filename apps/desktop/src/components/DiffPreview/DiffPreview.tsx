import { DiffEditor } from "@monaco-editor/react";

interface DiffPreviewProps {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
}

const EXTENSION_LANGUAGES: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".rs": "rust",
  ".json": "json",
  ".md": "markdown",
  ".html": "html",
  ".css": "css",
  ".py": "python",
  ".go": "go",
  ".sh": "shell",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".sql": "sql",
};

function detectLanguage(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  return EXTENSION_LANGUAGES[ext] ?? "plaintext";
}

function countChanges(original: string, modified: string) {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");
  let additions = 0;
  let deletions = 0;

  // Simple line-count heuristic
  if (modLines.length > origLines.length) {
    additions = modLines.length - origLines.length;
  } else {
    deletions = origLines.length - modLines.length;
  }

  // Count changed lines (min of both lengths)
  const minLen = Math.min(origLines.length, modLines.length);
  for (let i = 0; i < minLen; i++) {
    if (origLines[i] !== modLines[i]) {
      additions++;
      deletions++;
    }
  }

  return { additions, deletions };
}

export function DiffPreview({ filePath, originalContent, modifiedContent }: DiffPreviewProps) {
  const language = detectLanguage(filePath);
  const { additions, deletions } = countChanges(originalContent, modifiedContent);

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.filePath}>{filePath}</span>
        <span style={s.additions}>+{additions}</span>
        <span style={s.deletions}>-{deletions}</span>
      </div>
      <div style={s.editor}>
        <DiffEditor
          original={originalContent}
          modified={modifiedContent}
          language={language}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            renderSideBySide: true,
            wordWrap: "off",
          }}
          height="100%"
        />
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 200,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "6px 12px",
    fontSize: "var(--font-size-sm)",
    background: "var(--bg-tertiary)",
    borderBottom: "1px solid var(--border)",
  },
  filePath: {
    flex: 1,
    fontFamily: "var(--font-mono)",
    color: "var(--text-primary)",
  },
  additions: {
    color: "var(--success)",
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
  },
  deletions: {
    color: "var(--error)",
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
  },
  editor: {
    flex: 1,
    overflow: "hidden",
  },
};
