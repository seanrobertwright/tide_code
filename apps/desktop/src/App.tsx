import { useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useEngineStore } from "./stores/engine";
import { useWorkspaceStore, type FsEntry } from "./stores/workspace";
import { useUiStore } from "./stores/ui";
import { useStreamStore } from "./stores/stream";
import { useCommandStore } from "./stores/commandStore";
import { getPiStatus, openWorkspace } from "./lib/ipc";
import { onPiEvent } from "./lib/pi-events";
import { SplitPane } from "./components/Layout/SplitPane";
import { GlobalLoader } from "./components/GlobalLoader";
import { FileTree } from "./components/FileTree/FileTree";
import { EditorTabs } from "./components/Editor/EditorTabs";
import { MonacoEditor } from "./components/Editor/MonacoEditor";
import { AgentPanel } from "./components/AgentPanel/AgentPanel";
import { ContextDial } from "./components/StatusBar/ContextDial";
import { GitStatus } from "./components/StatusBar/GitStatus";
import { ContextInspector } from "./components/ContextInspector/ContextInspector";
import { ApprovalDialog } from "./components/Approval/ApprovalDialog";
import { CommandPalette } from "./components/CommandPalette/CommandPalette";
import { SettingsModal } from "./components/Settings/SettingsModal";
import { useSettingsStore } from "./stores/settingsStore";
import { initApprovalListener } from "./stores/approvalStore";
import "./styles/global.css";

interface RawFsEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size?: number;
}

function toFsEntries(raw: RawFsEntry[]): FsEntry[] {
  return raw.map((e) => ({
    name: e.name,
    path: e.path,
    isDir: e.type === "directory",
    size: e.size,
  }));
}

