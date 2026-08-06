'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUpRight,
  Check,
  Eye,
  File,
  Film,
  Grid,
  Info,
  Layers,
  List,
  Maximize2,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ApiRequestError, mediaApi, uploadMedia } from '@/lib/api';
import type { MediaView } from '@/lib/types';
import { useCan } from '@/components/sidebar/use-can';
import { Permission } from '@wriven/contracts/rbac';
import { NoAccess } from '@/components/auth/no-access';

const fmtSize = (bytes: number | null): string => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const fmtDate = (iso: string): string => {
  try {
    return new Date(iso).toISOString().replace('T', ' ').substring(0, 16);
  } catch {
    return iso;
  }
};

const QUOTA_BYTES = 100 * 1024 * 1024; // per-workspace quota: 100 MB

const KindIcon = ({ kind }: { kind: string }) =>
  kind === 'video' ? (
    <Film className="w-8 h-8 text-brand-secondary" />
  ) : (
    <File className="w-8 h-8 text-brand-secondary" />
  );

export default function MediaLibraryPage() {
  const { projSlug } = useParams<{ projSlug: string }>();
  const queryClient = useQueryClient();
  const queryKey = ['media', projSlug];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const can = useCan();
  const canManage = can(Permission.MEDIA_MANAGE);

  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<MediaView | null>(null);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => mediaApi.list({ limit: 60 }),
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) await uploadMedia(file);
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : (err as Error).message),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => mediaApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const assets = useMemo<MediaView[]>(() => data?.items ?? [], [data]);

  const filteredAssets = useMemo(
    () =>
      assets.filter((a) =>
        (a.originalFilename ?? a.id).toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [assets, searchQuery],
  );

  const selectedAsset =
    assets.find((a) => a.id === selectedId) ?? filteredAssets[0] ?? null;

  const usedBytes = useMemo(
    () => assets.reduce((sum, a) => sum + (a.sizeBytes ?? 0), 0),
    [assets],
  );
  const usedPct = Math.min(100, (usedBytes / QUOTA_BYTES) * 100);

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const handleFiles = (files: FileList | null) => {
    if (!canManage) return;
    if (files && files.length) uploadMutation.mutate(Array.from(files));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this asset?')) removeMutation.mutate(id);
  };

  const copyText = (text: string, id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!canManage) return <NoAccess />;

  return (
    <div className="space-y-8 text-left" id="media-library-workspace">
      {/* Page Header */}
      <div className="border-b border-brand-border pb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
            Universal <span className="font-normal italic text-brand-secondary">Media CDN Library</span>
          </h1>
          <p className="text-sm sm:text-sm font-mono text-text-muted mt-1 leading-relaxed">
            {'// Upload assets and reference them from media fields'}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-status-error/10 border border-status-error/30 text-status-error text-sm font-mono rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Controls & Asset Grid */}
        <div className="lg:col-span-8 space-y-5">
          {/* Top Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-surface border border-brand-border p-4 rounded-xl">
            <div className="flex items-center gap-2 bg-brand-surface-soft border border-brand-border px-3.5 py-1.5 rounded-lg text-text-secondary focus-within:border-brand-accent transition-all duration-150 w-full sm:max-w-xs">
              <Search className="w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                placeholder="Search assets by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none text-sm font-mono outline-hidden w-full placeholder:text-text-muted/65 text-text-primary"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'border-brand-accent text-brand-accent bg-brand-accent/5'
                    : 'border-brand-border text-text-secondary hover:bg-brand-surface-soft'
                }`}
                title="Grid View"
              >
                <Grid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'border-brand-accent text-brand-accent bg-brand-accent/5'
                    : 'border-brand-border text-text-secondary hover:bg-brand-surface-soft'
                }`}
                title="List View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Drag & Drop Upload Zone */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer relative ${
              dragActive
                ? 'border-brand-accent bg-brand-accent/5 text-brand-accent'
                : 'border-brand-border hover:border-brand-accent/40 bg-brand-surface/40 hover:bg-brand-surface/70'
            }`}
            onClick={() => fileInputRef.current?.click()}
            id="drag-drop-uploader"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
            />

            <div className="flex flex-col items-center justify-center space-y-2.5">
              <div className="w-10 h-10 rounded-full bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center text-brand-accent">
                {uploadMutation.isPending ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  >
                    <Upload className="w-5 h-5 text-brand-accent" />
                  </motion.div>
                ) : (
                  <Upload className="w-5 h-5" />
                )}
              </div>
              <div>
                <p className="text-sm font-mono font-bold text-text-primary tracking-wide">
                  {uploadMutation.isPending ? 'Uploading assets…' : 'Drag and drop assets here'}
                </p>
                <p className="text-sm font-mono text-text-muted mt-1">
                  Or click to browse — images up to 5 MB, other files up to 25 MB
                </p>
              </div>
            </div>
          </div>

          {/* Assets Inventory Display */}
          {isLoading ? (
            <div className="bg-brand-surface border border-brand-border p-12 text-center rounded-xl font-mono text-sm text-text-muted">
              Loading assets…
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="bg-brand-surface border border-brand-border p-12 text-center rounded-xl font-mono text-sm text-text-muted">
              {assets.length === 0
                ? 'No media yet — upload your first asset.'
                : 'No matching assets.'}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4" id="media-assets-grid">
              {filteredAssets.map((asset) => {
                const isImage = asset.kind === 'image';
                const isSelected = selectedAsset?.id === asset.id;
                const name = asset.originalFilename ?? asset.id;

                return (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedId(asset.id)}
                    className={`bg-brand-surface border rounded-xl overflow-hidden cursor-pointer transition-all ${
                      isSelected
                        ? 'border-brand-accent ring-1 ring-brand-accent'
                        : 'border-brand-border hover:border-brand-accent/30'
                    }`}
                  >
                    <div className="h-28 bg-brand-surface-soft relative flex items-center justify-center overflow-hidden border-b border-brand-border-button">
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={asset.url} alt={name} className="w-full h-full object-cover" />
                      ) : (
                        <KindIcon kind={asset.kind} />
                      )}

                      <div className="absolute top-2 right-2 flex gap-1">
                        {isImage && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setLightbox(asset);
                            }}
                            className="p-1 rounded bg-black/50 hover:bg-black/80 text-white transition-colors"
                            title="View fullscreen"
                          >
                            <Maximize2 className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={(e) => copyText(asset.id, asset.id, e)}
                          className="p-1 rounded bg-black/50 hover:bg-black/80 text-white transition-colors"
                          title="Copy asset ID"
                        >
                          {copiedId === asset.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Eye className="w-3 h-3" />
                          )}
                        </button>
                        {canManage && (
                          <button
                            onClick={(e) => handleDelete(asset.id, e)}
                            className="p-1 rounded bg-black/50 hover:bg-status-error text-white transition-colors"
                            title="Delete Asset"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-3 text-left">
                      <p
                        className="text-sm font-mono font-bold text-text-primary truncate block"
                        title={name}
                      >
                        {name}
                      </p>
                      <div className="flex justify-between items-center text-sm font-mono text-text-muted mt-1 leading-none font-medium">
                        <span>{fmtSize(asset.sizeBytes)}</span>
                        {asset.width && <span>{asset.width}px</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              className="bg-brand-surface border border-brand-border rounded-xl divide-y divide-brand-border"
              id="media-assets-list"
            >
              {filteredAssets.map((asset) => {
                const isImage = asset.kind === 'image';
                const isSelected = selectedAsset?.id === asset.id;
                const name = asset.originalFilename ?? asset.id;

                return (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedId(asset.id)}
                    className={`p-3.5 flex items-center justify-between gap-4 cursor-pointer transition-colors ${
                      isSelected ? 'bg-brand-accent/5' : 'hover:bg-brand-surface-soft/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded border border-brand-border bg-brand-surface-soft shrink-0 flex items-center justify-center overflow-hidden">
                        {isImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={asset.url} alt={name} className="w-full h-full object-cover" />
                        ) : (
                          <File className="w-4 h-4 text-brand-secondary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-mono font-bold text-text-primary truncate">{name}</p>
                        <p className="text-sm font-mono text-text-muted">
                          {asset.mime ?? asset.kind} • {fmtDate(asset.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 text-sm font-mono">
                      <span className="text-text-secondary">{fmtSize(asset.sizeBytes)}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => copyText(asset.id, asset.id, e)}
                          className="p-1 px-1.5 bg-brand-surface border border-brand-border hover:border-brand-accent rounded text-text-secondary hover:text-brand-accent text-sm font-bold"
                        >
                          {copiedId === asset.id ? 'Copied' : 'ID'}
                        </button>
                        {canManage && (
                          <button
                            onClick={(e) => handleDelete(asset.id, e)}
                            className="p-1.5 border border-brand-border bg-brand-surface hover:bg-status-error/10 hover:text-status-error text-text-muted rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: Asset Inspector */}
        <div className="lg:col-span-4" id="asset-inspector-pane">
          <AnimatePresence mode="wait">
            {selectedAsset ? (
              <motion.div
                key={selectedAsset.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="bg-brand-surface border border-brand-border rounded-xl p-5 shadow-sm space-y-4 text-left"
              >
                <span className="text-sm font-mono tracking-wider text-text-secondary border-b border-brand-border pb-2.5 font-bold flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-brand-secondary" />
                  Asset Insight Metrics
                </span>

                {/* Preview (click to fullscreen) */}
                <div className="border border-brand-border rounded-xl bg-brand-surface-soft p-2.5 overflow-hidden flex items-center justify-center max-h-48 relative group">
                  {selectedAsset.kind === 'image' ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedAsset.url}
                        alt={selectedAsset.alt ?? selectedAsset.originalFilename ?? ''}
                        className="max-h-40 max-w-full rounded object-contain neo-shadow cursor-zoom-in"
                        onClick={() => setLightbox(selectedAsset)}
                      />
                      <button
                        onClick={() => setLightbox(selectedAsset)}
                        className="absolute top-2 right-2 p-1.5 rounded bg-black/50 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="View fullscreen"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <div className="h-32 w-full flex flex-col items-center justify-center border border-dashed border-brand-border rounded-lg text-text-secondary space-y-2">
                      <KindIcon kind={selectedAsset.kind} />
                      <span className="text-sm font-mono tracking-wide uppercase">
                        {selectedAsset.kind} file
                      </span>
                    </div>
                  )}
                </div>

                {/* Metrics */}
                <div className="space-y-3 font-mono text-sm border-t border-brand-border-button pt-4">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Asset ID:</span>
                    <strong
                      className="text-text-primary truncate max-w-[180px]"
                      title={selectedAsset.id}
                    >
                      {selectedAsset.id}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">File Name:</span>
                    <strong
                      className="text-text-primary truncate max-w-[180px]"
                      title={selectedAsset.originalFilename ?? ''}
                    >
                      {selectedAsset.originalFilename ?? '—'}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Content-Type:</span>
                    <strong className="text-text-secondary uppercase text-sm">
                      {selectedAsset.mime ?? selectedAsset.kind}
                    </strong>
                  </div>
                  {selectedAsset.width && (
                    <div className="flex justify-between">
                      <span className="text-text-muted">Dimensions:</span>
                      <strong className="text-text-primary">
                        {selectedAsset.width} × {selectedAsset.height}
                      </strong>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-text-muted">Size:</span>
                    <strong className="text-text-primary">{fmtSize(selectedAsset.sizeBytes)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Uploaded:</span>
                    <strong className="text-text-primary">{fmtDate(selectedAsset.createdAt)}</strong>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-2 pt-3 border-t border-brand-border">
                  <a
                    href={selectedAsset.url}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full inline-flex items-center justify-center gap-1.5 border border-brand-border hover:bg-brand-surface-soft text-text-primary font-mono font-bold text-sm uppercase tracking-wider py-2.5 rounded-lg cursor-pointer transition-all"
                  >
                    Open raw CDN file
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={(e) => copyText(selectedAsset.id, selectedAsset.id, e)}
                    className="w-full inline-flex items-center justify-center gap-1.5 bg-brand-secondary hover:bg-brand-secondary/90 text-white border border-brand-border-button font-mono font-bold text-sm uppercase tracking-wider py-2.5 rounded-lg cursor-pointer transition-all"
                  >
                    {copiedId === selectedAsset.id ? 'ASSET ID COPIED!' : 'COPY ASSET ID'}
                  </button>
                </div>
              </motion.div>
            ) : (
              <div className="bg-brand-surface border border-brand-border rounded-xl p-6 text-center font-mono text-sm text-text-muted">
                <Info className="w-8 h-8 text-brand-secondary mx-auto mb-2" />
                Select a media asset to view details and copy its reference ID.
              </div>
            )}
          </AnimatePresence>

          {/* Quota banner */}
          <div className="bg-brand-surface border border-brand-border p-4 rounded-xl shadow-xs text-left mt-4 font-mono text-sm leading-relaxed">
            <span className="text-sm font-mono tracking-widest text-brand-accent uppercase border-b border-brand-border pb-2 mb-2 font-bold flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-brand-accent" />
              Storage usage
            </span>
            <div className="flex items-center justify-between text-sm mb-1 font-bold">
              <span className="text-text-secondary">
                {fmtSize(usedBytes)} / 100 MB
              </span>
              <span className="text-brand-accent">{usedPct.toFixed(1)}% Used</span>
            </div>
            <div className="w-full h-1.5 bg-brand-surface-soft border border-brand-border rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-accent transition-all duration-300"
                style={{ width: `${Math.max(usedPct, 0.5)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6 cursor-zoom-out"
          >
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.url}
              alt={lightbox.alt ?? lightbox.originalFilename ?? ''}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl cursor-default"
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-black/60 text-white font-mono text-sm">
              {lightbox.originalFilename ?? lightbox.id}
              {lightbox.width ? ` · ${lightbox.width}×${lightbox.height}` : ''}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
