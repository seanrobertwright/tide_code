import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { listen } from "@tauri-apps/api/event";
import { ptyAttach, ptyWrite, ptyResize } from "../../lib/ipc";
import { emitSnippet } from "../AgentPanel/AgentPanel";
import { useTerminalStore } from "../../stores/terminalStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { terminalThemes, defaultTerminalTheme } from "../../lib/terminalThemes";
import { ContextMenu, type ContextMenuItem } from "../ContextMenu/ContextMenu";
import "@xterm/xterm/css/xterm.css";
import styles from "./TerminalPanel.module.css";

interface Props {
  ptyId: string;
  visible: boolean;
}

export function TerminalInstance({ ptyId, visible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const settings = useSettingsStore.getState();
    const theme = terminalThemes[settings.terminalTheme] ?? terminalThemes[defaultTerminalTheme];

    const term = new Terminal({
      allowProposedApi: true,
      fontFamily: '"SF Mono", Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      scrollback: settings.terminalScrollback,
      theme,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());

    // Unicode 11 for emoji/CJK
    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = "11";

    // Search addon
    const search = new SearchAddon();
    term.loadAddon(search);
    searchRef.current = search;

    term.open(el);

    termRef.current = term;
    fitRef.current = fit;

    // Fit after open, then focus so keyboard works
    requestAnimationFrame(() => {
      fit.fit();
      term.focus();
    });

    // Custom key handler
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;

      // Cmd+Shift+T: tag selected terminal text → chat composer
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "t") {
        const selected = term.getSelection();
        if (selected?.trim()) {
          emitSnippet({
            id: `snip-${Date.now()}`,
            label: "Terminal output",
            code: selected,
            lang: "text",
            filePath: "",
            startLine: 0,
            endLine: 0,
          });
        }
        return false;
      }

      // Cmd+K: clear terminal
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        term.clear();
        return false;
      }

      // Cmd+F: open search
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        setSearchOpen(true);
        return false;
      }

      return true;
    });

    // Send input to PTY
    const onDataDispose = term.onData((data) => {
      ptyWrite(ptyId, data).catch((err) =>
        console.error("[Terminal] ptyWrite error:", err),
      );
    });

    // Send resize to PTY (debounced)
    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResizeDispose = term.onResize(({ cols, rows }) => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        ptyResize(ptyId, cols, rows).catch(() => {});
      }, 50);
    });

    // Auto-resize on container size change
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => fit.fit());
    });
    observer.observe(el);

    let cancelled = false;
    let unlistenOutput: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;

    // Set up listeners FIRST (await), then attach the PTY read thread
    (async () => {
      unlistenOutput = await listen<{ ptyId: string; data: string }>("pty_output", (event) => {
        if (event.payload.ptyId === ptyId) {
          term.write(event.payload.data);
        }
      });

      unlistenExit = await listen<{ ptyId: string }>("pty_exit", (event) => {
        if (event.payload.ptyId === ptyId) {
          term.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
          useTerminalStore.getState().markDead(ptyId);
        }
      });

      if (cancelled) {
        unlistenOutput();
        unlistenExit();
        return;
      }

      // Now that listeners are live, start the read thread
      await ptyAttach(ptyId);
    })().catch((err) => console.error("[Terminal] attach failed:", err));

    return () => {
      cancelled = true;
      observer.disconnect();
      onDataDispose.dispose();
      onResizeDispose.dispose();
      clearTimeout(resizeTimer);
      unlistenOutput?.();
      unlistenExit?.();
      term.dispose();
      // Do NOT ptyKill here — React StrictMode double-fires effects in dev,
      // which would kill the PTY on the first unmount then fail on remount.
      // PTY is killed explicitly via TerminalPanel.closeTab() instead.
    };
  }, [ptyId]);

  // Sync terminal theme when settings change
  const terminalThemeName = useSettingsStore((s) => s.terminalTheme);
  useEffect(() => {
    if (termRef.current) {
      const newTheme = terminalThemes[terminalThemeName] ?? terminalThemes[defaultTerminalTheme];
      termRef.current.options.theme = newTheme;
    }
  }, [terminalThemeName]);

  // Re-fit and focus when visibility changes
  useEffect(() => {
    if (visible && fitRef.current && termRef.current) {
      requestAnimationFrame(() => {
        fitRef.current?.fit();
        termRef.current?.focus();
      });
    }
  }, [visible]);

  // Focus search input when search opens
  useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchOpen]);

  // Search handlers
  const doSearch = useCallback((direction: "next" | "prev") => {
    if (!searchRef.current || !searchQuery) return;
    if (direction === "next") {
      searchRef.current.findNext(searchQuery);
    } else {
      searchRef.current.findPrevious(searchQuery);
    }
  }, [searchQuery]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    searchRef.current?.clearDecorations();
    termRef.current?.focus();
  }, []);

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const ctxMenuItems: ContextMenuItem[] = [
    {
      label: "Copy",
      action: () => {
        const sel = termRef.current?.getSelection();
        if (sel) navigator.clipboard.writeText(sel);
      },
    },
    {
      label: "Paste",
      action: async () => {
        const text = await navigator.clipboard.readText();
        if (text) ptyWrite(ptyId, text).catch(() => {});
      },
      dividerAfter: true,
    },
    {
      label: "Select All",
      action: () => termRef.current?.selectAll(),
    },
    {
      label: "Clear",
      action: () => termRef.current?.clear(),
    },
    {
      label: "Find",
      action: () => setSearchOpen(true),
    },
  ];

  return (
    <div
      ref={containerRef}
      onClick={() => termRef.current?.focus()}
      onContextMenu={handleContextMenu}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
      }}
    >
      {/* Search overlay */}
      {searchOpen && (
        <div className={styles.searchBar}>
          <input
            ref={searchInputRef}
            className={styles.searchInput}
            type="text"
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value) searchRef.current?.findNext(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                doSearch(e.shiftKey ? "prev" : "next");
              } else if (e.key === "Escape") {
                closeSearch();
              }
            }}
          />
          <button className={styles.searchBtn} onClick={() => doSearch("prev")} title="Previous (Shift+Enter)">
            ↑
          </button>
          <button className={styles.searchBtn} onClick={() => doSearch("next")} title="Next (Enter)">
            ↓
          </button>
          <button className={styles.searchBtn} onClick={closeSearch} title="Close (Escape)">
            ×
          </button>
        </div>
      )}

      {/* Right-click context menu */}
      {ctxMenu && (
        <ContextMenu
          items={ctxMenuItems}
          position={ctxMenu}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
