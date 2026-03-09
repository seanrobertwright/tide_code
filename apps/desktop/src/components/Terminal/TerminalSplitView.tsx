import { useCallback, useRef, useState } from "react";
import { TerminalInstance } from "./TerminalInstance";
import { ptyKill } from "../../lib/ipc";
import styles from "./TerminalPanel.module.css";

interface Props {
  panes: string[];
  direction: "horizontal" | "vertical";
  activePtyId: string | null;
  onPtyFocus: (ptyId: string) => void;
  onClosePane: (ptyId: string) => void;
}

export function TerminalSplitView({ panes, direction, activePtyId, onPtyFocus, onClosePane }: Props) {
  const isHorizontal = direction === "horizontal";
  const count = panes.length;

  // Store sizes as flex values — start equal
  const [sizes, setSizes] = useState<number[]>(() => panes.map(() => 1));

  // Keep sizes in sync with pane count
  if (sizes.length !== count) {
    const newSizes = panes.map((_, i) => sizes[i] ?? 1);
    // Can't call setState during render, so schedule it
    requestAnimationFrame(() => setSizes(newSizes));
  }

  const containerRef = useRef<HTMLDivElement>(null);

  const handleDividerDrag = useCallback(
    (index: number, e: React.PointerEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const totalSize = isHorizontal ? rect.height : rect.width;
      // Subtract divider space (3px per divider)
      const dividerSpace = (count - 1) * 3;
      const availableSize = totalSize - dividerSpace;

      const totalFlex = sizes.reduce((a, b) => a + b, 0);

      const onMove = (ev: PointerEvent) => {
        const pos = isHorizontal
          ? ev.clientY - rect.top
          : ev.clientX - rect.left;

        // Calculate where this divider should be
        const newSizes = [...sizes];
        // Sum of flex before this divider
        let pixelsBefore = 0;
        for (let i = 0; i <= index; i++) {
          pixelsBefore += (newSizes[i] / totalFlex) * availableSize;
          if (i < index) pixelsBefore += 3; // divider
        }

        // Target pixel position for divider
        const targetPos = pos - (index * 3); // account for dividers before
        const leftPixels = Math.max(40, Math.min(availableSize - 40 * (count - index - 1), targetPos));

        // Convert pixel sizes back to flex
        let usedBefore = 0;
        for (let i = 0; i < index; i++) {
          usedBefore += (newSizes[i] / totalFlex) * availableSize;
        }

        const leftFlex = Math.max(0.1, (leftPixels - usedBefore) / availableSize * totalFlex);
        const rightFlex = Math.max(0.1, newSizes[index] + newSizes[index + 1] - leftFlex);

        newSizes[index] = leftFlex;
        newSizes[index + 1] = rightFlex;
        setSizes(newSizes);
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [sizes, count, isHorizontal],
  );

  return (
    <div
      ref={containerRef}
      className={styles.splitContainer}
      style={{ flexDirection: isHorizontal ? "column" : "row" }}
    >
      {panes.map((ptyId, i) => (
        <div key={ptyId} style={{ display: "contents" }}>
          <div
            className={`${styles.splitTerminal} ${activePtyId === ptyId ? styles.splitTerminalFocused : ""}`}
            style={{ flex: sizes[i] ?? 1 }}
            onMouseDown={() => onPtyFocus(ptyId)}
          >
            {count > 1 && (
              <button
                className={styles.paneCloseBtn}
                title="Close Pane"
                onClick={(e) => {
                  e.stopPropagation();
                  ptyKill(ptyId).catch(() => {});
                  onClosePane(ptyId);
                }}
              >
                ×
              </button>
            )}
            <TerminalInstance ptyId={ptyId} visible={true} />
          </div>
          {i < count - 1 && (
            <div
              className={`${styles.splitDivider} ${isHorizontal ? styles.splitDividerH : styles.splitDividerV}`}
              onPointerDown={(e) => handleDividerDrag(i, e)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
