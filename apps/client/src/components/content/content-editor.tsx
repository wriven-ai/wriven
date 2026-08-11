'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock,
  History,
  RefreshCw,
  Save,
  Send,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { contentApi } from '@/lib/api';
import type { ContentTypeView, EntryStatus } from '@/lib/types';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { FieldRow, isFieldEmpty, STATUS_COLORS } from './fields';
import { AiPanel } from './ai-panel';
import { RevisionsDrawer } from './revisions-drawer';
import { useCan } from '@/components/sidebar/use-can';
import { Permission } from '@wriven/contracts/rbac';

/**
 * Single-entry editor (create + edit). Center = title + body + structured
 * fields (media, reference, etc.) inline; right = AI co-writer, shown only when
 * the content type has a rich-text field. Settings sheet holds the slug.
 * The entries *list* lives on its own page — this view is one document.
 */
export function ContentEditor({
  entryId,
  typeId,
}: {
  entryId?: string;
  typeId?: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const can = useCan();
  const { wsSlug, projSlug } = useParams<{ wsSlug: string; projSlug: string }>();
  const contentBase = `/w/${wsSlug}/p/${projSlug}/content`;
  const contentTypesHref = `/w/${wsSlug}/p/${projSlug}/content-types`;

  const { data: typesData } = useQuery({
    queryKey: ['content-types'],
    queryFn: () => contentApi.listTypes({ limit: 100 }),
  });
  const types = typesData?.items ?? [];

  const { data: entry } = useQuery({
    queryKey: ['entry', entryId],
    queryFn: () => contentApi.getEntry(entryId as string),
    enabled: !!entryId,
  });

  const activeTypeId = entry?.contentTypeId ?? typeId ?? '';
  const selectedType: ContentTypeView | undefined = types.find((t) => t.id === activeTypeId);

  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [slug, setSlug] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Populate when an existing entry loads.
  useEffect(() => {
    if (entry) {
      setFormData(entry.data ?? {});
      setSlug(entry.slug ?? '');
      setIsDirty(false);
      setFieldErrors({});
    }
  }, [entry]);

  const setField = (key: string, val: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: val }));
    setIsDirty(true);
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const createMutation = useMutation({
    mutationFn: (dto: { data: Record<string, unknown>; slug?: string }) =>
      contentApi.createEntry({ contentTypeId: activeTypeId, ...dto }),
    onSuccess: (created) => {
      qc.setQueryData(['entry', created.id], created);
      qc.invalidateQueries({ queryKey: ['entries'] });
      router.replace(`${contentBase}/${created.id}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (dto: { data: Record<string, unknown>; slug?: string }) =>
      contentApi.updateEntry(entryId as string, dto),
    onSuccess: () => {
      setIsDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
      qc.invalidateQueries({ queryKey: ['entries'] });
      qc.invalidateQueries({ queryKey: ['entry', entryId] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => contentApi.publishEntry(entryId as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      qc.invalidateQueries({ queryKey: ['entry', entryId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => contentApi.deleteEntry(entryId as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      router.push(contentBase);
    },
  });

  const handleSave = () => {
    if (!activeTypeId) return;
    const errs: Record<string, string> = {};
    for (const f of selectedType?.fields ?? []) {
      if (f.required && isFieldEmpty(f, formData[f.key])) {
        errs[f.key] = `${f.label} is required`;
      }
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload = { data: formData, slug: slug || undefined };
    if (entryId) updateMutation.mutate(payload);
    else createMutation.mutate(payload);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const saveError = createMutation.error || updateMutation.error;
  const status = entry?.status ?? 'draft';

  // Title + richtext render bare on the writing surface; every other field
  // (media, reference, number, date, select, boolean) renders inline below.
  const allFields = selectedType?.fields ?? [];
  const titleField = allFields.find((f) => f.type === 'text');
  const bodyFields = allFields.filter((f) => f.type === 'richtext');
  const usedInMain = new Set(
    [titleField?.key, ...bodyFields.map((b) => b.key)].filter(Boolean) as string[],
  );
  const mainFields = allFields.filter((f) => !usedInMain.has(f.key));
  const hasMain = !!titleField || bodyFields.length > 0;
  // Show the Co-Writer when there is at least one AI-eligible field.
  const hasAiTarget = allFields.some(
    (f) =>
      (f.type === 'text' || f.type === 'richtext' || f.type === 'select') &&
      f.aiAssist !== false,
  );

  return (
    <div className="space-y-6 text-left">
      {/* Top bar */}
      <div className="border-b border-brand-border pb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={contentBase}
            className="inline-flex items-center gap-1 text-sm font-mono text-text-muted hover:text-brand-accent transition-colors"
          >
            <ArrowLeft className="w-3 h-3" /> Entries
          </Link>
          <h1 className="font-display font-medium text-lg sm:text-xl text-text-primary tracking-tight">
            {selectedType?.name ?? 'Content'}{' '}
            <span className="font-normal italic text-brand-secondary">
              {entryId ? 'Edit entry' : 'New entry'}
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-sm font-mono text-brand-secondary bg-brand-secondary/10 px-2 py-1 rounded animate-pulse font-bold">
              ● Unsaved
            </span>
          )}
          {entry && (
            <span className={`text-sm font-mono font-bold px-2 py-0.5 rounded border ${STATUS_COLORS[status as EntryStatus]}`}>
              {status.toUpperCase()}
            </span>
          )}
          {entryId && (
            <button
              onClick={() => setHistoryOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 border border-brand-border rounded-lg text-text-secondary hover:text-brand-accent hover:border-brand-accent/40 transition-colors cursor-pointer text-sm font-mono font-bold"
              title="Version history"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">History</span>
            </button>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 border border-brand-border rounded-lg text-text-secondary hover:text-brand-accent hover:border-brand-accent/40 transition-colors cursor-pointer text-sm font-mono font-bold"
            title="Entry settings (slug)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </button>
          {entryId && can(Permission.CONTENT_ENTRY_DELETE) && (
            <button
              onClick={() => {
                if (confirm('Delete this entry?')) deleteMutation.mutate();
              }}
              className="p-2 border border-brand-border rounded-lg text-text-muted hover:text-status-error hover:border-status-error/30 transition-colors cursor-pointer"
              title="Delete entry"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={
              isSaving ||
              !activeTypeId ||
              (entryId
                ? !can(Permission.CONTENT_ENTRY_UPDATE)
                : !can(Permission.CONTENT_ENTRY_CREATE))
            }
            className="inline-flex items-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button px-5 py-2.5 rounded-lg text-sm font-mono font-bold transition-all cursor-pointer neo-shadow"
          >
            {isSaving ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving...</>
            ) : saveOk ? (
              <><Check className="w-3.5 h-3.5" /> Saved!</>
            ) : (
              <><Save className="w-3.5 h-3.5" /> {entryId ? 'Save' : 'Create'}</>
            )}
          </button>
          {entry && entry.status !== 'published' && can(Permission.CONTENT_ENTRY_PUBLISH) && (
            <button
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending || isDirty}
              className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-400 border border-green-700 px-5 py-2.5 rounded-lg text-sm font-mono font-bold transition-all cursor-pointer"
              title={isDirty ? 'Save first before publishing' : undefined}
            >
              {publishMutation.isPending ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Publishing...</>
              ) : (
                <><Send className="w-3.5 h-3.5" /> Publish</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Timeline strip */}
      {entry && (
        <div className="bg-brand-surface border border-brand-border rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 shadow-xs font-mono text-sm text-text-muted">
          <span className="flex items-center gap-1.5 text-text-secondary font-bold">
            <Clock className="w-3.5 h-3.5 text-brand-secondary" /> Timeline
          </span>
          <span className="flex items-center gap-1.5">
            Created
            <strong className="text-text-secondary">{new Date(entry.createdAt).toLocaleString()}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            Updated
            <strong className="text-text-secondary">{new Date(entry.updatedAt).toLocaleString()}</strong>
          </span>
          {entry.publishedAt && (
            <span className="flex items-center gap-1.5">
              Published
              <strong className="text-green-500">{new Date(entry.publishedAt).toLocaleString()}</strong>
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Center: writing surface */}
        <div className={`${hasAiTarget ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-5`}>
          <div className="bg-brand-surface border border-brand-border-button rounded-xl p-5 sm:p-6 shadow-sm space-y-5">
            {allFields.length === 0 && (
              <p className="text-sm font-mono text-text-muted">
                This content type has no fields.{' '}
                <a href={contentTypesHref} className="text-brand-accent underline">Add fields</a>.
              </p>
            )}

            {titleField && (
              <div className="space-y-1">
                <input
                  type="text"
                  value={(formData[titleField.key] as string) ?? ''}
                  onChange={(e) => setField(titleField.key, e.target.value)}
                  placeholder={titleField.label}
                  className={`w-full bg-transparent text-2xl font-display font-semibold text-text-primary placeholder:text-text-muted/40 outline-none border-b pb-3 ${
                    fieldErrors[titleField.key] ? 'border-status-error' : 'border-brand-border'
                  }`}
                />
                {fieldErrors[titleField.key] && (
                  <p className="text-sm font-mono text-status-error">{fieldErrors[titleField.key]}</p>
                )}
              </div>
            )}

            {bodyFields.map((field) => (
              <FieldRow
                key={field.key}
                field={field}
                value={formData[field.key]}
                onChange={(v) => setField(field.key, v)}
                error={fieldErrors[field.key]}
              />
            ))}

            {/* Structured fields — media, reference, number, date, select, boolean */}
            {mainFields.length > 0 && (
              <div className="space-y-5 border-t border-brand-border pt-5">
                {mainFields.map((field) => (
                  <FieldRow
                    key={field.key}
                    field={field}
                    value={formData[field.key]}
                    onChange={(v) => setField(field.key, v)}
                    error={fieldErrors[field.key]}
                  />
                ))}
              </div>
            )}

            {!hasMain && allFields.length > 0 && (
              <p className="text-sm font-mono text-text-muted">
                No title or body field for this content type.
              </p>
            )}
          </div>

          {saveError && (
            <div className="flex items-center gap-2 text-sm font-mono text-status-error bg-status-error/10 border border-status-error/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {(saveError as { error?: { message?: string } })?.error?.message ?? 'Failed to save entry'}
            </div>
          )}
        </div>

        {/* Right: AI Co-Writer — shown when there's an AI-eligible field */}
        {hasAiTarget && (
          <AiPanel
            contentTypeId={activeTypeId}
            entryId={entryId}
            fields={allFields}
            setField={setField}
          />
        )}
      </div>

      {/* Settings drawer — slug only */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent
          side="right"
          className="bg-brand-surface border-brand-border w-full sm:max-w-md overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="font-display text-text-primary">Entry settings</SheetTitle>
            <SheetDescription className="font-mono text-sm text-text-muted">
              URL slug for this entry.
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-6 space-y-5">
            {/* Slug */}
            <div className="space-y-2">
              <label className="block text-sm font-mono text-text-muted">
                Slug <span className="text-text-muted/70">— URL key, auto from title if empty</span>
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="my-entry-slug"
                className="w-full text-sm font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-brand-accent"
              />
            </div>

          </div>
        </SheetContent>
      </Sheet>

      {entryId && (
        <RevisionsDrawer
          entryId={entryId}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
        />
      )}
    </div>
  );
}
