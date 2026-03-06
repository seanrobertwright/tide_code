import { useWorkspaceStore } from "../../stores/workspace";
import { useEngineStore } from "../../stores/engine";
import { useSettingsStore } from "../../stores/settingsStore";
import { getCurrentWindow } from "@tauri-apps/api/window";
import styles from "./AppBar.module.css";

export function AppBar() {
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const status = useEngineStore((s) => s.status);

  const folderName = rootPath ? rootPath.split("/").pop() : "Tide";

  const statusColor =
    status === "connected"
      ? "var(--success)"
      : status === "error"
        ? "var(--error)"
        : "var(--text-secondary)";

  return (
    <div
      className={styles.appBar}
      onMouseDown={(e) => {
        // Only drag on left-click and not on interactive elements
        if (e.button === 0 && (e.target as HTMLElement).closest("button") === null) {
          getCurrentWindow().startDragging();
        }
      }}
    >
      <div className={styles.spacer} />

      <span className={styles.folderName}>{folderName}</span>

      <div className={styles.status}>
        <span className={styles.statusDot} style={{ background: statusColor }} />
        <span className={styles.statusText}>Pi: {status}</span>
      </div>

      <div className={styles.spacer} />

      <button
        className={styles.settingsBtn}
        onClick={() => useSettingsStore.getState().open()}
        title="Settings"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 10a2 2 0 100-4 2 2 0 000 4z"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path
            d="M13.5 8c0-.3-.2-.6-.4-.8l1-1.6-.8-1.4-1.8.4c-.4-.3-.8-.6-1.3-.7L9.8 2H8.2l-.4 1.9c-.5.1-.9.4-1.3.7l-1.8-.4-.8 1.4 1 1.6c-.2.2-.4.5-.4.8s.2.6.4.8l-1 1.6.8 1.4 1.8-.4c.4.3.8.6 1.3.7l.4 1.9h1.6l.4-1.9c.5-.1.9-.4 1.3-.7l1.8.4.8-1.4-1-1.6c.2-.2.4-.5.4-.8z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
