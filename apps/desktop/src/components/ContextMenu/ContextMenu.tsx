import { useEffect, useRef } from "react";
import styles from "./ContextMenu.module.css";

export interface ContextMenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
  dividerAfter?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Clamp position to viewport
  const style: React.CSSProperties = {
    left: Math.min(position.x, window.innerWidth - 180),
    top: Math.min(position.y, window.innerHeight - items.length * 30 - 20),
  };

  return (
    <>
      <div className={styles.overlay} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className={styles.menu} style={style} ref={menuRef}>
        {items.map((item, i) => (
          <div key={i}>
            <button
              className={`${styles.item} ${item.danger ? styles.itemDanger : ""}`}
              onClick={() => { item.action(); onClose(); }}
            >
              {item.label}
            </button>
            {item.dividerAfter && <div className={styles.divider} />}
          </div>
        ))}
      </div>
    </>
  );
}
