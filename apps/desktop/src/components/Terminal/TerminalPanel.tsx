import { useCallback, useEffect, useRef } from "react";
import { useTerminalStore } from "../../stores/terminalStore";
import { useWorkspaceStore } from "../../stores/workspace";
import { ptyCreate, ptyKill } from "../../lib/ipc";
import { TerminalInstance } from "./TerminalInstance";
import styles from "./TerminalPanel.module.css";

export function TerminalPanel() {
  const { tabs, activeTabId, addTab, removeTab, setActiveTab, clearAll } = useTerminalStore();

  const spawnTerminal = useCallback(async () => {
    const cwd = useWorkspaceStore.getState().rootPath ?? undefined;
    try {
      const ptyId = await ptyCreate(cwd);
      addTab(ptyId);
    } catch (err) {
      console.error("[Terminal] Failed to spawn:", err);
    }
  }, [addTab]);

  const closeTab = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await ptyKill(id).catch(() => {});
      removeTab(id);
    },
    [removeTab],
  );

  // On mount: clear any stale tabs from a previous session (Rust PTY state
  // doesn't survive reloads) then spawn a fresh terminal.
  // Guard against React StrictMode double-fire.
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
            <span>{tab.title}</span>
            {!tab.alive && <span className={styles.deadLabel}>(exited)</span>}
            <span className={styles.tabClose} onClick={(e) => closeTab(tab.id, e)}>
              ×
            </span>
          </button>
        ))}
        <button className={styles.addBtn} onClick={spawnTerminal} title="New Terminal">
          +
        </button>
      </div>
      <div className={styles.body}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`${styles.terminalWrapper} ${tab.id !== activeTabId ? styles.hidden : ""}`}
          >
            <TerminalInstance ptyId={tab.id} visible={tab.id === activeTabId} />
          </div>
        ))}
      </div>
    </div>
  );
}
