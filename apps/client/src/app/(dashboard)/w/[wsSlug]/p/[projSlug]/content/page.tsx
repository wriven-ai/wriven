'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Save,
  Check,
  RefreshCw,
  Database,
  Plus,
  FileText,
  Trash2,
  AlertCircle,
  Send,
} from 'lucide-react';
import { contentApi } from '@/lib/api';
import type { ContentTypeView, EntryStatus, FieldDef } from '@/lib/types';
import { RichTextEditor } from '@/components/editor/rich-text-editor';

const STATUS_COLORS: Record<EntryStatus, string> = {
  draft: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
  published: 'text-green-500 bg-green-500/10 border-green-500/30',
  archived: 'text-text-muted bg-brand-surface-soft border-brand-border',
};

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const base =
    'w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3.5 py-2.5 text-text-primary focus:outline-none focus:border-brand-accent';

  switch (field.type) {
    case 'text':
      return (
        <input
          type="text"
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          className={base}
          placeholder={field.label}
        />
      );
    case 'richtext':
      return (
        <RichTextEditor
          value={value}
          onChange={onChange}
          placeholder={`${field.label}…`}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          value={(value as number) ?? ''}
          onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className={base}
        />
      );
    case 'boolean':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={e => onChange(e.target.checked)}
            className="rounded border-brand-border text-brand-accent focus:ring-0 cursor-pointer"
          />
          <span className="text-xs font-mono text-text-secondary">{field.label}</span>
        </label>
      );
    case 'date':
      return (
        <input
          type="date"
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          className={base}
        />
      );
    case 'select':
      return (
        <select
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          className={`${base} cursor-pointer`}
        >
          <option value="">— Select —</option>
          {(field.options ?? []).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    case 'media':
    case 'reference':
      return (
        <div className="text-[10px] font-mono text-text-muted p-3 border border-dashed border-brand-border rounded-lg">
          {field.type === 'media' ? 'Media upload' : 'Reference picker'} — not yet available
        </div>
      );
    default:
      return null;
  }
}

