'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect } from 'react';
import { RICH_TEXT_EXTENSIONS } from '@/components/editor/extensions';

/**
 * Read-only TipTap renderer for the richtext preview. ProseMirror only emits
 * schema-valid nodes, so scripts/unknown tags in the model output are dropped
 * (safe by construction). Re-rendered when `html` changes.
 */
export function RichTextPreview({ html }: { html: string }) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: RICH_TEXT_EXTENSIONS,
    content: html,
  });
  useEffect(() => {
    if (editor) editor.commands.setContent(html, { emitUpdate: false });
  }, [html, editor]);
  if (!editor) return null;
  return (
    <EditorContent
      editor={editor}
      className="text-sm font-sans text-text-primary bg-brand-surface-soft border border-brand-border rounded-lg p-3 max-h-64 overflow-y-auto prose prose-sm max-w-none"
    />
  );
}
