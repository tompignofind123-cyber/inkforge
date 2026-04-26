import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

export interface NovelEditorProps {
  value: string;
  onChange: (plainText: string, html: string) => void;
  placeholder?: string;
  autofocus?: boolean;
  className?: string;
  onEditorReady?: (editor: Editor | null) => void;
}

export function NovelEditor(props: NovelEditorProps): JSX.Element {
  const { value, onChange, placeholder, autofocus, className, onEditorReady } = props;

  const editor = useEditor({
    extensions: [StarterKit.configure({ history: { depth: 200 } })],
    content: value,
    autofocus: autofocus ?? false,
    editorProps: {
      attributes: {
        class:
          className ??
          "prose prose-lg max-w-none px-8 py-6 focus:outline-none text-base leading-8 text-slate-100",
        spellcheck: "false",
        "data-placeholder": placeholder ?? "",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getText(), editor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    // `value` mirrors editor.getText() (plain text, see onUpdate). Compare in the
    // same dimension so we only resync when an EXTERNAL source mutated `value`,
    // never because of the ambient HTML-vs-plaintext mismatch. Without this, any
    // blur (toolbar button, menu, etc.) would trigger setContent and flatten the
    // editor's structured HTML back to plain text — appearing as "content vanished".
    const currentText = editor.getText();
    if (value === currentText) return;
    if (editor.isFocused) return;
    editor.commands.setContent(value, false);
  }, [editor, value]);

  useEffect(() => {
    onEditorReady?.(editor ?? null);
    return () => {
      onEditorReady?.(null);
    };
  }, [editor, onEditorReady]);

  return <EditorContent editor={editor} />;
}
