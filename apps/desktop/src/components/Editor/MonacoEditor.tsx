import { useRef, useCallback, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useRegionTags } from "./useRegionTags";

interface MonacoEditorProps {
  content: string;
  language: string;
  path: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}

export function MonacoEditor({
  content,
  language,
  path,
  readOnly = false,
  onChange,
}: MonacoEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [editorReady, setEditorReady] = useState<editor.IStandaloneCodeEditor | null>(null);
  useRegionTags(editorReady, path);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    setEditorReady(editor);

    // Tokyo Night theme
    monaco.editor.defineTheme("tide-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "565f89", fontStyle: "italic" },
        { token: "keyword", foreground: "9d7cd8" },
        { token: "keyword.control", foreground: "bb9af7" },
        { token: "string", foreground: "9ece6a" },
        { token: "string.escape", foreground: "89ddff" },
        { token: "number", foreground: "ff9e64" },
        { token: "type", foreground: "2ac3de" },
        { token: "type.identifier", foreground: "2ac3de" },
        { token: "function", foreground: "7aa2f7" },
        { token: "variable", foreground: "c0caf5" },
        { token: "variable.predefined", foreground: "7dcfff" },
        { token: "constant", foreground: "ff9e64" },
        { token: "operator", foreground: "89ddff" },
        { token: "delimiter", foreground: "9abdf5" },
        { token: "tag", foreground: "f7768e" },
        { token: "attribute.name", foreground: "bb9af7" },
        { token: "attribute.value", foreground: "9ece6a" },
        { token: "regexp", foreground: "b4f9f8" },
        { token: "annotation", foreground: "e0af68" },
        { token: "meta", foreground: "565f89" },
      ],
      colors: {
        "editor.background": "#13141c",
        "editor.foreground": "#a9b1d6",
        "editorLineNumber.foreground": "#2e3148",
        "editorLineNumber.activeForeground": "#565f89",
        "editor.selectionBackground": "#283050",
        "editor.lineHighlightBackground": "#181924",
        "editorCursor.foreground": "#c0caf5",
        "editor.findMatchBackground": "#3d59a1aa",
        "editor.findMatchHighlightBackground": "#3d59a155",
        "editorBracketMatch.background": "#13141c00",
        "editorBracketMatch.border": "#3b4261",
        "editorIndentGuide.background": "#232433",
        "editorIndentGuide.activeBackground": "#2e3148",
        "editorWidget.background": "#181924",
        "editorSuggestWidget.background": "#181924",
        "editorSuggestWidget.border": "#23243300",
        "editorSuggestWidget.selectedBackground": "#1e1f2e",
        "scrollbarSlider.background": "#2e314860",
        "scrollbarSlider.hoverBackground": "#3b426190",
      },
    });
    monaco.editor.setTheme("tide-dark");

    editor.focus();
  }, []);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined && onChange) {
        onChange(value);
      }
    },
    [onChange],
  );

  return (
    <Editor
      height="100%"
      language={language}
      value={content}
      path={path}
      theme="vs-dark"
      onMount={handleMount}
      onChange={handleChange}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: "var(--font-mono)",
        lineNumbers: "on",
        renderLineHighlight: "line",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: "off",
        padding: { top: 8 },
        glyphMargin: true,
      }}
    />
  );
}
