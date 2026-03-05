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
  readOnly = true,
  onChange,
}: MonacoEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [editorReady, setEditorReady] = useState<editor.IStandaloneCodeEditor | null>(null);
  useRegionTags(editorReady, path);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    setEditorReady(editor);

    // Customize VS Dark theme with Tide overrides
    monaco.editor.defineTheme("tide-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#1e1e1e",
        "editor.foreground": "#cccccc",
        "editorLineNumber.foreground": "#858585",
        "editorLineNumber.activeForeground": "#cccccc",
        "editor.selectionBackground": "#264f78",
        "editor.lineHighlightBackground": "#2a2d2e",
        "editorCursor.foreground": "#aeafad",
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
