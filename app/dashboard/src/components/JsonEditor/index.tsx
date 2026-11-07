import { useTheme } from "next-themes";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { monaco, XRAY_CONFIG_URI } from "./monaco";
import "./styles.css";

export type JsonEditorHandle = { format: () => Promise<void> };
export type JSONEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

export const JsonEditor = forwardRef<JsonEditorHandle, JSONEditorProps>(
  ({ value, onChange }, ref) => {
    const { theme } = useTheme();
    const colorMode = theme === "dark" ? "dark" : "light";
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(
      null
    );
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useImperativeHandle(ref, () => ({
      format: async () => {
        await editorRef.current
          ?.getAction("editor.action.formatDocument")
          ?.run();
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      const existing = monaco.editor.getModel(XRAY_CONFIG_URI);
      const model = existing
        ? (existing.getValue() !== value
            ? (existing.setValue(value), existing)
            : existing)
        : monaco.editor.createModel(value, "json", XRAY_CONFIG_URI);

      const overlay = document.createElement("div");
      overlay.className = `monaco-editor ${
        colorMode === "dark" ? "vs-dark" : "vs"
      } overflowingContentWidgets`;
      Object.assign(overlay.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "0",
        height: "0",
        overflow: "visible",
        zIndex: "2000",
      });
      document.body.appendChild(overlay);
      overlayRef.current = overlay;

      const editor = monaco.editor.create(containerRef.current, {
        model,
        automaticLayout: true,
        minimap: { enabled: false },
        tabSize: 4,
        insertSpaces: true,
        detectIndentation: false,
        formatOnPaste: true,
        formatOnType: true,
        autoIndent: "full",
        autoClosingBrackets: "always",
        autoClosingQuotes: "always",
        matchBrackets: "always",
        quickSuggestions: { other: true, comments: false, strings: true },
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnCommitCharacter: true,
        snippetSuggestions: "inline",
        suggest: {
          showWords: false,
          showSnippets: true,
          showProperties: true,
          showValues: true,
          showEnums: true,
          showEnumMembers: true,
        },
        tabCompletion: "on",
        wordWrap: "on",
        scrollBeyondLastLine: false,
        stickyScroll: { enabled: false },
        padding: { top: 8, bottom: 8 },
        fontSize: 13,
        lineNumbersMinChars: 3,
        folding: true,
        bracketPairColorization: { enabled: true },
        fixedOverflowWidgets: true,
        overflowWidgetsDomNode: overlay,
        hover: { enabled: true, delay: 150 },
        theme: colorMode === "dark" ? "vs-dark" : "vs",
      });
      editorRef.current = editor;
      editor.onDidChangeModelContent(() => {
        onChangeRef.current(editor.getValue());
      });

      return () => {
        editor.dispose();
        editorRef.current = null;
        model.dispose();
        overlay.remove();
        overlayRef.current = null;
      };
    }, []);

    useEffect(() => {
      const editor = editorRef.current;
      if (editor && editor.getValue() !== value) {
        editor.setValue(value);
      }
    }, [value]);

    useEffect(() => {
      const themeName = colorMode === "dark" ? "vs-dark" : "vs";
      monaco.editor.setTheme(themeName);
      if (overlayRef.current) {
        overlayRef.current.className = `monaco-editor ${themeName} overflowingContentWidgets`;
      }
    }, [colorMode]);

    return (
      <div className="h-full min-h-[300px] rounded-[5px] border border-gray-300 dark:border-gray-500">
        <div className="h-full min-h-[300px]" ref={containerRef} />
      </div>
    );
  }
);