export default function ContentEditorPage() {
  const qc = useQueryClient();
  const { wsSlug, projSlug } = useParams<{ wsSlug: string; projSlug: string }>();
  const contentTypesHref = `/w/${wsSlug}/p/${projSlug}/content-types`;

  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [slug, setSlug] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [saveOk, setSaveOk] = useState(false);

  const { data: types = [], isLoading: typesLoading } = useQuery({
    queryKey: ['content-types'],
    queryFn: contentApi.listTypes,
  });

  const selectedType: ContentTypeView | undefined = types.find(t => t.id === selectedTypeId);

  const { data: entriesPage, isLoading: entriesLoading } = useQuery({
    queryKey: ['entries', selectedTypeId],
    queryFn: () => contentApi.listEntries({ contentTypeId: selectedTypeId, limit: 50 }),
    enabled: !!selectedTypeId,
  });
  const entries = entriesPage?.items ?? [];

  const { data: selectedEntry } = useQuery({
    queryKey: ['entry', selectedEntryId],
    queryFn: () => contentApi.getEntry(selectedEntryId!),
    enabled: !!selectedEntryId,
  });

  // Auto-select first type when types load
  useEffect(() => {
    if (types.length > 0 && !selectedTypeId) {
      setSelectedTypeId(types[0].id);
    }
  }, [types, selectedTypeId]);

  // Reset form when type changes
  useEffect(() => {
    setSelectedEntryId(null);
    setFormData({});
    setSlug('');
    setIsDirty(false);
  }, [selectedTypeId]);

  // Populate form when an existing entry is loaded
  useEffect(() => {
    if (selectedEntry) {
      setFormData(selectedEntry.data ?? {});
      setSlug(selectedEntry.slug ?? '');
      setIsDirty(false);
    }
  }, [selectedEntry]);

  const setField = (key: string, val: unknown) => {
    setFormData(prev => ({ ...prev, [key]: val }));
    setIsDirty(true);
  };

  const createMutation = useMutation({
    mutationFn: (dto: { data: Record<string, unknown>; slug?: string }) =>
      contentApi.createEntry({ contentTypeId: selectedTypeId, ...dto }),
    onSuccess: entry => {
      setSelectedEntryId(entry.id);
      setIsDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
      qc.invalidateQueries({ queryKey: ['entries', selectedTypeId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (dto: { data: Record<string, unknown>; slug?: string }) =>
      contentApi.updateEntry(selectedEntryId!, dto),
    onSuccess: () => {
      setIsDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
      qc.invalidateQueries({ queryKey: ['entries', selectedTypeId] });
      qc.invalidateQueries({ queryKey: ['entry', selectedEntryId] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => contentApi.publishEntry(selectedEntryId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries', selectedTypeId] });
      qc.invalidateQueries({ queryKey: ['entry', selectedEntryId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contentApi.deleteEntry(id),
    onSuccess: () => {
      if (selectedEntryId === deleteMutation.variables) {
        setSelectedEntryId(null);
        setFormData({});
        setSlug('');
      }
      qc.invalidateQueries({ queryKey: ['entries', selectedTypeId] });
    },
  });

  const handleSave = () => {
    if (!selectedTypeId) return;
    const payload = { data: formData, slug: slug || undefined };
    if (selectedEntryId) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const saveError = createMutation.error || updateMutation.error;

  const entryStatus = selectedEntry?.status ?? 'draft';

  return (
    <div className="space-y-8 text-left">

      {/* Page Header */}
      <div className="border-b border-brand-border pb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
            Headless <span className="font-normal italic text-brand-secondary">Content Editor</span>
          </h1>
          <p className="text-2xs sm:text-xs font-mono text-text-muted mt-1 leading-relaxed">
            {'// Compose and structure copy for seamless publication layout delivery'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-3xs font-mono text-brand-secondary bg-brand-secondary/10 px-2 py-1 rounded animate-pulse font-bold">
              ● Unsaved changes
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || !selectedTypeId}
            className="inline-flex items-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button px-5 py-2.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer neo-shadow"
          >
            {isSaving ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving...</>
            ) : saveOk ? (
              <><Check className="w-3.5 h-3.5" /> Saved!</>
            ) : (
              <><Save className="w-3.5 h-3.5" /> Save draft</>
            )}
          </button>
        </div>
      </div>

      {/* Content Type Selector row */}
      <div className="bg-brand-surface border border-brand-border rounded-xl p-4 flex flex-wrap items-center gap-3 shadow-xs">
        <div className="flex items-center gap-2 font-mono text-2xs text-text-secondary">
          <Database className="w-4 h-4 text-brand-secondary shrink-0" />
          <span>Content type:</span>
        </div>

        {typesLoading ? (
          <span className="text-2xs font-mono text-text-muted flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" /> Loading...
          </span>
        ) : types.length === 0 ? (
          <span className="text-2xs font-mono text-text-muted">
            No types yet —{' '}
            <a href={contentTypesHref} className="text-brand-accent underline">create one</a>
          </span>
        ) : (
          <select
            value={selectedTypeId}
            onChange={e => setSelectedTypeId(e.target.value)}
            className="bg-brand-surface-soft border border-brand-border rounded px-2.5 py-1.5 text-xs font-mono text-text-primary outline-hidden font-bold cursor-pointer"
          >
            {types.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}

        {selectedEntry && (
          <span
            className={`ml-auto text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${STATUS_COLORS[entryStatus as EntryStatus]}`}
          >
            {entryStatus.toUpperCase()}
          </span>
        )}
      </div>

      {!selectedTypeId ? (
        <div className="bg-brand-surface border border-brand-border p-12 rounded-xl text-center">
          <FileText className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-xs font-mono text-text-muted">Select a content type to start editing.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Left: dynamic form */}
          <div className="lg:col-span-7 space-y-5">

            {/* Slug */}
            <div className="bg-brand-surface border border-brand-border rounded-xl p-4 shadow-xs space-y-3">
              <span className="block text-[11px] font-mono font-bold text-text-secondary">Entry Slug</span>
              <input
                type="text"
                value={slug}
                onChange={e => { setSlug(e.target.value); setIsDirty(true); }}
                placeholder="auto-generated from first text field if left empty"
                className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3.5 py-2.5 text-text-primary focus:outline-none focus:border-brand-accent"
              />
            </div>

            {/* Dynamic fields */}
            <div className="bg-brand-surface border border-brand-border-button rounded-xl p-5 sm:p-6 shadow-sm space-y-5">
              <span className="block text-[11px] font-mono font-bold text-text-secondary border-b border-brand-border pb-2.5">
                {selectedType?.name ?? 'Content'} Fields
              </span>

              {selectedType && selectedType.fields.length === 0 && (
                <p className="text-xs font-mono text-text-muted">
                  This content type has no fields.{' '}
                  <a href={contentTypesHref} className="text-brand-accent underline">Add fields</a>.
                </p>
              )}

              {(selectedType?.fields ?? []).map(field => (
                <div key={field.key} className="space-y-1.5">
                  {field.type !== 'boolean' && (
                    <label className="flex items-center gap-1.5 text-2xs font-mono text-text-secondary">
                      <span>{field.label}</span>
                      {field.required && <span className="text-brand-accent font-bold">*</span>}
                      <span className="text-[9px] text-text-muted uppercase ml-auto">[{field.type}]</span>
                    </label>
                  )}
                  <FieldInput
                    field={field}
                    value={formData[field.key]}
                    onChange={v => setField(field.key, v)}
                  />
                </div>
              ))}
            </div>

            {saveError && (
              <div className="flex items-center gap-2 text-[10px] font-mono text-status-error bg-status-error/10 border border-status-error/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {(saveError as any)?.error?.message ?? 'Failed to save entry'}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="lg:col-span-5 space-y-5">

            {/* Entry list */}
            <div className="bg-brand-surface border border-brand-border rounded-xl shadow-xs">
              <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
                <span className="text-[11px] font-mono font-bold text-text-primary">
                  Entries ({entriesPage?.total ?? 0})
                </span>
                <button
                  onClick={() => {
                    setSelectedEntryId(null);
                    setFormData({});
                    setSlug('');
                    setIsDirty(false);
                  }}
                  className="flex items-center gap-1 text-[10px] font-mono text-brand-accent hover:text-brand-accent-hover cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> New entry
                </button>
              </div>

              <div className="max-h-[280px] overflow-y-auto divide-y divide-brand-border">
                {entriesLoading && (
                  <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted p-4">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Loading entries...
                  </div>
                )}

                {!entriesLoading && entries.length === 0 && (
                  <div className="p-4 text-center">
                    <p className="text-[10px] font-mono text-text-muted">No entries yet. Save one above.</p>
                  </div>
                )}

                {entries.map(entry => (
                  <div
                    key={entry.id}
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors hover:bg-brand-surface-soft group ${selectedEntryId === entry.id ? 'bg-brand-surface-soft border-l-2 border-l-brand-accent' : ''}`}
                    onClick={() => setSelectedEntryId(entry.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-mono font-bold text-text-primary truncate">{entry.slug}</p>
                      <p className="text-[9px] font-mono text-text-muted">
                        {new Date(entry.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <span
                        className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${STATUS_COLORS[entry.status]}`}
                      >
                        {entry.status.toUpperCase()}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); deleteMutation.mutate(entry.id); }}
                        className="text-text-muted hover:text-status-error opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Entry metadata + publish */}
            {selectedEntryId && selectedEntry && (
              <div className="bg-brand-surface border border-brand-border rounded-xl p-4 space-y-3 shadow-xs">
                <span className="block text-[11px] font-mono font-bold text-text-secondary border-b border-brand-border pb-2">Entry Metadata</span>
                <div className="space-y-1.5 text-[10px] font-mono text-text-muted">
                  <div className="flex justify-between">
                    <span>Status</span>
                    <span className={`font-bold ${STATUS_COLORS[selectedEntry.status].split(' ')[0]}`}>
                      {selectedEntry.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Created</span>
                    <span>{new Date(selectedEntry.createdAt).toLocaleDateString()}</span>
                  </div>
                  {selectedEntry.publishedAt && (
                    <div className="flex justify-between">
                      <span>Published</span>
                      <span>{new Date(selectedEntry.publishedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                {selectedEntry.status !== 'published' && (
                  <button
                    onClick={() => publishMutation.mutate()}
                    disabled={publishMutation.isPending || isDirty}
                    className="w-full inline-flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-400 border border-green-700 font-mono font-bold text-2xs py-2.5 rounded-lg cursor-pointer transition-all"
                    title={isDirty ? 'Save first before publishing' : undefined}
                  >
                    {publishMutation.isPending ? (
                      <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Publishing...</>
                    ) : (
                      <><Send className="w-3.5 h-3.5" /> Publish Entry</>
                    )}
                  </button>
                )}

                {isDirty && (
                  <p className="text-[9px] font-mono text-text-muted text-center">Save draft before publishing.</p>
                )}
              </div>
            )}

            {/* AI Co-Writer */}
            <div className="bg-brand-surface border border-brand-border rounded-xl shadow-sm flex flex-col">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-brand-border">
                <Sparkles className="w-4 h-4 text-brand-secondary" />
                <span className="text-[11px] font-mono font-bold tracking-wider text-text-primary">Wriven Co-Writer</span>
                <span className="ml-auto text-[9px] font-mono bg-brand-secondary/10 text-brand-secondary px-2 py-0.5 rounded font-bold">AI</span>
              </div>

              <div className="px-5 py-3 bg-brand-surface-soft/60 border-b border-brand-border">
                <p className="text-[10px] font-mono text-text-muted leading-relaxed">
                  AI content generation — coming soon. The AI service is not yet wired.
                </p>
              </div>

              <div className="flex flex-col gap-3 p-5">
                <textarea
                  rows={5}
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  placeholder="e.g. Expand this paragraph with 3 bullet points..."
                  className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-3 text-text-primary focus:outline-none focus:border-brand-accent leading-relaxed resize-none"
                />

                <button
                  type="button"
                  disabled
                  className="w-full inline-flex items-center justify-center gap-2 bg-brand-secondary/40 text-white/60 border border-brand-border-button font-mono font-bold text-xs py-2.5 px-4 rounded-lg cursor-not-allowed"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Apply Suggestions (unavailable)
                </button>
              </div>

              <div className="px-5 py-3 border-t border-brand-border bg-brand-surface-soft/40 rounded-b-xl">
                <p className="text-[10px] font-mono text-text-muted">AI service will be wired in a future update.</p>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
