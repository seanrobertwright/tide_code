import { useEffect, useRef } from "react";
import { KeyMod, KeyCode } from "monaco-editor";
import type { editor, IDisposable } from "monaco-editor";
import { useRegionTagStore } from "../../stores/regionTagStore";
import { emitSnippet } from "../AgentPanel/AgentPanel";

/** Detect language from file extension */
function langFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    rs: "rust", py: "python", go: "go", java: "java",
    css: "css", html: "html", json: "json", md: "markdown",
    sh: "bash", yml: "yaml", yaml: "yaml", toml: "toml",
  };
  return map[ext] ?? ext;
}

export function useRegionTags(
  editorInstance: editor.IStandaloneCodeEditor | null,
  filePath: string,
) {
  const { getTagsForFile, loadTagsForFile } = useRegionTagStore();
  const decorationsRef = useRef<string[]>([]);

  // Load tags when file changes
  useEffect(() => {
    if (filePath) loadTagsForFile(filePath);
  }, [filePath, loadTagsForFile]);

  // Apply decorations for existing persistent tags
  useEffect(() => {
    if (!editorInstance) return;

    const tags = getTagsForFile(filePath);
    const staleTags = useRegionTagStore.getState().staleTags;

    const decorations: editor.IModelDeltaDecoration[] = tags.map((tag) => {
      const isStale = staleTags.has(tag.id);
      const isPinned = tag.pinned;
      return {
        range: {
          startLineNumber: tag.startLine,
          startColumn: tag.startColumn,
          endLineNumber: tag.endLine,
          endColumn: tag.endColumn,
        },
        options: {
          className: isPinned ? "region-tag-pinned" : "region-tag-unpinned",
          glyphMarginClassName: isStale ? "region-tag-glyph-stale" : "region-tag-glyph",
          hoverMessage: {
            value: `**${tag.label}**${tag.note ? `\n\n${tag.note}` : ""}${isPinned ? "\n\nPinned" : ""}${isStale ? "\n\nStale" : ""}`,
          },
          isWholeLine: false,
        },
      };
    });

    decorationsRef.current = editorInstance.deltaDecorations(
      decorationsRef.current,
      decorations,
    );
  }, [editorInstance, filePath, getTagsForFile]);

  // Register Cmd+Shift+T: insert snippet directly into chat composer
  useEffect(() => {
    if (!editorInstance) return;

    const disposable: IDisposable = editorInstance.addAction({
      id: "tide.tagRegion",
      label: "Send to Chat",
      // eslint-disable-next-line no-bitwise
      keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyT],
      run: (ed) => {
        const selection = ed.getSelection();
        if (!selection || selection.isEmpty()) return;

        const model = ed.getModel();
        if (!model) return;

        const selectedText = model.getValueInRange(selection);
        if (!selectedText.trim()) return;

        const fileName = filePath.split("/").pop() ?? filePath;
        const label = `${fileName}:${selection.startLineNumber}-${selection.endLineNumber}`;

        emitSnippet({
          id: `snip-${Date.now()}`,
          label,
          code: selectedText,
          lang: langFromPath(filePath),
          filePath,
          startLine: selection.startLineNumber,
          endLine: selection.endLineNumber,
        });
      },
    });

    return () => disposable.dispose();
  }, [editorInstance, filePath]);
}
