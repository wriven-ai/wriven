'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, FileText, Link2, Plus, Search, X } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { contentApi } from '@/lib/api';
import type { ContentEntryView, ContentTypeView } from '@/lib/types';

/** Best display title for an entry: first text field value, else slug. */
function entryTitle(entry: ContentEntryView, type?: ContentTypeView): string {
  const textField = type?.fields.find((f) => f.type === 'text');
  const v = textField ? entry.data[textField.key] : undefined;
  return (typeof v === 'string' && v.trim()) || entry.slug || '(untitled)';
}

/**
 * Editor control for `reference` fields — links to entries of another content
 * type. Stores the referenced entry **id** (or an array when `multiple`).
 * Modern picker: a searchable dialog listing the target type's entries.
 */
export function ReferenceField({
  value,
  onChange,
  multiple,
  refTypeId,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  multiple?: boolean;
  refTypeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: typesData } = useQuery({
    queryKey: ['content-types'],
    queryFn: () => contentApi.listTypes({ limit: 100 }),
  });
  const types = typesData?.items ?? [];
  const targetType = types.find((t) => t.id === refTypeId);

  const { data: entriesPage } = useQuery({
    queryKey: ['entries', refTypeId],
    queryFn: () => contentApi.listEntries({ contentTypeId: refTypeId as string, limit: 100 }),
    enabled: !!refTypeId && open,
  });
  const entries = entriesPage?.items ?? [];
  const byId = new Map(entries.map((e) => [e.id, e] as const));

  const selectedIds: string[] = multiple
    ? Array.isArray(value)
      ? value.map(String)
      : []
    : typeof value === 'string' && value
      ? [value]
      : [];

  if (!refTypeId) {
    return (
      <div className="text-sm font-mono text-text-muted p-3 border border-dashed border-brand-border rounded-lg">
        No target type set — edit this field in the Content Types builder.
      </div>
    );
  }

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

  const filtered = entries.filter((e) =>
    entryTitle(e, targetType).toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-2">
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const e = byId.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-surface-soft px-2 py-1 font-mono text-sm text-text-primary"
              >
                <Link2 className="h-3 w-3 text-brand-secondary" />
                {e ? entryTitle(e, targetType) : id.slice(0, 8)}
                <button
                  type="button"
                  onClick={() => unselect(id)}
                  className="text-text-muted hover:text-status-error"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
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
          : `Select ${targetType?.name ?? 'reference'}`}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-brand-surface border-brand-border text-text-primary max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-text-primary">
              Link {targetType?.name ?? 'entry'}
            </DialogTitle>
            <DialogDescription className="font-mono text-sm text-text-muted">
              Pick an entry to reference.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-surface-soft px-3 py-2">
            <Search className="h-3.5 w-3.5 text-text-muted" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title…"
              className="w-full bg-transparent font-mono text-sm text-text-primary outline-none placeholder:text-text-muted/60"
            />
          </div>

          <div className="max-h-80 divide-y divide-brand-border overflow-y-auto rounded-lg border border-brand-border">
            {filtered.length === 0 ? (
              <p className="py-8 text-center font-mono text-sm text-text-muted">
                {entries.length === 0 ? 'No entries of this type yet.' : 'No matches.'}
              </p>
            ) : (
              filtered.map((e) => {
                const active = selectedIds.includes(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => pick(e.id)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-brand-surface-soft/60 ${
                      active ? 'bg-brand-accent/5' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-bold text-text-primary">
                          {entryTitle(e, targetType)}
                        </p>
                        <p className="truncate font-mono text-sm text-text-muted">/{e.slug}</p>
                      </div>
                    </div>
                    {active && <Check className="h-4 w-4 shrink-0 text-brand-accent" />}
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
