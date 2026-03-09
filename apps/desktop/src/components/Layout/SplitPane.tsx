import { useState, useRef, useCallback, type ReactNode } from "react";
import styles from "./SplitPane.module.css";

interface SplitPaneProps {
  direction?: "vertical" | "horizontal";
  initialSize: number;
  minSize?: number;
  maxSize?: number;
  /** Which child gets the fixed size. "start" = first child, "end" = second child. */
  side?: "start" | "end";
  children: [ReactNode, ReactNode];
}

export function SplitPane({
  direction = "vertical",
  initialSize,
  minSize = 100,
  maxSize = 800,
  side = "start",
  children,
}: SplitPaneProps) {
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setIsDragging(true);

      const startPos = direction === "vertical" ? e.clientX : e.clientY;
      const startSize = size;

      const handlePointerMove = (ev: PointerEvent) => {
        const currentPos = direction === "vertical" ? ev.clientX : ev.clientY;
        const delta = side === "start" ? currentPos - startPos : startPos - currentPos;
        const newSize = Math.max(minSize, Math.min(maxSize, startSize + delta));
        setSize(newSize);
      };

      const handlePointerUp = () => {
        setIsDragging(false);
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [direction, size, minSize, maxSize, side],
  );

  const isVertical = direction === "vertical";
  const sizeKey = isVertical ? "width" : "height";
  const fixedStyle = { [sizeKey]: size, flexShrink: 0 };
  const flexStyle = { flex: 1 };

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${isVertical ? styles.vertical : styles.horizontal}`}
    >
      <div className={styles.pane} style={side === "start" ? fixedStyle : flexStyle}>
        {children[0]}
      </div>
      <div
        className={`${styles.handle} ${
          isVertical ? styles.handleVertical : styles.handleHorizontal
        } ${isDragging ? styles.handleDragging : ""}`}
        onPointerDown={handlePointerDown}
      />
      <div className={styles.pane} style={side === "end" ? fixedStyle : flexStyle}>
        {children[1]}
      </div>
    </div>
  );
}
