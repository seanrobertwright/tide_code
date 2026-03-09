import { useCallback, useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { useWorkspaceStore, type FsEntry } from "../../stores/workspace";
import { fsCreateFile, fsCreateDir, fsRename, fsDelete, ptyCreate } from "../../lib/ipc";
import { ContextMenu, type ContextMenuItem } from "../ContextMenu/ContextMenu";
import { FileIcon } from "./FileIcon";
import { showError } from "../../stores/toastStore";
import { useTerminalStore } from "../../stores/terminalStore";
import styles from "./FileTree.module.css";

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

function InlineInput({
  defaultValue,
  onSubmit,
  onCancel,
  depth,
}: {
  defaultValue: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  depth: number;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    if (defaultValue) {
      const dotIdx = defaultValue.lastIndexOf(".");
      ref.current?.setSelectionRange(0, dotIdx > 0 ? dotIdx : defaultValue.length);
    }
  }, [defaultValue]);

  return (
    <div className={styles.item} style={{ paddingLeft: 8 + depth * 16 }}>
      <span className={styles.chevronPlaceholder} />
      <input
        ref={ref}
        className={styles.inlineInput}
        defaultValue={defaultValue}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const val = (e.target as HTMLInputElement).value.trim();
            if (val) onSubmit(val);
            else onCancel();
          } else if (e.key === "Escape") {
            onCancel();
          }
        }}
        onBlur={(e) => {
          const val = e.target.value.trim();
          if (val && val !== defaultValue) onSubmit(val);
          else onCancel();
        }}
      />
    </div>
  );
}

interface ContextMenuState {
  position: { x: number; y: number };
  entry: FsEntry | null; // null = root context
}

