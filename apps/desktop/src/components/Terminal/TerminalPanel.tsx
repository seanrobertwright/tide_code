import { useCallback, useEffect, useRef, useState } from "react";
import { useTerminalStore } from "../../stores/terminalStore";
import { useWorkspaceStore } from "../../stores/workspace";
import { ptyCreate, ptyKill } from "../../lib/ipc";
import { TerminalInstance } from "./TerminalInstance";
import { TerminalSplitView } from "./TerminalSplitView";
import { showError } from "../../stores/toastStore";
import styles from "./TerminalPanel.module.css";

function TabTitle({ id, title }: { id: string; title: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameTab = useTerminalStore((s) => s.renameTab);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title) renameTab(id, trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={styles.tabRenameInput}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(title); setEditing(false); }
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span onDoubleClick={() => { setDraft(title); setEditing(true); }}>
      {title}
    </span>
  );
}

export function TerminalPanel() {
  const { tabs, activeTabId, activePtyId, addTab, removeTab, setActiveTab, setActivePty, clearAll, addPane, removePane } = useTerminalStore();

  const spawnTerminal = useCallback(async () => {
    const cwd = useWorkspaceStore.getState().rootPath ?? undefined;
    try {
      const ptyId = await ptyCreate(cwd);
      addTab(ptyId);
    } catch (err) {
      console.error("[Terminal] Failed to spawn:", err);
      showError(`Terminal spawn failed: ${err}`);
    }
  }, [addTab]);

  const closeTab = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const tab = useTerminalStore.getState().tabs.find((t) => t.id === id);
      if (tab) {
        await Promise.all(tab.panes.map((pid) => ptyKill(pid).catch(() => {})));
      }
      removeTab(id);
    },
    [removeTab],
  );

  const handleSplit = useCallback(
    async (direction: "horizontal" | "vertical") => {
      if (!activeTabId) return;
      const cwd = useWorkspaceStore.getState().rootPath ?? undefined;
      try {
        const newPtyId = await ptyCreate(cwd);
        addPane(activeTabId, newPtyId, direction);
      } catch (err) {
        console.error("[Terminal] Failed to split:", err);
        showError(`Terminal split failed: ${err}`);
      }
    },
    [activeTabId, addPane],
  );

  // On mount: clear stale tabs, spawn fresh terminal.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    clearAll();
    spawnTerminal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.panel}>
      <div className={styles.tabBar}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${tab.id === activeTabId ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <TabTitle id={tab.id} title={tab.title} />
            {tab.panes.length > 1 && (
              <span className={styles.paneCount}>{tab.panes.length}</span>
            )}
            <span className={styles.tabClose} onClick={(e) => closeTab(tab.id, e)}>
              ×
            </span>
          </button>
        ))}
        <button className={styles.addBtn} onClick={spawnTerminal} title="New Terminal">
          +
        </button>
        <div style={{ flex: 1 }} />
        {activeTabId && (
          <>
            <button
              className={styles.addBtn}
              onClick={() => handleSplit("vertical")}
              title="Split Right"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
            <button
              className={styles.addBtn}
              onClick={() => handleSplit("horizontal")}
              title="Split Down"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </>
        )}
      </div>
      <div className={styles.body}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const hasSplits = tab.panes.length > 1;

          return (
            <div
              key={tab.id}
              className={`${styles.terminalWrapper} ${!isActive ? styles.hidden : ""}`}
            >
              {hasSplits ? (
                <TerminalSplitView
                  panes={tab.panes}
                  direction={tab.splitDirection}
                  activePtyId={activePtyId}
                  onPtyFocus={setActivePty}
                  onClosePane={(ptyId) => removePane(tab.id, ptyId)}
                />
              ) : (
                <div className={styles.splitTerminal}>
                  <TerminalInstance ptyId={tab.panes[0]} visible={isActive} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
