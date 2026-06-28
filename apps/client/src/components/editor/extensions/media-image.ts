import {
  mergeAttributes,
  Node,
  ReactNodeViewRenderer,
} from '@tiptap/react';
import { MediaImageView } from '../media-image-view';

export interface MediaImageAttrs {
  /** Source of truth — the media asset id. The URL is resolved at render/delivery. */
  assetId: string | null;
  alt: string | null;
}

/**
 * Body image node. Stores only the asset **id** (keys-only rule) — never a baked
 * URL. The editor NodeView resolves the id to a thumbnail for display; the
 * Delivery API resolves it to a public URL object at read time. This keeps body
 * content portable across CDN/transform changes, exactly like `media` fields.
 */
export const MediaImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      assetId: { default: null },
      alt: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'img[data-asset-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // Stored/exported HTML carries the reference, not a URL.
    return [
      'img',
      mergeAttributes({
        'data-asset-id': HTMLAttributes.assetId,
        alt: HTMLAttributes.alt ?? '',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaImageView);
  },
});
