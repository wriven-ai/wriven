'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Database,
  FileText,
  Plus,
  Shapes,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { contentApi } from '@/lib/api';
import type { ContentEntryView, ContentTypeView } from '@/lib/types';
import { STATUS_COLORS } from '@/components/content/fields';
import { ContentTypeSelectSkeleton, EntryRowsSkeleton } from '@/components/skeleton/content-list-skeleton';

/** Best display title for an entry: first text field value, else slug. */
function entryTitle(entry: ContentEntryView, type?: ContentTypeView): string {
  const textField = type?.fields.find((f) => f.type === 'text');
  const v = textField ? entry.data[textField.key] : undefined;
  return (typeof v === 'string' && v.trim()) || entry.slug || '(untitled)';
}

export default function ContentListPage() {
  const qc = useQueryClient();
  const { wsSlug, projSlug } = useParams<{ wsSlug: string; projSlug: string }>();
  const contentBase = `/w/${wsSlug}/p/${projSlug}/content`;
  const contentTypesHref = `/w/${wsSlug}/p/${projSlug}/content-types`;

  const [selectedTypeId, setSelectedTypeId] = useState('');

  const { data: typesData, isLoading: typesLoading } = useQuery({
    queryKey: ['content-types'],
    queryFn: () => contentApi.listTypes({ limit: 100 }),
  });
  const types = typesData?.items ?? [];
  const selectedType = types.find((t) => t.id === selectedTypeId);

  useEffect(() => {
    if (types.length > 0 && !selectedTypeId) setSelectedTypeId(types[0].id);
  }, [types, selectedTypeId]);

  const { data: entriesPage, isLoading: entriesLoading } = useQuery({
    queryKey: ['entries', selectedTypeId],
    queryFn: () => contentApi.listEntries({ contentTypeId: selectedTypeId, limit: 100 }),
    enabled: !!selectedTypeId,
  });
  const entries = entriesPage?.items ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contentApi.deleteEntry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entries', selectedTypeId] }),
  });

  return (
    <div className="space-y-8 text-left">
      {/* Header */}
      <div className="border-b border-brand-border pb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
            Headless <span className="font-normal italic text-brand-secondary">Content</span>
          </h1>
          <p className="text-sm sm:text-sm font-mono text-text-muted mt-1 leading-relaxed">
            {'// Browse, create, and manage entries per content type'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href={contentTypesHref}
            className="inline-flex items-center gap-1.5 border border-brand-border bg-brand-surface hover:bg-brand-surface-soft text-text-secondary hover:text-text-primary px-4 py-2.5 rounded-lg text-sm font-mono font-bold transition-colors cursor-pointer"
          >
            <Shapes className="w-3.5 h-3.5" />
            Content types
          </Link>

          {selectedTypeId && (
            <Link
              href={`${contentBase}/new?type=${selectedTypeId}`}
              className="inline-flex items-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white border border-brand-border-button px-5 py-2.5 rounded-lg text-sm font-mono font-bold transition-all cursor-pointer neo-shadow"
            >
              <Plus className="w-3.5 h-3.5" /> New entry
            </Link>
          )}
        </div>
      </div>

      {/* Content type selector */}
      <div className="bg-brand-surface border border-brand-border rounded-xl p-4 flex flex-wrap items-center gap-3 shadow-xs">
        <div className="flex items-center gap-2 font-mono text-sm text-text-secondary">
          <Database className="w-4 h-4 text-brand-secondary shrink-0" />
          <span>Content type:</span>
        </div>

        {typesLoading ? (
          <ContentTypeSelectSkeleton />
        ) : types.length === 0 ? (
          <span className="text-sm font-mono text-text-muted">
            No types yet —{' '}
            <a href={contentTypesHref} className="text-brand-accent underline">create one</a>
          </span>
        ) : (
          <select
            value={selectedTypeId}
            onChange={(e) => setSelectedTypeId(e.target.value)}
            className="bg-brand-surface-soft border border-brand-border rounded px-2.5 py-1.5 text-sm font-mono text-text-primary outline-hidden font-bold cursor-pointer"
          >
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}

        {selectedTypeId && (
          <span className="ml-auto text-sm font-mono text-text-muted">
            {entriesPage?.total ?? 0} entries
          </span>
        )}
      </div>

      {/* Entries table */}
      {!selectedTypeId ? (
        <div className="bg-brand-surface border border-brand-border p-12 rounded-xl text-center">
          <FileText className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-sm font-mono text-text-muted">Select a content type to see its entries.</p>
        </div>
      ) : (
        <div className="bg-brand-surface border border-brand-border rounded-xl shadow-xs overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-brand-border bg-brand-surface-soft/40 font-mono text-sm font-bold uppercase tracking-wider text-text-muted">
            <span className="col-span-6">Title</span>
            <span className="col-span-2">Status</span>
            <span className="col-span-3">Updated</span>
            <span className="col-span-1" />
          </div>

          {entriesLoading ? (
            <EntryRowsSkeleton />
          ) : entries.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-mono text-text-muted mb-3">No entries yet.</p>
              <Link
                href={`${contentBase}/new?type=${selectedTypeId}`}
                className="inline-flex items-center gap-1.5 text-sm font-mono font-bold text-brand-accent hover:text-brand-accent-hover"
              >
                <Plus className="w-3 h-3" /> Create the first entry
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-brand-border">
              {entries.map((entry) => (
                <Link
                  key={entry.id}
                  href={`${contentBase}/${entry.id}`}
                  className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-brand-surface-soft/60 transition-colors group"
                >
                  <div className="col-span-12 sm:col-span-6 min-w-0">
                    <p className="text-sm font-mono font-bold text-text-primary truncate">
                      {entryTitle(entry, selectedType)}
                    </p>
                    <p className="text-sm font-mono text-text-muted truncate">/{entry.slug}</p>
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded border ${STATUS_COLORS[entry.status]}`}>
                      {entry.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="col-span-5 sm:col-span-3 text-sm font-mono text-text-muted">
                    {new Date(entry.updatedAt).toLocaleDateString()}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (confirm('Delete this entry?')) deleteMutation.mutate(entry.id);
                      }}
                      className="text-text-muted hover:text-status-error opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
