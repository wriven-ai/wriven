'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Database,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Pencil,
  Type,
  AlertCircle,
} from 'lucide-react';
import { contentApi } from '@/lib/api';
import type { ContentTypeView, FieldDef, FieldType } from '@/lib/types';
import { useCan } from '@/components/sidebar/use-can';
import { Permission } from '@wriven/contracts/rbac';
import { NoAccess } from '@/components/auth/no-access';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Short Text',
  richtext: 'Rich Text',
  number: 'Number',
  boolean: 'Boolean',
  date: 'Date',
  media: 'Media Asset',
  select: 'Select / Enum',
  reference: 'Reference',
};

const FIELD_TYPES = Object.entries(FIELD_TYPE_LABELS) as [FieldType, string][];

const toSnake = (s: string) =>
  s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/^[^a-z]+/, '').replace(/_+$/g, '');

interface DraftField {
  _id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  unique: boolean;
  options: string;
  multiple: boolean;
  refTypeId: string;
}

/** Field types that can hold an array of values. */
const MULTIPLE_CAPABLE: FieldType[] = ['media', 'reference', 'select'];

export default function ContentTypesPage() {
  const qc = useQueryClient();
  const canManage = useCan()(Permission.CONTENT_TYPE_MANAGE);

  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [search, setSearch] = useState('');
  const [sortAsc, setSortAsc] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Fetch all types at once — content types are low-cardinality (rarely > 50).
  // This lets search, sort, and pagination all work correctly across the full dataset.
  const { data, isLoading, error } = useQuery({
    queryKey: ['content-types'],
    queryFn: () => contentApi.listTypes({ limit: 200 }),
  });
  const allTypes = data?.items ?? [];

  // Client-side filter + sort
  const filtered = useMemo(() => {
    let list = allTypes;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) => t.name.toLowerCase().includes(q) || t.apiId.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) =>
      sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
    );
  }, [allTypes, search, sortAsc]);

  // Client-side pagination over the filtered+sorted list
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const contentTypes = filtered.slice((page - 1) * pageSize, page * pageSize);
  const total = filtered.length;

  const invalidateTypes = () => qc.invalidateQueries({ queryKey: ['content-types'] });

  const createMutation = useMutation({
    mutationFn: (dto: { name: string; apiId: string; fields: FieldDef[] }) =>
      contentApi.createType(dto),
    onSuccess: () => {
      invalidateTypes();
      setPage(1);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: { name?: string; fields?: FieldDef[] } }) =>
      contentApi.updateType(id, dto),
    onSuccess: () => {
      invalidateTypes();
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contentApi.deleteType(id),
    onSuccess: () => {
      invalidateTypes();
      setPage(1);
    },
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [typeName, setTypeName] = useState('');
  const [typeApiId, setTypeApiId] = useState('');
  const [apiIdTouched, setApiIdTouched] = useState(false);
  const [fields, setFields] = useState<DraftField[]>([]);


  const [candLabel, setCandLabel] = useState('');
  const [candKey, setCandKey] = useState('');
  const [candKeyTouched, setCandKeyTouched] = useState(false);
  const [candType, setCandType] = useState<FieldType>('text');
  const [candRequired, setCandRequired] = useState(false);
  const [candUnique, setCandUnique] = useState(false);
  const [candOptions, setCandOptions] = useState('');
  const [candMultiple, setCandMultiple] = useState(false);
  const [candRefTypeId, setCandRefTypeId] = useState('');

  const resetForm = () => {
    setEditingId(null);
    setTypeName('');
    setTypeApiId('');
    setApiIdTouched(false);
    setFields([]);
    setCandLabel('');
    setCandKey('');
    setCandKeyTouched(false);
    setCandType('text');
    setCandRequired(false);
    setCandUnique(false);
    setCandOptions('');
    setCandMultiple(false);
    setCandRefTypeId('');
  };

  const startEdit = (type: ContentTypeView) => {
    setEditingId(type.id);
    setTypeName(type.name);
    setTypeApiId(type.apiId);
    setApiIdTouched(true);
    setFields(
      type.fields.map((f) => ({
        _id: crypto.randomUUID(),
        key: f.key,
        label: f.label,
        type: f.type as FieldType,
        required: !!f.required,
        unique: !!f.unique,
        options: Array.isArray(f.options) ? f.options.join(', ') : '',
        multiple: !!f.multiple,
        refTypeId: f.refTypeId ?? '',
      })),
    );
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNameChange = (v: string) => {
    setTypeName(v);
    if (!apiIdTouched) setTypeApiId(toSnake(v));
  };

  const handleCandLabelChange = (v: string) => {
    setCandLabel(v);
    if (!candKeyTouched) setCandKey(toSnake(v));
  };

  const addField = () => {
    if (!candLabel.trim() || !candKey.trim()) return;
    if (candType === 'reference' && !candRefTypeId) return; // need a target type
    setFields(prev => [
      ...prev,
      {
        _id: crypto.randomUUID(),
        key: candKey,
        label: candLabel,
        type: candType,
        required: candRequired,
        unique: candUnique,
        options: candOptions,
        multiple: MULTIPLE_CAPABLE.includes(candType) ? candMultiple : false,
        refTypeId: candType === 'reference' ? candRefTypeId : '',
      },
    ]);
    setCandLabel('');
    setCandKey('');
    setCandKeyTouched(false);
    setCandType('text');
    setCandRequired(false);
    setCandUnique(false);
    setCandOptions('');
    setCandMultiple(false);
    setCandRefTypeId('');
  };

  const removeField = (id: string) => setFields(prev => prev.filter(f => f._id !== id));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeName.trim() || !typeApiId.trim()) return;
    const dtoFields: FieldDef[] = fields.map(f => ({
      key: f.key,
      label: f.label,
      type: f.type,
      ...(f.required && { required: true }),
      ...(f.unique && { unique: true }),
      ...(f.multiple && MULTIPLE_CAPABLE.includes(f.type) ? { multiple: true } : {}),
      ...(f.type === 'reference' && f.refTypeId ? { refTypeId: f.refTypeId } : {}),
      ...(f.type === 'select' && f.options
        ? { options: f.options.split(',').map(s => s.trim()).filter(Boolean) }
        : {}),
    }));
    if (editingId) {
      updateMutation.mutate({ id: editingId, dto: { name: typeName, fields: dtoFields } });
    } else {
      createMutation.mutate({ name: typeName, apiId: typeApiId, fields: dtoFields });
    }
  };

  const activeMutation = editingId ? updateMutation : createMutation;
  const errMsg = activeMutation.error
    ? ((activeMutation.error as any)?.error?.message ??
        `Failed to ${editingId ? 'update' : 'create'} content type`)
    : null;

  if (!canManage) return <NoAccess />;

  return (
    <div className="space-y-8 text-left">
      <div className="border-b border-brand-border pb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
            Structure & <span className="font-normal italic text-brand-secondary">Content Types</span>
          </h1>
          <p className="text-sm sm:text-sm font-mono text-text-muted mt-1 leading-relaxed">
            {'// Configure functional layout models and relational schema attributes'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Left: Create form */}
        <div className="lg:col-span-5 bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-brand-border pb-2.5">
            <span className="text-sm font-mono tracking-wider text-text-secondary font-bold">
              {editingId ? 'Edit Content Layout Model' : 'Assemble Content Layout Model'}
            </span>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-sm font-mono font-bold text-text-muted hover:text-status-error cursor-pointer"
              >
                Cancel edit
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-mono text-text-secondary mb-1.5">Schema Name</label>
              <input
                type="text"
                placeholder="e.g. Blog Articles, Product Specs..."
                value={typeName}
                onChange={e => handleNameChange(e.target.value)}
                required
                className="w-full text-sm font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3.5 py-3 text-text-primary focus:outline-none focus:border-brand-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-mono text-text-secondary mb-1.5">
                API ID{' '}
                <span className="text-text-muted">
                  {editingId ? '(immutable)' : '(snake_case, auto-derived)'}
                </span>
              </label>
              <input
                type="text"
                placeholder="blog_articles"
                value={typeApiId}
                onChange={e => { setTypeApiId(e.target.value); setApiIdTouched(true); }}
                required
                disabled={!!editingId}
                className="w-full text-sm font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3.5 py-3 text-text-primary focus:outline-none focus:border-brand-accent disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Field builder */}
            <div className="space-y-3.5 border-t border-brand-border pt-4">
              <span className="block text-sm font-mono text-text-secondary font-bold">
                Field Specifications ({fields.length})
              </span>

              <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                {fields.length === 0 && (
                  <p className="text-sm font-mono text-text-muted text-center py-3">No fields yet — add one below</p>
                )}
                {fields.map(f => (
                  <div
                    key={f._id}
                    className="flex items-center justify-between bg-brand-surface-soft border border-brand-border px-3 py-2 rounded-lg text-sm font-mono"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Type className="w-3.5 h-3.5 text-brand-secondary shrink-0" />
                      <strong className="text-text-primary truncate">{f.label}</strong>
                      <span className="text-text-muted uppercase text-sm font-semibold shrink-0">
                        ({f.type}
                        {f.type === 'reference' && f.refTypeId
                          ? ` → ${contentTypes.find(t => t.id === f.refTypeId)?.name ?? '?'}`
                          : ''}
                        {f.multiple ? '[]' : ''})
                      </span>
                      {f.required && <span className="text-sm font-bold text-brand-accent shrink-0">*</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeField(f._id)}
                      className="text-text-muted hover:text-status-error cursor-pointer ml-2 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Field candidate builder */}
              <div className="bg-brand-surface-soft/60 border border-brand-border rounded-lg p-3.5 space-y-3">
                <input
                  type="text"
                  placeholder="Label — display name (e.g. Article Title)"
                  value={candLabel}
                  onChange={e => handleCandLabelChange(e.target.value)}
                  className="w-full text-sm font-mono bg-brand-surface border border-brand-border rounded p-2 text-text-primary"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="key (snake_case)"
                    value={candKey}
                    onChange={e => { setCandKey(e.target.value); setCandKeyTouched(true); }}
                    className="text-sm font-mono bg-brand-surface border border-brand-border rounded p-2 text-text-primary"
                  />
                  <select
                    value={candType}
                    onChange={e => setCandType(e.target.value as FieldType)}
                    className="bg-brand-surface border border-brand-border rounded p-2 text-sm font-mono text-text-primary outline-hidden cursor-pointer"
                  >
                    {FIELD_TYPES.map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>

                {candType === 'select' && (
                  <input
                    type="text"
                    placeholder="Options: draft, published, featured  (comma-separated)"
                    value={candOptions}
                    onChange={e => setCandOptions(e.target.value)}
                    className="w-full text-sm font-mono bg-brand-surface border border-brand-border rounded p-2 text-text-primary"
                  />
                )}

                {candType === 'reference' && (
                  <div className="space-y-1">
                    <select
                      value={candRefTypeId}
                      onChange={e => setCandRefTypeId(e.target.value)}
                      className="w-full bg-brand-surface border border-brand-border rounded p-2 text-sm font-mono text-text-primary outline-hidden cursor-pointer"
                    >
                      <option value="">— References which type? —</option>
                      {contentTypes.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    {contentTypes.length === 0 && (
                      <p className="text-sm font-mono text-text-muted">
                        Create a content type first to reference it.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 font-mono text-sm text-text-secondary cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={candRequired}
                        onChange={e => setCandRequired(e.target.checked)}
                        className="rounded border-brand-border text-brand-accent cursor-pointer focus:ring-0"
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-1.5 font-mono text-sm text-text-secondary cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={candUnique}
                        onChange={e => setCandUnique(e.target.checked)}
                        className="rounded border-brand-border text-brand-accent cursor-pointer focus:ring-0"
                      />
                      Unique
                    </label>
                    {MULTIPLE_CAPABLE.includes(candType) && (
                      <label className="flex items-center gap-1.5 font-mono text-sm text-text-secondary cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={candMultiple}
                          onChange={e => setCandMultiple(e.target.checked)}
                          className="rounded border-brand-border text-brand-accent cursor-pointer focus:ring-0"
                        />
                        Multiple
                      </label>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={addField}
                    disabled={
                      !canManage ||
                      !candLabel.trim() ||
                      !candKey.trim() ||
                      (candType === 'reference' && !candRefTypeId)
                    }
                    className="px-3 py-1 border border-dashed border-brand-border hover:border-brand-accent font-mono text-sm font-bold text-text-secondary hover:text-brand-accent cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + Add field
                  </button>
                </div>
              </div>
            </div>

            {errMsg && (
              <div className="flex items-center gap-2 text-sm font-mono text-status-error bg-status-error/10 border border-status-error/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {errMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={!canManage || !typeName.trim() || !typeApiId.trim() || activeMutation.isPending}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-sm py-3 rounded-lg neo-shadow cursor-pointer transition-all"
            >
              {activeMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> {editingId ? 'Saving...' : 'Compiling...'}</>
              ) : editingId ? (
                <><RefreshCw className="w-4 h-4 text-white" /> Save Changes</>
              ) : (
                <><Plus className="w-4 h-4 text-white" /> Compile Schematic Model</>
              )}
            </button>
          </form>
        </div>

         {/* Right: List */}
         <div className="lg:col-span-7 space-y-4">
           <div className="flex flex-wrap items-center justify-between gap-3">
<span className="text-sm font-mono tracking-wider text-brand-secondary font-bold">
                Active Registered Models ({total})
              </span>
             <div className="flex items-center gap-2">
               {/* Search */}
               <div className="relative">
                 <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
                 <input
                   type="text"
                   placeholder="Search types..."
                   value={search}
                   onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                   className="pl-8 pr-3 py-1.5 text-xs font-mono bg-brand-surface border border-brand-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-accent w-44"
                 />
               </div>
               {/* Sort toggle */}
               <button
                 onClick={() => setSortAsc((v) => !v)}
                 title={sortAsc ? 'Sorted A → Z' : 'Sorted Z → A'}
                 className="inline-flex items-center gap-1 px-2 py-1.5 border border-brand-border bg-brand-surface rounded-lg text-xs font-mono text-text-secondary hover:border-brand-accent/50 hover:text-text-primary transition-colors cursor-pointer"
               >
                 {sortAsc ? <ArrowDownAZ className="w-3.5 h-3.5" /> : <ArrowUpAZ className="w-3.5 h-3.5" />}
                 {sortAsc ? 'A–Z' : 'Z–A'}
               </button>
             </div>
           </div>

           {error && (
             <div className="flex items-center gap-2 text-sm font-mono text-status-error bg-status-error/10 border border-status-error/20 rounded-lg px-4 py-3">
               <AlertCircle className="w-3.5 h-3.5" /> Failed to load content types
             </div>
           )}

           <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden shadow-xs">
             <Table>
               <TableHeader>
                 <TableRow className="bg-brand-surface-soft/40 hover:bg-brand-surface-soft/40">
                   <TableHead className="pl-5">Name</TableHead>
                   <TableHead>API ID</TableHead>
                   <TableHead>Fields</TableHead>
                   <TableHead className="text-right pr-5">Actions</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {isLoading
                   ? Array.from({ length: 3 }).map((_, i) => (
                       <TableRow key={i}>
                         <TableCell className="pl-5">
                           <div className="space-y-1.5">
                             <Skeleton className="h-3 w-28" />
                             <Skeleton className="h-2.5 w-20" />
                           </div>
                         </TableCell>
                         <TableCell><Skeleton className="h-3 w-20" /></TableCell>
                         <TableCell><Skeleton className="h-3 w-8" /></TableCell>
                         <TableCell className="text-right pr-5">
                           <div className="flex items-center justify-end gap-1.5">
                             <Skeleton className="h-7 w-7 rounded" />
                             <Skeleton className="h-7 w-7 rounded" />
                             <Skeleton className="h-7 w-7 rounded" />
                           </div>
                         </TableCell>
                       </TableRow>
                     ))
                   : contentTypes.length === 0
                     ? (
                       <TableRow>
                         <TableCell colSpan={4} className="text-center py-10">
                           <div className="flex flex-col items-center gap-3">
                             <Database className="w-8 h-8 text-text-muted" />
                             <p className="text-sm font-mono text-text-muted">No content types yet. Create your first schema.</p>
                           </div>
                         </TableCell>
                       </TableRow>
                     )
                     : contentTypes.map(type => (
                       <TableRow
                         key={type.id}
                         className={editingId === type.id ? 'bg-brand-accent/5' : ''}
                       >
                         <TableCell className="pl-5">
                           <div className="space-y-0.5">
                             <p className="font-mono text-sm font-bold text-text-primary">{type.name}</p>
                             <p className="text-xs text-text-muted font-mono">
                               {type.fields.length} Field{type.fields.length !== 1 ? 's' : ''}
                             </p>
                           </div>
                         </TableCell>
                         <TableCell>
                           <span className="bg-brand-surface-soft border border-brand-border text-text-primary px-1.5 py-0.5 rounded font-bold text-sm font-mono">
                             {type.apiId}
                           </span>
                         </TableCell>
                         <TableCell>
<span className="text-xs font-mono font-bold text-text-muted">
                              {type.fields.length} Field{type.fields.length !== 1 ? 's' : ''}
                            </span>
                         </TableCell>
                         <TableCell className="text-right pr-5">
                           <div className="flex items-center justify-end gap-1.5">
                             <button
                               onClick={() => startEdit(type)}
                               disabled={!canManage}
                               className="p-1.5 border border-brand-border bg-brand-surface hover:bg-brand-accent/10 hover:text-brand-accent text-text-muted rounded cursor-pointer transition-colors disabled:opacity-40"
                               title="Edit Schema"
                             >
                               <Pencil className="w-3.5 h-3.5" />
                             </button>
                             <button
                               onClick={() => setDeleteTarget({ id: type.id, name: type.name })}
                               disabled={!canManage || deleteMutation.isPending}
                               className="p-1.5 border border-brand-border bg-brand-surface hover:bg-status-error/10 hover:text-status-error text-text-muted rounded cursor-pointer transition-colors disabled:opacity-40"
                               title="Delete Schema"
                             >
                               <Trash2 className="w-3.5 h-3.5" />
                             </button>
                           </div>
                         </TableCell>
                       </TableRow>
                     ))}
               </TableBody>
             </Table>
           </div>

           <Pagination
             currentPage={page}
             totalPages={totalPages}
             onPageChange={(p) => { setPage(p); setSearch(''); }}
           />
         </div>

      </div>

      <ConfirmationDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        variant="danger"
        title="Delete content type?"
        description={
          deleteTarget
            ? `Deleting "${deleteTarget.name}" will permanently remove this schema and all its entries. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        lockWhileLoading
        successToast="Content type deleted."
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget.id, {
            onSuccess: () => setDeleteTarget(null),
          });
        }}
      />
    </div>
  );
}
