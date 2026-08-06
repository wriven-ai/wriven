'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Database,
  Plus,
  Trash2,
  Pencil,
  ChevronRight,
  Type,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { contentApi } from '@/lib/api';
import type { ContentTypeView, FieldDef, FieldType } from '@/lib/types';
import { useCan } from '@/components/sidebar/use-can';
import { Permission } from '@wriven/contracts/rbac';
import { NoAccess } from '@/components/auth/no-access';

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

  const { data: contentTypes = [], isLoading, error } = useQuery({
    queryKey: ['content-types'],
    queryFn: () => contentApi.listTypes(),
  });

  const createMutation = useMutation({
    mutationFn: (dto: { name: string; apiId: string; fields: FieldDef[] }) =>
      contentApi.createType(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content-types'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: { name?: string; fields?: FieldDef[] } }) =>
      contentApi.updateType(id, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content-types'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contentApi.deleteType(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-types'] }),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [typeName, setTypeName] = useState('');
  const [typeApiId, setTypeApiId] = useState('');
  const [apiIdTouched, setApiIdTouched] = useState(false);
  const [fields, setFields] = useState<DraftField[]>([]);
  const [activeExpand, setActiveExpand] = useState<string | null>(null);

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
          <span className="text-sm font-mono tracking-wider text-text-secondary block px-1 font-bold">
            Active Registered Models ({contentTypes.length})
          </span>

          {isLoading && (
            <div className="flex items-center gap-2 text-sm font-mono text-text-muted p-6">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading schemas...
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm font-mono text-status-error bg-status-error/10 border border-status-error/20 rounded-lg px-4 py-3">
              <AlertCircle className="w-3.5 h-3.5" /> Failed to load content types
            </div>
          )}

          <div className="space-y-4">
            {!isLoading && !error && contentTypes.length === 0 && (
              <div className="bg-brand-surface border border-brand-border p-8 rounded-xl text-center">
                <Database className="w-8 h-8 text-text-muted mx-auto mb-3" />
                <p className="text-sm font-mono text-text-muted">No content types yet. Create your first schema.</p>
              </div>
            )}

            {contentTypes.map(type => (
              <div
                key={type.id}
                className={`bg-brand-surface border p-5 rounded-xl shadow-xs space-y-4 transition-all ${
                  editingId === type.id
                    ? 'border-brand-accent ring-1 ring-brand-accent/30'
                    : 'border-brand-border hover:border-brand-accent/30'
                }`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1 min-w-0">
                    <span className="text-sm font-mono text-brand-secondary font-semibold select-none">Data Model Entry</span>
                    <h3 className="font-display font-bold text-base text-text-primary tracking-tight leading-none">{type.name}</h3>
                    <div className="flex items-center gap-1.5 text-sm font-mono text-text-muted mt-1 leading-none flex-wrap">
                      <span className="bg-brand-surface-soft border border-brand-border text-text-primary px-1.5 py-0.5 rounded font-bold">
                        id: {type.apiId}
                      </span>
                      <span>•</span>
                      <strong className="text-text-secondary">{type.fields.length} Fields</strong>
                    </div>
                  </div>

                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => setActiveExpand(activeExpand === type.id ? null : type.id)}
                      className="p-1.5 px-3 border border-brand-border rounded-lg bg-brand-surface hover:bg-brand-surface-soft text-sm font-mono font-semibold text-text-secondary cursor-pointer leading-none flex items-center gap-1"
                    >
                      Fields
                      <ChevronRight
                        className={`w-3.5 h-3.5 transition-transform ${activeExpand === type.id ? 'rotate-90' : ''}`}
                      />
                    </button>
                    <button
                      onClick={() => startEdit(type)}
                      disabled={!canManage}
                      className="p-1.5 border border-brand-border bg-brand-surface hover:bg-brand-accent/10 hover:text-brand-accent text-text-muted rounded cursor-pointer transition-colors disabled:opacity-40"
                      title="Edit Schema"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(type.id)}
                      disabled={!canManage || deleteMutation.isPending}
                      className="p-1.5 border border-brand-border bg-brand-surface hover:bg-status-error/10 hover:text-status-error text-text-muted rounded cursor-pointer transition-colors disabled:opacity-40"
                      title="Delete Schema"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {activeExpand === type.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden border-t border-brand-border pt-4"
                    >
                      <h4 className="text-sm font-mono font-bold text-text-muted uppercase mb-2">Field Specifications:</h4>
                      {type.fields.length === 0 ? (
                        <p className="text-sm font-mono text-text-muted">No fields defined.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm font-mono">
                          {type.fields.map(f => (
                            <div
                              key={f.key}
                              className="p-2 border border-brand-border/60 bg-brand-surface-soft/40 rounded flex items-start justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className="font-bold text-text-primary">{f.label}</span>
                                  {f.required && <span className="text-sm text-brand-accent font-bold">*</span>}
                                </div>
                                <p className="text-sm text-text-muted">{f.key}</p>
                              </div>
                              <span className="text-sm text-[#424d45] font-bold uppercase shrink-0">
                                [{FIELD_TYPE_LABELS[f.type as FieldType] ?? f.type}]
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

          <div className="bg-brand-surface border border-brand-border p-4 sm:p-5 rounded-xl shadow-xs">
            <h4 className="text-sm font-mono font-bold text-text-primary uppercase mb-1 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-brand-accent" />
              Dynamic REST inking schemas
            </h4>
            <p className="text-sm text-text-secondary font-light leading-relaxed">
              Whenever a schematic model is declared on the Wriven dashboard, our API routers compile separate TypeScript
              typings and deliver REST payloads dynamically. Use structured models to prevent validation errors at fetch times.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
