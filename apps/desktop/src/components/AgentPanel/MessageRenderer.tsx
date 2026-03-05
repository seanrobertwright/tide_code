import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { openFileByPath } from "../../lib/fileHelpers";

const FILE_EXTENSIONS = /\.(tsx?|jsx?|rs|json|md|css|html|py|go|toml|yaml|yml|sh|sql|lock|cfg|ini|env|xml|svg)$/;
function isFilePath(text: string): boolean {
  if (FILE_EXTENSIONS.test(text)) return true;
  if (/^(src|apps|\.\.?)\//i.test(text)) return true;
  return false;
}

function FileLink({ children, text }: { children: React.ReactNode; text: string }) {
  const [hovered, setHovered] = useState(false);
  const handleClick = useCallback(() => openFileByPath(text), [text]);
  return (
    <code
      style={{ ...s.inlineCode, ...s.fileLink, ...(hovered ? s.fileLinkHover : {}) }}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`Open ${text}`}
    >
      {children}
    </code>
  );
}

interface MessageRendererProps {
  content: string;
}

export function MessageRenderer({ content }: MessageRendererProps) {
  return (
    <div style={s.container}>
      <ReactMarkdown
        components={{
          // Code blocks with syntax class
          code({ className, children, ...props }) {
            const isBlock = className?.startsWith("language-");
            if (isBlock) {
              return (
                <div style={s.codeBlock}>
                  <div style={s.codeHeader}>
                    {className?.replace("language-", "") || "code"}
                  </div>
                  <pre style={s.pre}>
                    <code {...props}>{children}</code>
                  </pre>
                </div>
              );
            }
            // Check if inline code looks like a file path
            const text = String(children).trim();
            if (isFilePath(text)) {
              return <FileLink text={text}>{children}</FileLink>;
            }
            return <code style={s.inlineCode} {...props}>{children}</code>;
          },
          // Block-level pre (wraps code blocks from markdown)
          pre({ children }) {
            return <>{children}</>;
          },
          p({ children }) {
            return <p style={s.paragraph}>{children}</p>;
          },
          h1({ children }) {
            return <h1 style={s.heading}>{children}</h1>;
          },
          h2({ children }) {
            return <h2 style={s.heading}>{children}</h2>;
          },
          h3({ children }) {
            return <h3 style={s.heading}>{children}</h3>;
          },
          ul({ children }) {
            return <ul style={s.list}>{children}</ul>;
          },
          ol({ children }) {
            return <ol style={s.list}>{children}</ol>;
          },
          li({ children }) {
            return <li style={s.listItem}>{children}</li>;
          },
          a({ href, children }) {
            return (
              <a style={s.link} href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
          blockquote({ children }) {
            return <blockquote style={s.blockquote}>{children}</blockquote>;
          },
          hr() {
            return <hr style={s.hr} />;
          },
          strong({ children }) {
            return <strong style={s.strong}>{children}</strong>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-sm)",
    lineHeight: 1.6,
    color: "var(--text-primary)",
    wordBreak: "break-word",
  },
  paragraph: {
    margin: "0 0 8px 0",
  },
  heading: {
    margin: "16px 0 8px 0",
    color: "var(--text-bright)",
    fontWeight: 600,
  },
  codeBlock: {
    margin: "8px 0",
    borderRadius: "var(--radius-sm)",
    overflow: "hidden",
    border: "1px solid var(--border)",
  },
  codeHeader: {
    padding: "4px 12px",
    fontSize: "var(--font-size-xs)",
    fontFamily: "var(--font-mono)",
    color: "var(--text-secondary)",
    background: "var(--bg-tertiary)",
    borderBottom: "1px solid var(--border)",
  },
  pre: {
    margin: 0,
    padding: 12,
    fontFamily: "var(--font-mono)",
    fontSize: "var(--font-size-xs)",
    lineHeight: 1.5,
    background: "var(--bg-primary)",
    overflowX: "auto",
    whiteSpace: "pre",
  },
  inlineCode: {
    padding: "1px 4px",
    fontFamily: "var(--font-mono)",
    fontSize: "0.9em",
    color: "var(--accent)",
    background: "var(--bg-tertiary)",
    borderRadius: 3,
  },
  list: {
    margin: "4px 0 8px 0",
    paddingLeft: 20,
  },
  listItem: {
    margin: "2px 0",
  },
  link: {
    color: "var(--accent)",
    textDecoration: "none",
  },
  blockquote: {
    margin: "8px 0",
    paddingLeft: 12,
    borderLeft: "3px solid var(--border)",
    color: "var(--text-secondary)",
  },
  hr: {
    border: "none",
    borderTop: "1px solid var(--border)",
    margin: "12px 0",
  },
  strong: {
    color: "var(--text-bright)",
    fontWeight: 600,
  },
  fileLink: {
    cursor: "pointer",
    textDecoration: "underline",
    textDecorationColor: "var(--accent)",
    textDecorationThickness: 1,
    textUnderlineOffset: 2,
  },
  fileLinkHover: {
    background: "rgba(96, 165, 250, 0.2)",
  },
};
