'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Film, ImageIcon, Loader2, Upload } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { mediaApi, uploadMedia } from '@/lib/api';
import type { MediaView } from '@/lib/types';

const KindIcon = ({ kind }: { kind: string }) =>
  kind === 'video' ? (
    <Film className="h-4 w-4" />
  ) : kind === 'file' ? (
    <FileText className="h-4 w-4" />
  ) : (
    <ImageIcon className="h-4 w-4" />
  );

function Thumb({ asset }: { asset: MediaView }) {
  if (asset.kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={asset.url} alt={asset.alt ?? ''} className="h-full w-full object-cover" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center text-text-muted">
      <KindIcon kind={asset.kind} />
    </div>
  );
}

/**
 * Shared media library dialog: browse, upload, and pick one asset. Used by the
 * editor's inline-image button (and reusable elsewhere). Filter by `kind` to
 * restrict the grid (e.g. images only for body images).
 */
export function MediaPickerDialog({
  open,
  onOpenChange,
  onPick,
  kind,
  title = 'Insert media',
  description = 'Pick an asset or upload a new one.',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (asset: MediaView) => void;
  kind?: 'image' | 'video' | 'file';
  title?: string;
  description?: string;
}) {
  const { projSlug } = useParams<{ projSlug: string }>();
  const queryClient = useQueryClient();
  const queryKey = ['media', projSlug];
  const inputRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey,
    queryFn: () => mediaApi.list({ limit: 100 }),
  });
  const assets = (data?.items ?? []).filter((a) => !kind || a.kind === kind);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadMedia(file),
    onSuccess: (asset) => {
      queryClient.invalidateQueries({ queryKey });
      onPick(asset);
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-brand-surface border-brand-border text-text-primary max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-text-primary">{title}</DialogTitle>
          <DialogDescription className="font-mono text-sm text-text-muted">
            {description}
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-brand-border py-3 font-mono text-sm font-bold text-text-secondary hover:border-brand-accent transition-colors disabled:opacity-60"
        >
          {uploadMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {uploadMutation.isPending ? 'Uploading…' : 'Upload new'}
          <input
            ref={inputRef}
            type="file"
            accept={kind === 'image' ? 'image/*' : undefined}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadMutation.mutate(f);
            }}
          />
        </button>

        <div className="grid max-h-72 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
          {assets.length === 0 ? (
            <p className="col-span-full py-6 text-center font-mono text-sm text-text-muted">
              No media yet.
            </p>
          ) : (
            assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => {
                  onPick(asset);
                  onOpenChange(false);
                }}
                className="relative aspect-square overflow-hidden rounded-lg border border-brand-border bg-brand-surface-soft transition-colors hover:border-brand-accent/40"
              >
                <Thumb asset={asset} />
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
