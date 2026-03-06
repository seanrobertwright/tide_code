import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { listen } from "@tauri-apps/api/event";
import { ptyAttach, ptyWrite, ptyResize } from "../../lib/ipc";
import { emitSnippet } from "../AgentPanel/AgentPanel";
import { useTerminalStore } from "../../stores/terminalStore";
import "@xterm/xterm/css/xterm.css";

interface Props {
  ptyId: string;
  visible: boolean;
}

export function TerminalInstance({ ptyId, visible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      fontFamily: "\"SF Mono\", Menlo, Monaco, \"Courier New\", monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      theme: {
        background: "#13141c",
        foreground: "#a9b1d6",
        cursor: "#c0caf5",
        selectionBackground: "#2e3450",
        black: "#15161e",
        red: "#f7768e",
        green: "#9ece6a",
        yellow: "#e0af68",
        blue: "#7aa2f7",
        magenta: "#bb9af7",
        cyan: "#7dcfff",
        white: "#a9b1d6",
        brightBlack: "#414868",
        brightRed: "#f7768e",
        brightGreen: "#9ece6a",
        brightYellow: "#e0af68",
        brightBlue: "#7aa2f7",
        brightMagenta: "#bb9af7",
        brightCyan: "#7dcfff",
        brightWhite: "#c0caf5",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(el);

    termRef.current = term;
    fitRef.current = fit;

    // Fit after open, then focus so keyboard works
    requestAnimationFrame(() => {
      fit.fit();
      term.focus();
    });

    // Cmd+Shift+T: tag selected terminal text → chat composer
    term.attachCustomKeyEventHandler((e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "t" && e.type === "keydown") {
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

  // Re-fit and focus when visibility changes
  useEffect(() => {
    if (visible && fitRef.current && termRef.current) {
      requestAnimationFrame(() => {
        fitRef.current?.fit();
        termRef.current?.focus();
      });
    }
  }, [visible]);

  return (
    <div
      ref={containerRef}
      onClick={() => termRef.current?.focus()}
      style={{
        width: "100%",
        height: "100%",
        display: visible ? "block" : "none",
      }}
    />
  );
}