function TreeItem({
  entry,
  depth,
  onContextMenu,
  renamingPath,
  setRenamingPath,
}: {
  entry: FsEntry;
  depth: number;
  onContextMenu: (e: React.MouseEvent, entry: FsEntry) => void;
  renamingPath: string | null;
  setRenamingPath: (p: string | null) => void;
}) {
  const { expandedDirs, toggleDir, setDirChildren, activeTabPath } =
    useWorkspaceStore();
  const openFile = useWorkspaceStore((s) => s.openFile);
  const isOpen = expandedDirs.has(entry.path);
  const isRenaming = renamingPath === entry.path;

  const [creating, setCreating] = useState<"file" | "dir" | null>(null);

  const handleClick = useCallback(async () => {
    if (entry.isDir) {
      toggleDir(entry.path);
      if (!isOpen && !entry.children) {
        try {
          const result = await invoke<RawFsEntry[]>("fs_list_dir", {
            path: entry.path,
          });
          setDirChildren(entry.path, toFsEntries(result));
        } catch (err) {
          console.error("fs_list error:", err);
        }
      }
    } else {
      try {
        const result = await invoke<{
          content: string;
          totalLines: number;
          language: string;
        }>("fs_read_file", { path: entry.path });
        openFile({
          path: entry.path,
          name: entry.name,
          content: result.content,
          isDirty: false,
          language: result.language,
        });
      } catch (err) {
        console.error("fs_read error:", err);
      }
    }
  }, [entry, isOpen, toggleDir, setDirChildren, openFile]);

  const handleRename = useCallback(
    async (newName: string) => {
      const parentDir = entry.path.substring(0, entry.path.lastIndexOf("/"));
      const newPath = `${parentDir}/${newName}`;
      try {
        await fsRename(entry.path, newPath);
        // Close tab if file was open under old path
        const ws = useWorkspaceStore.getState();
        if (ws.openTabs.find((t) => t.path === entry.path)) {
          ws.closeTab(entry.path);
        }
        ws.refreshFileTree();
      } catch (err) {
        console.error("rename error:", err);
        showError(`Rename failed: ${err}`);
      }
      setRenamingPath(null);
    },
    [entry.path, setRenamingPath],
  );

  const handleCreate = useCallback(
    async (name: string, type: "file" | "dir") => {
      const newPath = `${entry.path}/${name}`;
      try {
        if (type === "file") {
          await fsCreateFile(newPath);
        } else {
          await fsCreateDir(newPath);
        }
        useWorkspaceStore.getState().refreshFileTree();
      } catch (err) {
        console.error("create error:", err);
        showError(`Create failed: ${err}`);
      }
      setCreating(null);
    },
    [entry.path],
  );

  // Expose creating state for context menu
  const treeItemOnContextMenu = useCallback(
    (e: React.MouseEvent) => {
      onContextMenu(e, entry);
    },
    [entry, onContextMenu],
  );

  // Allow parent to trigger create on this dir
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail.path === entry.path) {
        setCreating(e.detail.type);
        // Ensure dir is expanded
        if (!expandedDirs.has(entry.path)) {
          toggleDir(entry.path);
        }
      }
    };
    window.addEventListener("tree-create" as any, handler as any);
    return () => window.removeEventListener("tree-create" as any, handler as any);
  }, [entry.path, expandedDirs, toggleDir]);

  const isActive = activeTabPath === entry.path;

  if (isRenaming) {
    return (
      <InlineInput
        defaultValue={entry.name}
        onSubmit={handleRename}
        onCancel={() => setRenamingPath(null)}
        depth={depth}
      />
    );
  }

  return (
    <>
      <div
        className={`${styles.item} ${isActive ? styles.itemActive : ""}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={handleClick}
        onContextMenu={treeItemOnContextMenu}
      >
        {entry.isDir ? (
          <svg
            className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
            viewBox="0 0 12 12"
          >
            <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        ) : (
          <span className={styles.chevronPlaceholder} />
        )}
        <span className={styles.icon}>
          <FileIcon name={entry.name} isDir={entry.isDir} isOpen={isOpen} />
        </span>
        <span className={`${styles.name} ${entry.isDir ? styles.dirName : ""}`}>
          {entry.name}
        </span>
      </div>
      {entry.isDir && isOpen && (
        <>
          {creating && (
            <InlineInput
              defaultValue=""
              onSubmit={(name) => handleCreate(name, creating)}
              onCancel={() => setCreating(null)}
              depth={depth + 1}
            />
          )}
          {entry.children?.map((child) => (
            <TreeItem
              key={child.path}
              entry={child}
              depth={depth + 1}
              onContextMenu={onContextMenu}
              renamingPath={renamingPath}
              setRenamingPath={setRenamingPath}
            />
          ))}
        </>
      )}
    </>
  );
}

export function FileTree() {
  const { fileTree, rootPath } = useWorkspaceStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [rootCreating, setRootCreating] = useState<"file" | "dir" | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FsEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ position: { x: e.clientX, y: e.clientY }, entry });
  }, []);

  const handleRootContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ position: { x: e.clientX, y: e.clientY }, entry: null });
  }, []);

  const getMenuItems = useCallback((): ContextMenuItem[] => {
    if (!contextMenu) return [];
    const { entry } = contextMenu;

    if (!entry) {
      // Root-level context menu
      return [
        {
          label: "New File",
          action: () => setRootCreating("file"),
        },
        {
          label: "New Folder",
          action: () => setRootCreating("dir"),
        },
      ];
    }

    const items: ContextMenuItem[] = [];

    if (entry.isDir) {
      items.push({
        label: "New File",
        action: () => {
          window.dispatchEvent(
            new CustomEvent("tree-create", { detail: { path: entry.path, type: "file" } }),
          );
        },
      });
      items.push({
        label: "New Folder",
        action: () => {
          window.dispatchEvent(
            new CustomEvent("tree-create", { detail: { path: entry.path, type: "dir" } }),
          );
        },
      });
      items.push({
        label: "Open Terminal Here",
        action: async () => {
          try {
            const ptyId = await ptyCreate(entry.path);
            useTerminalStore.getState().addTab(ptyId);
            useTerminalStore.getState().setVisible(true);
          } catch (err) {
            showError(`Failed to open terminal: ${err}`);
          }
        },
        dividerAfter: true,
      });
    }

    items.push({
      label: "Rename",
      action: () => setRenamingPath(entry.path),
    });

    items.push({
      label: "Delete",
      danger: true,
      action: async () => {
        const confirmed = await ask(`Delete "${entry.name}"?`, {
          title: "Confirm Delete",
          kind: "warning",
        });
        if (!confirmed) return;
        try {
          await fsDelete(entry.path);
          const ws = useWorkspaceStore.getState();
          if (!entry.isDir && ws.openTabs.find((t) => t.path === entry.path)) {
            ws.closeTab(entry.path);
          }
          ws.refreshFileTree();
        } catch (err) {
          console.error("delete error:", err);
        showError(`Delete failed: ${err}`);
        }
      },
    });

    return items;
  }, [contextMenu]);

  const handleRootCreate = useCallback(
    async (name: string, type: "file" | "dir") => {
      if (!rootPath) return;
      const newPath = `${rootPath}/${name}`;
      try {
        if (type === "file") {
          await fsCreateFile(newPath);
        } else {
          await fsCreateDir(newPath);
        }
        useWorkspaceStore.getState().refreshFileTree();
      } catch (err) {
        console.error("create error:", err);
        showError(`Create failed: ${err}`);
      }
      setRootCreating(null);
    },
    [rootPath],
  );

  if (!rootPath) {
    return (
      <div className={styles.tree} style={{ padding: 16, color: "var(--text-secondary)" }}>
        No folder open
      </div>
    );
  }

  return (
    <>
      <div
        id="file-tree"
        tabIndex={0}
        className={styles.tree}
        onContextMenu={handleRootContextMenu}
      >
        {rootCreating && (
          <InlineInput
            defaultValue=""
            onSubmit={(name) => handleRootCreate(name, rootCreating)}
            onCancel={() => setRootCreating(null)}
            depth={0}
          />
        )}
        {fileTree.map((entry) => (
          <TreeItem
            key={entry.path}
            entry={entry}
            depth={0}
            onContextMenu={handleContextMenu}
            renamingPath={renamingPath}
            setRenamingPath={setRenamingPath}
          />
        ))}
      </div>
      {contextMenu && (
        <ContextMenu
          items={getMenuItems()}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
