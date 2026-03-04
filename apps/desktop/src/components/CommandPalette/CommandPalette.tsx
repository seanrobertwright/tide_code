import { useEffect, useRef, useState } from "react";
import { useCommandStore } from "../../stores/commandStore";
import styles from "./CommandPalette.module.css";

export function CommandPalette() {
  const { isOpen, query, setQuery, close, filtered } = useCommandStore();
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = filtered();

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.children[activeIndex] as HTMLElement;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (results[activeIndex]) {
          close();
          results[activeIndex].execute();
        }
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
    }
  };

  return (
    <div style={s.overlay} onClick={close}>
      <div style={s.palette} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <input
          ref={inputRef}
          style={s.input}
          type="text"
          placeholder="Type a command..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div ref={listRef} style={s.list}>
          {results.length === 0 ? (
            <div className={styles.empty}>No matching commands</div>
          ) : (
            results.map((cmd, i) => (
              <div
                key={cmd.id}
                className={`${styles.item} ${i === activeIndex ? styles.itemActive : ""}`}
                onClick={() => {
                  close();
                  cmd.execute();
                }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span className={styles.category}>{cmd.category}</span>
                <span className={styles.label}>{cmd.label}</span>
                {cmd.shortcut && <span className={styles.shortcut}>{cmd.shortcut}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.5)",
    zIndex: 1000,
    display: "flex",
    justifyContent: "center",
    paddingTop: 80,
  },
  palette: {
    width: 520,
    maxHeight: 400,
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  input: {
    padding: "10px 14px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-md)",
    color: "var(--text-primary)",
    background: "var(--bg-input)",
    border: "none",
    borderBottom: "1px solid var(--border)",
    outline: "none",
  },
  list: {
    overflowY: "auto",
    padding: 4,
  },
};
