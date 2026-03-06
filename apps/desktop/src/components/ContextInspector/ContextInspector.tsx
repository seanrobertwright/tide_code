import { useEffect, useState, useMemo } from "react";
import { useContextStore } from "../../stores/contextStore";
import { useRegionTagStore } from "../../stores/regionTagStore";
import { useStreamStore } from "../../stores/stream";
import { compactContext, newSession } from "../../lib/ipc";
import type { RegionTag } from "@tide/shared";

type FilterType = "all" | "pinned" | "unpinned";

export function ContextInspector() {
  const { inspectorOpen, closeInspector, breakdown } = useContextStore();
  const { tags, loadAllTags, togglePin, deleteTag } = useRegionTagStore();
  const isCompacting = useStreamStore((s) => s.isCompacting);
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [confirmingNewSession, setConfirmingNewSession] = useState(false);

  useEffect(() => {
    if (inspectorOpen) {
      loadAllTags();
    } else {
      setConfirmingNewSession(false);
    }
  }, [inspectorOpen, loadAllTags]);

  const allTags = useMemo(() => Array.from(tags.values()), [tags]);

  const filteredTags = useMemo(() => {
    let items = allTags;
    if (filter === "pinned") items = items.filter((t) => t.pinned);
    if (filter === "unpinned") items = items.filter((t) => !t.pinned);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (t) =>
          t.label.toLowerCase().includes(q) ||
          t.filePath.toLowerCase().includes(q) ||
          (t.note && t.note.toLowerCase().includes(q)),
      );
    }
    return items;
  }, [allTags, filter, search]);

  const pinnedCount = useMemo(() => allTags.filter((t) => t.pinned).length, [allTags]);

  useEffect(() => {
    if (!inspectorOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeInspector();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [inspectorOpen, closeInspector]);

  if (!inspectorOpen) return null;

  return (
    <div style={s.overlay} onClick={closeInspector}>
      <div style={s.panel} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.title}>Context Inspector</span>
          <button style={s.closeBtn} onClick={closeInspector} type="button">
            &times;
          </button>
        </div>

        {/* Summary */}
        <div style={s.summary}>
          <span>{allTags.length} tag{allTags.length !== 1 ? "s" : ""}{pinnedCount > 0 ? ` (${pinnedCount} pinned)` : ""}</span>
          {breakdown && (
            <span style={{ color: breakdown.usagePercent > 0.85 ? "var(--error)" : "var(--text-secondary)" }}>
              {breakdown.totalTokens.toLocaleString()} / {breakdown.budgetTokens.toLocaleString()} tokens ({Math.round(breakdown.usagePercent * 100)}%)
            </span>
          )}
        </div>

        {/* Info */}
        <div style={s.info}>
          Select text in the editor and press <strong>Cmd+Shift+T</strong> to tag a code region.
          Pin a tag to auto-inject it into the agent's system prompt.
        </div>

        {/* Action bar */}
        <div style={s.actionBar}>
          <button
            style={{
              ...s.actionBtn,
              opacity: isCompacting ? 0.6 : 1,
              cursor: isCompacting ? "not-allowed" : "pointer",
            }}
            onClick={async () => {
              if (isCompacting) return;
              useStreamStore.setState({ isCompacting: true });
              try {
                await compactContext();
              } catch (err) {
                console.error("[ContextInspector] Compact failed:", err);
                useStreamStore.setState({ isCompacting: false });
              }
            }}
            disabled={isCompacting}
            type="button"
            title="Summarize older messages to reduce token usage"
          >
            <span style={{ color: "var(--accent)" }}>{isCompacting ? "\u23F3" : "\u21BB"}</span>
            {isCompacting ? " Compacting\u2026" : " Compact"}
          </button>

          {confirmingNewSession ? (
            <div style={s.confirmGroup}>
              <span style={s.confirmText}>Clear all messages?</span>
              <button
                style={s.confirmBtn}
                onClick={async () => {
                  await newSession();
                  setConfirmingNewSession(false);
                  closeInspector();
                }}
                type="button"
              >
                Confirm
              </button>
              <button
                style={s.cancelBtn}
                onClick={() => setConfirmingNewSession(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              style={{ ...s.actionBtn, color: "var(--warning, #e8a838)" }}
              onClick={() => setConfirmingNewSession(true)}
              type="button"
              title="Start a fresh session (clears all context)"
            >
              <span>{"\u2715"}</span> New Session
            </button>
          )}
        </div>

        {/* Filters — only show when there are tags */}
        {allTags.length > 0 && (
          <div style={s.filters}>
            <input
              style={s.searchInput}
              type="text"
              placeholder="Search tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {pinnedCount > 0 && (
              <select
                style={s.filterSelect}
                value={filter}
                onChange={(e) => setFilter(e.target.value as FilterType)}
              >
                <option value="all">All ({allTags.length})</option>
                <option value="pinned">Pinned ({pinnedCount})</option>
                <option value="unpinned">Unpinned ({allTags.length - pinnedCount})</option>
              </select>
            )}
          </div>
        )}

        {/* Tag list */}
        <div style={s.itemList}>
          {filteredTags.length === 0 ? (
            <div style={s.emptyState}>
              {allTags.length === 0
                ? "No tags yet. Select text in the editor and press Cmd+Shift+T to create one."
                : "No matching tags"}
            </div>
          ) : (
            filteredTags.map((tag) => (
              <TagRow
                key={tag.id}
                tag={tag}
                onTogglePin={() => togglePin(tag.id)}
                onDelete={() => deleteTag(tag.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TagRow({
  tag,
  onTogglePin,
  onDelete,
}: {
  tag: RegionTag;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={s.tagRow}>
      <button
        style={{ ...s.pinBtn, color: tag.pinned ? "var(--accent)" : "var(--text-secondary)" }}
        onClick={onTogglePin}
        title={tag.pinned ? "Unpin from context" : "Pin to context"}
        type="button"
      >
        {tag.pinned ? "\u{1F4CC}" : "\u25CB"}
      </button>
      <div style={s.tagInfo}>
        <div style={s.tagLabel}>{tag.label}</div>
        <div style={s.tagMeta}>
          {tag.filePath}:{tag.startLine}-{tag.endLine}
          {tag.note && <span style={s.tagNote}> &mdash; {tag.note}</span>}
        </div>
      </div>
      <button
        style={s.deleteBtn}
        onClick={onDelete}
        title="Delete tag"
        type="button"
      >
        &times;
      </button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    zIndex: 500,
    display: "flex",
    justifyContent: "flex-end",
  },
  panel: {
    width: 420,
    maxWidth: "80vw",
    height: "100%",
    background: "var(--bg-secondary)",
    borderLeft: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: 36,
    padding: "0 12px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  title: {
    fontSize: "var(--font-size-sm)",
    fontWeight: 600,
    color: "var(--text-bright)",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontSize: 16,
    fontFamily: "var(--font-mono)",
    padding: "2px 6px",
  },
  summary: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 12px",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  info: {
    padding: "8px 12px",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    lineHeight: 1.4,
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  actionBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 12px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
    gap: 8,
  },
  actionBtn: {
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "6px 12px",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    fontFamily: "var(--font-ui)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 4,
    whiteSpace: "nowrap" as const,
    position: "relative" as const,
    zIndex: 10,
  },
  confirmGroup: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  confirmText: {
    fontSize: "var(--font-size-xs)",
    color: "var(--warning, #e8a838)",
  },
  confirmBtn: {
    background: "var(--warning, #e8a838)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    padding: "3px 8px",
    fontSize: "var(--font-size-xs)",
    color: "#000",
    fontFamily: "var(--font-ui)",
    fontWeight: 600,
    cursor: "pointer",
  },
  cancelBtn: {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "3px 8px",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    fontFamily: "var(--font-ui)",
    cursor: "pointer",
  },
  filters: {
    display: "flex",
    gap: 6,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "4px 8px",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    outline: "none",
    fontFamily: "var(--font-ui)",
  },
  filterSelect: {
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "4px 6px",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    outline: "none",
    fontFamily: "var(--font-ui)",
  },
  itemList: {
    flex: 1,
    overflow: "auto",
    padding: "4px 0",
  },
  emptyState: {
    padding: 24,
    textAlign: "center" as const,
    color: "var(--text-secondary)",
    fontStyle: "italic",
    fontSize: "var(--font-size-sm)",
    lineHeight: 1.5,
  },
  tagRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderBottom: "1px solid rgba(60,60,60,0.3)",
  },
  pinBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    padding: "2px 4px",
    flexShrink: 0,
  },
  tagInfo: {
    flex: 1,
    minWidth: 0,
  },
  tagLabel: {
    fontSize: "var(--font-size-sm)",
    fontWeight: 600,
    color: "var(--text-bright)",
    fontFamily: "var(--font-mono)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  tagMeta: {
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
    fontFamily: "var(--font-mono)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  tagNote: {
    color: "var(--text-secondary)",
    fontFamily: "var(--font-ui)",
    fontStyle: "italic",
  },
  deleteBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: 16,
    color: "var(--text-secondary)",
    padding: "2px 4px",
    flexShrink: 0,
  },
};
