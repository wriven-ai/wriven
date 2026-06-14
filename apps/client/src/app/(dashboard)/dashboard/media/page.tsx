'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Image as ImageIcon, 
  Upload, 
  Trash2, 
  Search, 
  File, 
  Grid, 
  List, 
  ExternalLink, 
  Check, 
  Sparkles, 
  Eye, 
  Layers,
  FileImage,
  ArrowUpRight,
  Info
} from 'lucide-react';

interface MediaAsset {
  id: string;
  name: string;
  size: string;
  type: string;
  url: string;
  dimensions?: string;
  uploadedAt: string;
}

export default function MediaLibraryPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([
    {
      id: 'm1',
      name: 'hero-space-banner-compress.jpg',
      size: '284 KB',
      type: 'image/jpeg',
      url: 'https://picsum.photos/seed/hero/1200/600',
      dimensions: '1200 × 600',
      uploadedAt: '2026-06-01 14:22'
    },
    {
      id: 'm2',
      name: 'author-profile-anowar.png',
      size: '95 KB',
      type: 'image/png',
      url: 'https://picsum.photos/seed/profile/400/400',
      dimensions: '400 × 400',
      uploadedAt: '2026-06-03 09:11'
    },
    {
      id: 'm3',
      name: 'product-feature-isometric.png',
      size: '1.2 MB',
      type: 'image/png',
      url: 'https://picsum.photos/seed/feature/800/800',
      dimensions: '800 × 800',
      uploadedAt: '2026-06-05 17:45'
    },
    {
      id: 'm4',
      name: 'wriven-v2-brochure.pdf',
      size: '4.5 MB',
      type: 'application/pdf',
      url: '#',
      uploadedAt: '2026-06-07 11:30'
    }
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(assets[0]);
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = (files: FileList) => {
    setIsUploading(true);
    
    // Simulate API upload delay
    setTimeout(() => {
      const newAssets: MediaAsset[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isImage = file.type.startsWith('image/');
        const newAsset: MediaAsset = {
          id: 'm_' + Math.floor(Math.random() * 1000).toString(),
          name: file.name,
          size: file.size > 1024 * 1024 
            ? (file.size / (1024 * 1024)).toFixed(1) + ' MB' 
            : (file.size / 1024).toFixed(0) + ' KB',
          type: file.type || 'application/octet-stream',
          url: isImage ? URL.createObjectURL(file) : '#',
          dimensions: isImage ? '1024 × 768 (Auto)' : undefined,
          uploadedAt: new Date().toISOString().replace('T', ' ').substring(0, 16)
        };
        newAssets.push(newAsset);
      }
      
      setAssets(prev => [newAssets[0], ...prev]);
      setSelectedAsset(newAssets[0]);
      setIsUploading(false);
    }, 1500);
  };

  const handleDeleteAsset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = assets.filter(a => a.id !== id);
    setAssets(filtered);
    if (selectedAsset?.id === id) {
      setSelectedAsset(filtered[0] || null);
    }
  };

  const copyUrlToClipboard = (url: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredAssets = assets.filter(asset => 
    asset.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 text-left" id="media-library-workspace">
      
      {/* Page Header */}
      <div className="border-b border-brand-border pb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
            Universal <span className="font-normal italic text-brand-secondary">Media CDN Library</span>
          </h1>
          <p className="text-2xs sm:text-xs font-mono text-text-muted mt-1 leading-relaxed">
            {"// Transcode and serve rich multimedia assets from secure edge memory"}
          </p>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Controls & Asset Grid */}
        <div className="lg:col-span-8 space-y-5">
          
          {/* Top Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-surface border border-brand-border p-4 rounded-xl">
            {/* Search Input */}
            <div className="flex items-center gap-2 bg-brand-surface-soft border border-brand-border px-3.5 py-1.5 rounded-lg text-text-secondary focus-within:border-brand-accent transition-all duration-150 w-full sm:max-w-xs">
              <Search className="w-3.5 h-3.5 text-text-muted" />
              <input 
                type="text" 
                placeholder="Search assets by name..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none text-2xs font-mono outline-hidden w-full placeholder:text-text-muted/65 text-text-primary"
              />
            </div>

            {/* Layout switch filters */}
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
            onClick={onButtonClick}
            id="drag-drop-uploader"
          >
            <input 
              ref={fileInputRef}
              type="file" 
              multiple 
              onChange={handleFileInput}
              className="hidden" 
              accept="image/*,application/pdf"
            />
            
            <div className="flex flex-col items-center justify-center space-y-2.5">
              <div className="w-10 h-10 rounded-full bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center text-brand-accent">
                {isUploading ? (
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
                <p className="text-2xs font-mono font-bold text-text-primary tracking-wide">
                  {isUploading ? 'Uploading file structures...' : 'Drag and drop assets here'}
                </p>
                <p className="text-[10px] font-mono text-text-muted mt-1">
                  Or click to browse your disk files (Supported: PNG, JPEG, SVG, PDF up to 25MB)
                </p>
              </div>
            </div>
          </div>

          {/* Assets Inventory Display */}
          {filteredAssets.length === 0 ? (
            <div className="bg-brand-surface border border-brand-border p-12 text-center rounded-xl font-mono text-xs text-text-muted">
              No matching assets registered in this Wriven node CDN database.
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid View */
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4" id="media-assets-grid">
              {filteredAssets.map(asset => {
                const isImage = asset.type.startsWith('image/');
                const isSelected = selectedAsset?.id === asset.id;
                
                return (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    className={`bg-brand-surface border rounded-xl overflow-hidden cursor-pointer transition-all ${
                      isSelected 
                        ? 'border-brand-accent ring-1 ring-brand-accent' 
                        : 'border-brand-border hover:border-brand-accent/30'
                    }`}
                  >
                    {/* Visual box */}
                    <div className="h-28 bg-brand-surface-soft relative flex items-center justify-center overflow-hidden border-b border-brand-border-button">
                      {isImage ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img 
                          src={asset.url} 
                          alt={asset.name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <File className="w-8 h-8 text-brand-secondary" />
                      )}
                      
                      <div className="absolute top-2 right-2 flex gap-1">
                        <button
                          onClick={(e) => copyUrlToClipboard(asset.url, asset.id, e)}
                          className="p-1 rounded bg-black/50 hover:bg-black/80 text-white transition-colors"
                          title="Copy Link URL"
                        >
                          {copiedId === asset.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <ExternalLink className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          onClick={(e) => handleDeleteAsset(asset.id, e)}
                          className="p-1 rounded bg-black/50 hover:bg-status-error text-white transition-colors"
                          title="Delete Asset"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Metadata text */}
                    <div className="p-3 text-left">
                      <p className="text-[10.5px] font-mono font-bold text-text-primary truncate block" title={asset.name}>
                        {asset.name}
                      </p>
                      <div className="flex justify-between items-center text-[9px] font-mono text-text-muted mt-1 leading-none font-medium">
                        <span>{asset.size}</span>
                        {asset.dimensions && <span>{asset.dimensions.split(' ')[0]}px</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List View */
            <div className="bg-brand-surface border border-brand-border rounded-xl divide-y divide-brand-border" id="media-assets-list">
              {filteredAssets.map(asset => {
                const isImage = asset.type.startsWith('image/');
                const isSelected = selectedAsset?.id === asset.id;

                return (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    className={`p-3.5 flex items-center justify-between gap-4 cursor-pointer transition-colors ${
                      isSelected ? 'bg-brand-accent/5' : 'hover:bg-brand-surface-soft/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded border border-brand-border bg-brand-surface-soft shrink-0 flex items-center justify-center overflow-hidden">
                        {isImage ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
                        ) : (
                          <File className="w-4 h-4 text-brand-secondary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-2xs font-mono font-bold text-text-primary truncate">{asset.name}</p>
                        <p className="text-[9px] font-mono text-text-muted">{asset.type} • {asset.uploadedAt}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 text-2xs font-mono">
                      <span className="text-text-secondary">{asset.size}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => copyUrlToClipboard(asset.url, asset.id, e)}
                          className="p-1 px-1.5 bg-brand-surface border border-brand-border hover:border-brand-accent rounded text-text-secondary hover:text-brand-accent text-[9px] font-bold"
                        >
                          {copiedId === asset.id ? 'Copied' : 'Link'}
                        </button>
                        <button
                          onClick={(e) => handleDeleteAsset(asset.id, e)}
                          className="p-1.5 border border-brand-border bg-brand-surface hover:bg-status-error/10 hover:text-status-error text-text-muted rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
                <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-brand-secondary" />
                  Asset Insight Metrics
                </span>

                {/* Cover Asset Image Preview strictly layout defined */}
                <div className="border border-brand-border rounded-xl bg-brand-surface-soft p-2.5 overflow-hidden flex items-center justify-center max-h-48">
                  {selectedAsset.type.startsWith('image/') ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img 
                      src={selectedAsset.url} 
                      alt={selectedAsset.name} 
                      className="max-h-40 max-w-full rounded object-contain neo-shadow pattern-grid"
                    />
                  ) : (
                    <div className="h-32 w-full flex flex-col items-center justify-center border border-dashed border-brand-border rounded-lg text-text-secondary space-y-2">
                      <File className="w-8 h-8 text-brand-secondary" />
                      <span className="text-[9px] font-mono tracking-wide">{selectedAsset.type.toUpperCase()} DOCUMENT</span>
                    </div>
                  )}
                </div>

                {/* Specific metrics sheet */}
                <div className="space-y-3 font-mono text-2xs border-t border-brand-border-button pt-4">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Asset Identifier:</span>
                    <strong className="text-text-primary truncate max-w-[180px]" title={selectedAsset.id}>{selectedAsset.id}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">File Name:</span>
                    <strong className="text-text-primary truncate max-w-[180px]" title={selectedAsset.name}>{selectedAsset.name}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Content-Type:</span>
                    <strong className="text-text-secondary uppercase text-[10px]">{selectedAsset.type}</strong>
                  </div>
                  {selectedAsset.dimensions && (
                    <div className="flex justify-between">
                      <span className="text-text-muted">Resolutions:</span>
                      <strong className="text-text-primary">{selectedAsset.dimensions}</strong>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-text-muted">Payload Weights:</span>
                    <strong className="text-text-primary">{selectedAsset.size}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Transcoded Live:</span>
                    <strong className="text-text-primary">2026-06-09 10:15</strong>
                  </div>
                </div>

                {/* Edge CDN actions */}
                <div className="space-y-2 pt-3 border-t border-brand-border">
                  <a
                    href={selectedAsset.url}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full inline-flex items-center justify-center gap-1.5 border border-brand-border hover:bg-brand-surface-soft text-text-primary font-mono font-bold text-3xs uppercase tracking-wider py-2.5 rounded-lg cursor-pointer transition-all"
                  >
                    Open raw CDN file
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={(e) => copyUrlToClipboard(selectedAsset.url, selectedAsset.id, e)}
                    className="w-full inline-flex items-center justify-center gap-1.5 bg-brand-secondary hover:bg-brand-secondary/90 text-white border border-brand-border-button font-mono font-bold text-3xs uppercase tracking-wider py-2.5 rounded-lg cursor-pointer transition-all"
                  >
                    {copiedId === selectedAsset.id ? 'CDN URL COPIED!' : 'COPY STATIC CDN PATH'}
                  </button>
                </div>
              </motion.div>
            ) : (
              <div className="bg-brand-surface border border-brand-border rounded-xl p-6 text-center font-mono text-2xs text-text-muted">
                <Info className="w-8 h-8 text-brand-secondary mx-auto mb-2" />
                Select a media asset file block to view diagnostic details and copy CDN endpoint credentials.
              </div>
            )}
          </AnimatePresence>

          {/* Quick Stats banner */}
          <div className="bg-brand-surface border border-brand-border p-4 rounded-xl shadow-xs text-left mt-4 font-mono text-2xs leading-relaxed">
            <span className="text-[9px] font-mono tracking-widest text-brand-accent uppercase block border-b border-brand-border pb-2 mb-2 font-bold flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-brand-accent animate-pulse" />
              ★ DISK STORAGE QUOTA LIMIT
            </span>
            <div className="flex items-center justify-between text-[11px] mb-1 font-bold">
              <span className="text-text-secondary">6.3 MB / 1024 MB</span>
              <span className="text-brand-accent">0.6% Used</span>
            </div>
            <div className="w-full h-1.5 bg-brand-surface-soft border border-brand-border rounded-full overflow-hidden">
              <div className="w-[0.6%] h-full bg-brand-accent transition-all duration-300" />
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
