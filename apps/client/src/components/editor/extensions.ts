import Link from '@tiptap/extension-link';
import StarterKit from '@tiptap/starter-kit';
import { MediaImage } from './extensions/media-image';

/**
 * The ONE TipTap schema for richtext in this app — the editor, the AI panel's
 * HTML↔JSON serialization, and every preview.
 *
 * Serializing a document with any narrower extension set throws
 * `Unknown node type` on nodes the editor can create (e.g. images) — which the
 * AI panel used to swallow, reading image-bearing fields as empty and deleting
 * their content on Append. Import this everywhere; never construct a
 * second `[StarterKit, …]` array.
 *
 * `Placeholder` is intentionally excluded — it is editor-only chrome.
 */
export const RICH_TEXT_EXTENSIONS = [
  StarterKit,
  Link.configure({
    HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
  }),
  MediaImage,
];