export function App() {
  const { status, setStatus } = useEngineStore();
  const { rootPath, setRootPath, setFileTree, openTabs, activeTabPath, updateTabContent } =
    useWorkspaceStore();
  const { startLoading, stopLoading, fileTreeVisible } = useUiStore();

  const { handlePiEvent } = useStreamStore();

  // Initialize listeners on mount
  useEffect(() => {
    initApprovalListener();

    // Subscribe to all Pi events and forward to stream store
    const cleanup = onPiEvent((event) => {
      handlePiEvent(event);
    });

    return () => {
      cleanup.then((unlisten) => unlisten());
    };
  }, [handlePiEvent]);

  // Poll Pi status
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const result = await getPiStatus();
        if (!cancelled) setStatus(result === "connected" ? "connected" : "disconnected");
      } catch {
        if (!cancelled) setStatus("disconnected");
      }
    };
    const interval = setInterval(check, 2000);
    check();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setStatus]);

  // Register global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.shiftKey && e.key === "p") {
        e.preventDefault();
        useCommandStore.getState().open();
      } else if (meta && e.key === "b") {
        e.preventDefault();
        useUiStore.getState().toggleFileTree();
      } else if (meta && e.key === ",") {
        e.preventDefault();
        useSettingsStore.getState().open();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Register commands
  useEffect(() => {
    useCommandStore.getState().registerMany([
      {
        id: "tide.openFolder",
        label: "Open Folder",
        category: "File",
        shortcut: "Cmd+O",
        execute: () => handleOpenFolder(),
      },
      {
        id: "tide.toggleFileTree",
        label: "Toggle File Tree",
        category: "View",
        shortcut: "Cmd+B",
        execute: () => useUiStore.getState().toggleFileTree(),
      },
      {
        id: "tide.openSettings",
        label: "Open Settings",
        category: "Settings",
        shortcut: "Cmd+,",
        keywords: ["preferences", "config", "api", "keys"],
        execute: () => useSettingsStore.getState().open(),
      },
      {
        id: "tide.commandPalette",
        label: "Command Palette",
        category: "View",
        shortcut: "Cmd+Shift+P",
        execute: () => useCommandStore.getState().open(),
      },
    ]);
  }, []);

  const handleOpenFolder = useCallback(async () => {
    try {
      const selected = await open({ directory: true, title: "Open Folder" });
      if (!selected) return;

      const folderPath = typeof selected === "string" ? selected : selected[0];
      if (!folderPath) return;

      startLoading("Opening workspace...");
      try {
        const entries = await openWorkspace(folderPath);
        setRootPath(folderPath);
        setFileTree(toFsEntries(entries));
      } finally {
        stopLoading();
      }
    } catch (err) {
      console.error("[Tide] Open folder failed:", err);
      stopLoading();
    }
  }, [setRootPath, setFileTree, startLoading, stopLoading]);

  const activeTab = openTabs.find((t) => t.path === activeTabPath);

  const statusColor =
    status === "connected"
      ? "var(--success)"
      : status === "error"
        ? "var(--error)"
        : "var(--text-secondary)";

  return (
    <div style={s.container}>
      <GlobalLoader />
      {/* Top status bar */}
      <div style={s.topBar}>
        <span style={s.title}>Tide</span>
        <span style={{ ...s.statusDot, background: statusColor }} />
        <span style={s.statusText}>Pi: {status}</span>
        <div style={{ flex: 1 }} />
        {!rootPath && (
          <button style={s.openBtn} onClick={handleOpenFolder}>
            Open Folder
          </button>
        )}
      </div>

      {/* Main content area */}
      <div style={s.main}>
        {rootPath ? (
          fileTreeVisible ? (
            /* File Tree | Editor | Agent Panel */
            <SplitPane direction="vertical" initialSize={250} minSize={150} maxSize={500}>
              {/* Left sidebar: File Tree */}
              <div style={s.sidebar}>
                <div style={s.sidebarHeader}>
                  <span>Explorer</span>
                  <button style={s.openBtn} onClick={handleOpenFolder} title="Open Folder">
                    ...
                  </button>
                </div>
                <FileTree />
              </div>

              {/* Editor + Agent Panel */}
              <SplitPane direction="vertical" initialSize={350} minSize={250} maxSize={600} side="end">
                {/* Center: Editor area */}
                <div style={s.editorArea}>
                  <EditorTabs />
                  <div style={s.editorContent}>
                    {activeTab ? (
                      <MonacoEditor
                        content={activeTab.content}
                        language={activeTab.language}
                        path={activeTab.path}
                        readOnly={true}
                        onChange={(value) => updateTabContent(activeTab.path, value)}
                      />
                    ) : (
                      <div style={s.emptyEditor}>
                        <p>Open a file from the explorer</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Agent Panel */}
                <AgentPanel />
              </SplitPane>
            </SplitPane>
          ) : (
            /* Editor | Agent Panel (no file tree) */
            <SplitPane direction="vertical" initialSize={350} minSize={250} maxSize={600} side="end">
              <div style={s.editorArea}>
                <EditorTabs />
                <div style={s.editorContent}>
                  {activeTab ? (
                    <MonacoEditor
                      content={activeTab.content}
                      language={activeTab.language}
                      path={activeTab.path}
                      readOnly={true}
                      onChange={(value) => updateTabContent(activeTab.path, value)}
                    />
                  ) : (
                    <div style={s.emptyEditor}>
                      <p>Open a file from the explorer</p>
                    </div>
                  )}
                </div>
              </div>

              <AgentPanel />
            </SplitPane>
          )
        ) : (
          <div style={s.welcome}>
            <h2 style={s.welcomeTitle}>Welcome to Tide</h2>
            <p style={s.welcomeText}>Open a folder to get started</p>
            <button style={s.welcomeBtn} onClick={handleOpenFolder}>
              Open Folder
            </button>
          </div>
        )}
      </div>

      {/* Bottom status bar */}
      <div style={s.bottomBar}>
        <span>Tide v0.1.0</span>
        {rootPath && (
          <span style={s.rootPathLabel}>{rootPath.split("/").pop()}</span>
        )}
        <GitStatus />
        <div style={{ flex: 1 }} />
        <ContextDial />
      </div>

      {/* Overlays */}
      <CommandPalette />
      <SettingsModal />
      <ContextInspector />
      <ApprovalDialog />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: "var(--status-bar-height)",
    padding: "0 12px",
    background: "var(--bg-tertiary)",
    borderBottom: "1px solid var(--border)",
    fontSize: "var(--font-size-sm)",
  },
  title: { fontWeight: 600, color: "var(--text-bright)" },
  statusDot: { width: 6, height: 6, borderRadius: "50%", marginLeft: 8 },
  statusText: { color: "var(--text-secondary)", fontSize: "var(--font-size-xs)" },
  openBtn: {
    padding: "2px 8px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-primary)",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
  main: { flex: 1, overflow: "hidden" },
  sidebar: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "var(--bg-secondary)",
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: 32,
    padding: "0 12px",
    fontSize: "var(--font-size-xs)",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border)",
  },
  editorArea: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  editorContent: { flex: 1, overflow: "hidden" },
  emptyEditor: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "var(--text-secondary)",
    fontStyle: "italic",
  },
  welcome: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: 16,
  },
  welcomeTitle: { fontSize: 24, fontWeight: 300, color: "var(--text-bright)" },
  welcomeText: { color: "var(--text-secondary)", fontSize: "var(--font-size-lg)" },
  welcomeBtn: {
    padding: "8px 24px",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--font-size-md)",
    fontWeight: 500,
    color: "white",
    background: "var(--accent)",
    border: "none",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
  },
  bottomBar: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    height: "var(--status-bar-height)",
    padding: "0 12px",
    background: "var(--bg-tertiary)",
    borderTop: "1px solid var(--border)",
    fontSize: "var(--font-size-xs)",
    color: "var(--text-secondary)",
  },
  rootPathLabel: { color: "var(--text-primary)" },
};
