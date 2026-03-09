import { useCallback } from "react";
import { useWorkspaceStore } from "../../stores/workspace";
import { SETTINGS_TAB_PATH } from "../../stores/settingsStore";
import styles from "./EditorTabs.module.css";

const GearIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
    <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z" />
  </svg>
);

export function EditorTabs() {
  const { openTabs, activeTabPath, setActiveTab, closeTab } =
    useWorkspaceStore();

  const handleClose = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      closeTab(path);
    },
    [closeTab],
  );

  if (openTabs.length === 0) return null;

  return (
    <div className={styles.tabBar}>
      {openTabs.map((tab) => (
        <div
          key={tab.path}
          className={`${styles.tab} ${tab.path === activeTabPath ? styles.tabActive : ""}`}
          onClick={() => setActiveTab(tab.path)}
        >
          {tab.path === SETTINGS_TAB_PATH && <GearIcon />}
          {tab.isDirty && <span className={styles.dirtyDot} />}
          <span className={styles.tabName}>{tab.name}</span>
          <button
            className={styles.closeBtn}
            onClick={(e) => handleClose(e, tab.path)}
            title="Close"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
