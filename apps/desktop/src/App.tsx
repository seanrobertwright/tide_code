import { useEffect, useCallback, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useEngineStore } from "./stores/engine";
import { useWorkspaceStore, type FsEntry } from "./stores/workspace";
import { useUiStore } from "./stores/ui";
import { useStreamStore } from "./stores/stream";
import { useCommandStore } from "./stores/commandStore";
import { getPiStatus, getPiState, getAvailableModels, getMessages, getSessionStats, openWorkspace, restartPi, getLaunchPath } from "./lib/ipc";
import { onPiEvent, onPiReady } from "./lib/pi-events";
import { SplitPane } from "./components/Layout/SplitPane";
import { GlobalLoader } from "./components/GlobalLoader";
import { FileTree } from "./components/FileTree/FileTree";
import { EditorTabs } from "./components/Editor/EditorTabs";
import { MonacoEditor } from "./components/Editor/MonacoEditor";
import { AgentPanel } from "./components/AgentPanel/AgentPanel";
import { ContextDial } from "./components/StatusBar/ContextDial";
import { GitStatus } from "./components/StatusBar/GitStatus";
import { ModelPicker } from "./components/StatusBar/ModelPicker";
import { ThinkingLevelPicker } from "./components/StatusBar/ThinkingLevelPicker";
import { CostIndicator } from "./components/StatusBar/CostIndicator";
import { ContextInspector } from "./components/ContextInspector/ContextInspector";
import { ApprovalDialog } from "./components/Approval/ApprovalDialog";
import { CommandPalette } from "./components/CommandPalette/CommandPalette";
import { SettingsPanel } from "./components/Settings/SettingsModal";
import { SETTINGS_TAB_PATH } from "./stores/settingsStore";
import { AppBar } from "./components/AppBar/AppBar";
import { SearchPanel } from "./components/SearchPanel/SearchPanel";
import { TerminalPanel } from "./components/Terminal/TerminalPanel";
import { useTerminalStore } from "./stores/terminalStore";
import { useSettingsStore } from "./stores/settingsStore";
import { initApprovalListener } from "./stores/approvalStore";
import { usePermissionStore } from "./stores/permissionStore";
import { useIndexStore } from "./stores/indexStore";
import { initOrchestrationListener } from "./stores/orchestrationStore";
import { listen } from "@tauri-apps/api/event";
import { checkForUpdates } from "./lib/updater";
import { Toasts } from "./components/Toasts";
import { Dashboard, saveRecentWorkspace } from "./components/Dashboard/Dashboard";
import { ErrorBoundary } from "./components/ErrorBoundary";
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
  const { setStatus } = useEngineStore();
  const { rootPath, setRootPath, setFileTree, openTabs, activeTabPath, updateTabContent } =
    useWorkspaceStore();
  const { startLoading, stopLoading, fileTreeVisible, sidebarPanel } = useUiStore();
  const terminalVisible = useTerminalStore((s) => s.visible);

  const { handlePiEvent } = useStreamStore();
  const piReadyFired = useRef(false);

  /** Fetch Pi state, models, messages, stats. Called on pi_ready and on first status-poll connect. */
  const fetchPiState = useCallback((source: "pi_ready" | "poll") => {
    // pi_ready is authoritative — always fetch. Poll only fetches if pi_ready hasn't fired yet.
    if (source === "poll" && piReadyFired.current) return;
    if (source === "pi_ready") piReadyFired.current = true;
    console.log(`[Tide] Fetching state + models + history + stats (source: ${source})`);
    getPiState().catch(() => {});
    getAvailableModels().catch(() => {});
    getMessages().catch(() => {});
    getSessionStats().catch(() => {});
    // Retry models in case registry is still initializing
    setTimeout(() => {
      if (useStreamStore.getState().availableModels.length === 0) {
        getAvailableModels().catch(() => {});
      }
    }, 2000);
  }, []);

  // Initialize listeners on mount
  useEffect(() => {
    let cancelled = false;
    initApprovalListener();
    initOrchestrationListener();
    usePermissionStore.getState().load();
    useSettingsStore.getState().load();
    checkForUpdates();

    // Subscribe to all Pi events and forward to stream store
    const eventCleanup = onPiEvent((event) => {
      if (!cancelled) handlePiEvent(event);
    });

    // Also listen for pi_ready event (authoritative signal that Pi is ready)
    const readyCleanup = onPiReady(() => {
      if (cancelled) return;
      fetchPiState("pi_ready");
    });

    // Listen for code index progress events
    const indexProgressCleanup = listen<{ done: number; total: number; currentFile: string }>(
      "index_progress",
      (event) => {
        if (!cancelled) {
          useIndexStore.getState().updateProgress(
            event.payload.done,
            event.payload.total,
            event.payload.currentFile,
          );
        }
      },
    );

    // Listen for index completion
    const indexCompleteCleanup = listen<{ indexed: boolean; fileCount: number; symbolCount: number; lastIndexedAt: string | null; indexingInProgress: boolean }>(
      "index_complete",
      (event) => {
        if (!cancelled) {
          useIndexStore.getState().updateFromStats(event.payload);
        }
      },
    );

    return () => {
      cancelled = true;
      eventCleanup.then((unlisten) => unlisten());
      readyCleanup.then((unlisten) => unlisten());
      indexProgressCleanup.then((unlisten) => unlisten());
      indexCompleteCleanup.then((unlisten) => unlisten());
    };
  }, [handlePiEvent, fetchPiState]);

  // Poll Pi status — when first connected, fetch models + state
  useEffect(() => {
    let cancelled = false;
    let wasConnected = false;
    const check = async () => {
      try {
        const result = await getPiStatus();
        const connected = result === "connected";
        if (!cancelled) setStatus(connected ? "connected" : "disconnected");

        // On first connection (or reconnection), request models + state
        if (connected && !wasConnected) {
          wasConnected = true;
          fetchPiState("poll");
        }
        if (!connected) wasConnected = false;
      } catch {
        if (!cancelled) setStatus("disconnected");
        wasConnected = false;
      }
    };
    const interval = setInterval(check, 5000);
    check();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setStatus, fetchPiState]);

  // Refresh file tree when window regains focus (catches external file changes)
  useEffect(() => {
    const handleFocus = () => {
      const root = useWorkspaceStore.getState().rootPath;
      if (root) useWorkspaceStore.getState().refreshFileTree();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  // Auto-open workspace from CLI args (e.g. `tide /path/to/project`)
  useEffect(() => {
    let cancelled = false;
    getLaunchPath().then(async (launchPath) => {
      if (cancelled || !launchPath) return;
      try {
        const entries = await openWorkspace(launchPath);
        setRootPath(launchPath);
        setFileTree(toFsEntries(entries));
        saveRecentWorkspace(launchPath);
      } catch (e) {
        console.error("[Tide] Failed to open CLI launch path:", e);
      }
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      } else if (meta && e.key === "0") {
        e.preventDefault();
        useUiStore.getState().showFileTree();
        setTimeout(() => document.getElementById("file-tree")?.focus(), 50);
      } else if (meta && e.key === "t") {
        e.preventDefault();
        useTerminalStore.getState().toggleVisible();
      } else if (meta && e.key === "o") {
        e.preventDefault();
        handleOpenFolderRef.current();
      } else if (meta && e.key === "s") {
        e.preventDefault();
        useWorkspaceStore.getState().saveActiveFile();
      } else if (meta && e.shiftKey && e.key === "f") {
        e.preventDefault();
        useUiStore.getState().setSidebarPanel("search");
        setTimeout(() => document.getElementById("search-input")?.focus(), 50);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Register commands (ref declared after handleOpenFolder below)
  const handleOpenFolderRef = useRef<() => Promise<void>>(null!);
  useEffect(() => {
    useCommandStore.getState().registerMany([
      {
        id: "tide.openFolder",
        label: "Open Folder",
        category: "File",
        shortcut: "Cmd+O",
        execute: () => handleOpenFolderRef.current(),
      },
      {
        id: "tide.saveFile",
        label: "Save File",
        category: "File",
        shortcut: "Cmd+S",
        execute: () => useWorkspaceStore.getState().saveActiveFile(),
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
      {
        id: "tide.focusExplorer",
        label: "Focus File Explorer",
        category: "View",
        shortcut: "Cmd+0",
        execute: () => {
          useUiStore.getState().showFileTree();
          setTimeout(() => document.getElementById("file-tree")?.focus(), 50);
        },
      },
      {
        id: "tide.toggleTerminal",
        label: "Toggle Terminal",
        category: "View",
        shortcut: "⌘T",
        execute: () => useTerminalStore.getState().toggleVisible(),
      },
      {
        id: "tide.searchInFiles",
        label: "Search in Files",
        category: "Search",
        shortcut: "Cmd+Shift+F",
        keywords: ["find", "grep", "replace"],
        execute: () => {
          useUiStore.getState().setSidebarPanel("search");
          setTimeout(() => document.getElementById("search-input")?.focus(), 50);
        },
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
        saveRecentWorkspace(folderPath);
        // Clear old session state before restarting Pi with new workspace CWD
        useStreamStore.getState().clearMessages();
        useStreamStore.setState({ sessionId: "", sessionName: "", sessionDir: "", sessionStatus: "idle", hasAutoTitled: false });
        // Restart Pi so its CWD matches the new workspace
        piReadyFired.current = false;
        await restartPi();
        // Reload workspace-scoped data (permissions, settings)
        usePermissionStore.getState().load();
        useSettingsStore.getState().load();
      } finally {
        stopLoading();
      }
    } catch (err) {
      console.error("[Tide] Open folder failed:", err);
      stopLoading();
    }
  }, [setRootPath, setFileTree, startLoading, stopLoading]);

  // Keep ref to latest handleOpenFolder to avoid stale closures in command palette
  useEffect(() => { handleOpenFolderRef.current = handleOpenFolder; }, [handleOpenFolder]);

  const activeTab = openTabs.find((t) => t.path === activeTabPath);

  const isSettingsActive = activeTabPath === SETTINGS_TAB_PATH;

  const editorContent = (
    <div style={s.editorArea}>
      <EditorTabs />
      <div style={s.editorContent}>
        {isSettingsActive ? (
          <SettingsPanel />
        ) : activeTab ? (
          <MonacoEditor
            content={activeTab.content}
            language={activeTab.language}
            path={activeTab.path}
            readOnly={false}
            onChange={(value) => updateTabContent(activeTab.path, value)}
          />
        ) : (
          <div style={s.emptyEditor}>
            <p>Open a file from the explorer</p>
          </div>
        )}
      </div>
    </div>
  );

  const editorWithTerminal = terminalVisible ? (
    <SplitPane direction="horizontal" initialSize={200} minSize={100} maxSize={500} side="end">
      {editorContent}
      <TerminalPanel />
    </SplitPane>
  ) : (
    editorContent
  );

  return (
    <div style={s.container}>
      <GlobalLoader />
      <AppBar />

      {/* Main content area */}
      <div style={s.main}>
        {rootPath ? (
          fileTreeVisible ? (
            /* File Tree | Editor | Agent Panel */
            <SplitPane direction="vertical" initialSize={250} minSize={150} maxSize={500}>
              {/* Left sidebar: Icon Rail + Panel */}
              <div style={s.sidebar}>
                <div style={s.sidebarInner}>
                  {/* Icon rail */}
                  <div style={s.iconRail}>
                    <button
                      style={{ ...s.iconRailBtn, ...(sidebarPanel === "explorer" ? s.iconRailBtnActive : {}) }}
                      onClick={() => useUiStore.getState().setSidebarPanel("explorer")}
                      title="Explorer (Cmd+0)"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M1 2h5l1 1h7v10H1V2z" stroke="currentColor" strokeWidth="1.2" fill="none" />
                        <path d="M1 5h14" stroke="currentColor" strokeWidth="1.2" />
                      </svg>
                    </button>
                    <button
                      style={{ ...s.iconRailBtn, ...(sidebarPanel === "search" ? s.iconRailBtnActive : {}) }}
                      onClick={() => useUiStore.getState().setSidebarPanel("search")}
                      title="Search (Cmd+Shift+F)"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.2" />
                        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  {/* Panel content */}
                  <div style={s.sidebarContent}>
                    <div style={s.sidebarHeader}>
                      <span>{sidebarPanel === "explorer" ? "Explorer" : "Search"}</span>
                      {sidebarPanel === "explorer" && (
                        <button style={s.openBtn} onClick={handleOpenFolder} title="Open Folder">
                          ...
                        </button>
                      )}
                    </div>
                    {sidebarPanel === "explorer" ? (
                      <ErrorBoundary fallbackLabel="File Explorer">
                        <FileTree />
                      </ErrorBoundary>
                    ) : (
                      <ErrorBoundary fallbackLabel="Search">
                        <SearchPanel />
                      </ErrorBoundary>
                    )}
                  </div>
                </div>
              </div>

              {/* Editor + Terminal + Agent Panel */}
              <SplitPane direction="vertical" initialSize={350} minSize={250} maxSize={600} side="end">
                <ErrorBoundary fallbackLabel="Editor">{editorWithTerminal}</ErrorBoundary>
                <ErrorBoundary fallbackLabel="Agent Panel"><AgentPanel /></ErrorBoundary>
              </SplitPane>
            </SplitPane>
          ) : (
            /* Editor + Terminal | Agent Panel (no file tree) */
            <SplitPane direction="vertical" initialSize={350} minSize={250} maxSize={600} side="end">
              <ErrorBoundary fallbackLabel="Editor">{editorWithTerminal}</ErrorBoundary>
              <ErrorBoundary fallbackLabel="Agent Panel"><AgentPanel /></ErrorBoundary>
            </SplitPane>
          )
        ) : (
          <Dashboard
            onOpenFolder={handleOpenFolder}
            onOpenWorkspace={async (wsPath) => {
              startLoading("Opening workspace...");
              try {
                const entries = await openWorkspace(wsPath);
                setRootPath(wsPath);
                setFileTree(toFsEntries(entries));
                saveRecentWorkspace(wsPath);
                useStreamStore.getState().clearMessages();
                useStreamStore.setState({ sessionId: "", sessionName: "", sessionDir: "", sessionStatus: "idle", hasAutoTitled: false });
                piReadyFired.current = false;
        await restartPi();
                usePermissionStore.getState().load();
                useSettingsStore.getState().load();
              } catch (e) {
                console.error("Failed to open workspace:", e);
              } finally {
                stopLoading();
              }
            }}
          />
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
        <CostIndicator />
        <ThinkingLevelPicker />
        <ModelPicker />
        <ContextDial />
      </div>

      {/* Overlays */}
      <CommandPalette />
      <ContextInspector />
      <ApprovalDialog />
      <Toasts />
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
  sidebarInner: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },
  iconRail: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    width: 32,
    padding: "6px 0",
    background: "var(--bg-secondary)",
    borderRight: "1px solid var(--border)",
    flexShrink: 0,
  },
  iconRailBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-secondary)",
    cursor: "pointer",
  },
  iconRailBtnActive: {
    color: "var(--text-bright)",
    borderLeft: "2px solid var(--accent)",
    borderRadius: 0,
  },
  sidebarContent: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
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
