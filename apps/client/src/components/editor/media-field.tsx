'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FileText, Film, ImageIcon, Loader2, Plus, Upload, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
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

function Thumb({ asset }: { asset?: MediaView }) {
  if (asset?.kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={asset.url}
        alt={asset.alt ?? ''}
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center text-text-muted">
      <KindIcon kind={asset?.kind ?? 'file'} />
    </div>
  );
}

/**
 * Editor control for `media` fields. Stores the media asset **id** (or array of
 * ids when multiple). Opens the project's library to pick or upload.
 */
export function MediaField({
  value,
  onChange,
  multiple,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  multiple?: boolean;
}) {
  const { projSlug } = useParams<{ projSlug: string }>();
  const queryClient = useQueryClient();
  const queryKey = ['media', projSlug];
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey,
    queryFn: () => mediaApi.list({ limit: 100 }),
  });
  const assets = data?.items ?? [];
  const byId = new Map(assets.map((a) => [a.id, a] as const));

  const selectedIds: string[] = multiple
    ? Array.isArray(value)
      ? value.map(String)
      : []
    : typeof value === 'string' && value
      ? [value]
      : [];

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadMedia(file),
    onSuccess: (asset) => {
      queryClient.invalidateQueries({ queryKey });
      pick(asset.id);
    },
  });

  const pick = (id: string) => {
    if (multiple) {
      const set = new Set(selectedIds);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      onChange([...set]);
    } else {
      onChange(id);
      setOpen(false);
    }
  };

  const unselect = (id: string) => {
    if (multiple) onChange(selectedIds.filter((x) => x !== id));
    else onChange(undefined);
  };

  return (
    <div className="space-y-2">
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedIds.map((id) => (
            <div
              key={id}
              className="relative h-16 w-16 overflow-hidden rounded-lg border border-brand-border bg-brand-surface-soft"
            >
              <Thumb asset={byId.get(id)} />
              <button
                type="button"
                onClick={() => unselect(id)}
                className="absolute right-0.5 top-0.5 rounded bg-black/50 p-0.5 text-white hover:bg-black/70"
                aria-label="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-surface-soft px-3 py-2 font-mono text-sm font-bold text-text-secondary hover:border-brand-accent hover:text-brand-accent transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        {selectedIds.length > 0
          ? multiple
            ? 'Add / change'
            : 'Change'
          : 'Select media'}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-brand-surface border-brand-border text-text-primary max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-text-primary">
              Media library
            </DialogTitle>
            <DialogDescription className="font-mono text-sm text-text-muted">
              Pick an asset or upload a new one.
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
              assets.map((asset) => {
                const active = selectedIds.includes(asset.id);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => pick(asset.id)}
                    className={`relative aspect-square overflow-hidden rounded-lg border bg-brand-surface-soft transition-colors ${
                      active
                        ? 'border-brand-accent ring-1 ring-brand-accent'
                        : 'border-brand-border hover:border-brand-accent/40'
                    }`}
                  >
                    <Thumb asset={asset} />
                    {active && (
                      <span className="absolute right-1 top-1 rounded-full bg-brand-accent p-0.5 text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
