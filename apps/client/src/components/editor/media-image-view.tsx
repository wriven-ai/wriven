'use client';

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { ImageOff, Loader2, Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { mediaApi } from '@/lib/api';

/**
 * React NodeView for the body `image` node. The node stores only `assetId`; this
 * resolves it to a live thumbnail for the editor. Delivery resolves the same id
 * to a public URL for consumers — the stored doc stays URL-free.
 */
export function MediaImageView({ node, deleteNode, selected }: NodeViewProps) {
  const { projSlug } = useParams<{ projSlug: string }>();
  const assetId = node.attrs.assetId as string | null;
  const alt = (node.attrs.alt as string | null) ?? '';

  const { data: asset, isLoading } = useQuery({
    queryKey: ['media-asset', projSlug, assetId],
    queryFn: () => mediaApi.get(assetId as string),
    enabled: !!assetId,
  });

  return (
    <NodeViewWrapper
      className={`my-3 overflow-hidden rounded-lg border bg-brand-surface-soft ${
        selected ? 'border-brand-accent ring-1 ring-brand-accent' : 'border-brand-border'
      }`}
      data-drag-handle
    >
      <div className="relative flex items-center justify-center">
        {isLoading ? (
          <div className="flex h-40 w-full items-center justify-center text-text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : asset?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.url}
            alt={alt || asset.alt || asset.originalFilename || ''}
            className="max-h-[420px] w-full object-contain"
          />
        ) : (
          <div className="flex h-40 w-full flex-col items-center justify-center gap-1 text-text-muted">
            <ImageOff className="h-6 w-6" />
            <span className="font-mono text-sm">Image not found</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => deleteNode()}
          contentEditable={false}
          className="absolute right-2 top-2 rounded bg-black/50 p-1 text-white hover:bg-status-error transition-colors"
          title="Remove image"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {(alt || asset?.alt) && (
        <p className="border-t border-brand-border px-3 py-1.5 text-center font-mono text-sm text-text-muted">
          {alt || asset?.alt}
        </p>
      )}
    </NodeViewWrapper>
  );
}
