'use client';

import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useState } from 'react';
import { EditorToolbar } from './editor-toolbar';
import { MediaImage } from './extensions/media-image';
import { MediaPickerDialog } from './media-picker-dialog';

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

/**
 * Normalize a stored field value to a ProseMirror document. Accepts both the
 * new JSON shape and legacy plain strings (old textarea values), so existing
 * entries keep working — blank lines become paragraphs.
 */
function toDoc(value: unknown): JSONContent {
  if (
    value &&
    typeof value === 'object' &&
    (value as JSONContent).type === 'doc'
  ) {
    return value as JSONContent;
  }
  if (typeof value === 'string' && value.trim()) {
    return {
      type: 'doc',
      content: value.split(/\n{2,}/).map((para) => ({
        type: 'paragraph',
        content: para ? [{ type: 'text', text: para }] : [],
      })),
    };
  }
  return EMPTY_DOC;
}

const CONTENT_CLASS = [
  'min-h-[440px] px-4 py-3 outline-none font-sans text-sm leading-relaxed text-text-primary',
  '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2',
  '[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2',
  '[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5',
  '[&_p]:my-2',
  '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-brand-border [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-text-secondary',
  '[&_code]:rounded [&_code]:bg-brand-surface-soft [&_code]:px-1 [&_code]:font-mono [&_code]:text-[11px]',
  '[&_pre]:rounded-lg [&_pre]:bg-text-primary [&_pre]:text-brand-surface-soft [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs [&_pre]:my-3',
  '[&_a]:text-brand-accent [&_a]:underline',
  '[&_.is-editor-empty:first-child::before]:text-text-muted [&_.is-editor-empty:first-child::before]:[content:attr(data-placeholder)] [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:h-0',
].join(' ');

/**
 * Structured rich-text editor (TipTap / ProseMirror). Emits ProseMirror JSON —
 * the portable, render-target-agnostic format the CMS stores and the Delivery
 * API returns as-is.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: unknown;
  onChange: (json: JSONContent) => void;
  placeholder?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const editor = useEditor({
    immediatelyRender: false, // avoid SSR hydration mismatch in Next.js
    extensions: [
      StarterKit,
      MediaImage,
      Placeholder.configure({ placeholder: placeholder ?? 'Write…' }),
    ],
    content: toDoc(value),
    editorProps: { attributes: { class: CONTENT_CLASS } },
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });

  // Reset content when the external value changes identity (e.g. switching
  // entries). Guard against the editor's own updates to avoid a feedback loop.
  useEffect(() => {
    if (!editor) return;
    const incoming = JSON.stringify(toDoc(value));
    if (incoming !== JSON.stringify(editor.getJSON())) {
      editor.commands.setContent(toDoc(value), { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-brand-border bg-brand-surface">
      <EditorToolbar editor={editor} onInsertImage={() => setPickerOpen(true)} />
      <EditorContent editor={editor} />
      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind="image"
        title="Insert image"
        description="Pick an image or upload a new one. Inserted at the cursor."
        onPick={(asset) =>
          editor
            .chain()
            .focus()
            .insertContent({
              type: 'image',
              attrs: { assetId: asset.id, alt: asset.alt },
            })
            .run()
        }
      />
    </div>
  );
}
