'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Database,
  Plus,
  Trash2,
  ChevronRight,
  Type,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { contentApi } from '@/lib/api';
import type { FieldDef, FieldType } from '@/lib/types';

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
  options: string;
}

export default function ContentTypesPage() {
  const qc = useQueryClient();

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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contentApi.deleteType(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-types'] }),
  });

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
  const [candOptions, setCandOptions] = useState('');

  const resetForm = () => {
    setTypeName('');
    setTypeApiId('');
    setApiIdTouched(false);
    setFields([]);
    setCandLabel('');
    setCandKey('');
    setCandKeyTouched(false);
    setCandType('text');
    setCandRequired(false);
    setCandOptions('');
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
    setFields(prev => [
      ...prev,
      {
        _id: crypto.randomUUID(),
        key: candKey,
        label: candLabel,
        type: candType,
        required: candRequired,
        options: candOptions,
      },
    ]);
    setCandLabel('');
    setCandKey('');
    setCandKeyTouched(false);
    setCandType('text');
    setCandRequired(false);
    setCandOptions('');
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
      ...(f.type === 'select' && f.options
        ? { options: f.options.split(',').map(s => s.trim()).filter(Boolean) }
        : {}),
    }));
    createMutation.mutate({ name: typeName, apiId: typeApiId, fields: dtoFields });
  };

  const errMsg = createMutation.error
    ? ((createMutation.error as any)?.error?.message ?? 'Failed to create content type')
    : null;

  return (
    <div className="space-y-8 text-left">
      <div className="border-b border-brand-border pb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
            Structure & <span className="font-normal italic text-brand-secondary">Content Types</span>
          </h1>
          <p className="text-2xs sm:text-xs font-mono text-text-muted mt-1 leading-relaxed">
            {'// Configure functional layout models and relational schema attributes'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Left: Create form */}
        <div className="lg:col-span-5 bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-5">
          <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold">
            Assemble Content Layout Model
          </span>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-2xs font-mono text-text-secondary mb-1.5">Schema Name</label>
              <input
                type="text"
                placeholder="e.g. Blog Articles, Product Specs..."
                value={typeName}
                onChange={e => handleNameChange(e.target.value)}
                required
                className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3.5 py-3 text-text-primary focus:outline-none focus:border-brand-accent"
              />
            </div>

            <div>
              <label className="block text-2xs font-mono text-text-secondary mb-1.5">
                API ID <span className="text-text-muted">(snake_case, auto-derived)</span>
              </label>
              <input
                type="text"
                placeholder="blog_articles"
                value={typeApiId}
                onChange={e => { setTypeApiId(e.target.value); setApiIdTouched(true); }}
                required
                className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3.5 py-3 text-text-primary focus:outline-none focus:border-brand-accent"
              />
            </div>

            {/* Field builder */}
            <div className="space-y-3.5 border-t border-brand-border pt-4">
              <span className="block text-2xs font-mono text-text-secondary font-bold">
                Field Specifications ({fields.length})
              </span>

              <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                {fields.length === 0 && (
                  <p className="text-[10px] font-mono text-text-muted text-center py-3">No fields yet — add one below</p>
                )}
                {fields.map(f => (
                  <div
                    key={f._id}
                    className="flex items-center justify-between bg-brand-surface-soft border border-brand-border px-3 py-2 rounded-lg text-2xs font-mono"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Type className="w-3.5 h-3.5 text-brand-secondary shrink-0" />
                      <strong className="text-text-primary truncate">{f.label}</strong>
                      <span className="text-text-muted uppercase text-[9px] font-semibold shrink-0">({f.type})</span>
                      {f.required && <span className="text-[8px] font-bold text-brand-accent shrink-0">*</span>}
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
                  className="w-full text-2xs font-mono bg-brand-surface border border-brand-border rounded p-2 text-text-primary"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="key (snake_case)"
                    value={candKey}
                    onChange={e => { setCandKey(e.target.value); setCandKeyTouched(true); }}
                    className="text-2xs font-mono bg-brand-surface border border-brand-border rounded p-2 text-text-primary"
                  />
                  <select
                    value={candType}
                    onChange={e => setCandType(e.target.value as FieldType)}
                    className="bg-brand-surface border border-brand-border rounded p-2 text-2xs font-mono text-text-primary outline-hidden cursor-pointer"
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
                    className="w-full text-2xs font-mono bg-brand-surface border border-brand-border rounded p-2 text-text-primary"
                  />
                )}

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 font-mono text-[9px] text-text-secondary cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={candRequired}
                      onChange={e => setCandRequired(e.target.checked)}
                      className="rounded border-brand-border text-brand-accent cursor-pointer focus:ring-0"
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    onClick={addField}
                    disabled={!candLabel.trim() || !candKey.trim()}
                    className="px-3 py-1 border border-dashed border-brand-border hover:border-brand-accent font-mono text-3xs font-bold text-text-secondary hover:text-brand-accent cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + Add field
                  </button>
                </div>
              </div>
            </div>

            {errMsg && (
              <div className="flex items-center gap-2 text-[10px] font-mono text-status-error bg-status-error/10 border border-status-error/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {errMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={!typeName.trim() || !typeApiId.trim() || createMutation.isPending}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-2xs py-3 rounded-lg neo-shadow cursor-pointer transition-all"
            >
              {createMutation.isPending ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Compiling...</>
              ) : (
                <><Plus className="w-4 h-4 text-white" /> Compile Schematic Model</>
              )}
            </button>
          </form>
        </div>

        {/* Right: List */}
        <div className="lg:col-span-7 space-y-4">
          <span className="text-[11px] font-mono tracking-wider text-text-secondary block px-1 font-bold">
            Active Registered Models ({contentTypes.length})
          </span>

          {isLoading && (
            <div className="flex items-center gap-2 text-xs font-mono text-text-muted p-6">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading schemas...
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-[10px] font-mono text-status-error bg-status-error/10 border border-status-error/20 rounded-lg px-4 py-3">
              <AlertCircle className="w-3.5 h-3.5" /> Failed to load content types
            </div>
          )}

          <div className="space-y-4">
            {!isLoading && !error && contentTypes.length === 0 && (
              <div className="bg-brand-surface border border-brand-border p-8 rounded-xl text-center">
                <Database className="w-8 h-8 text-text-muted mx-auto mb-3" />
                <p className="text-xs font-mono text-text-muted">No content types yet. Create your first schema.</p>
              </div>
            )}

            {contentTypes.map(type => (
              <div
                key={type.id}
                className="bg-brand-surface border border-brand-border hover:border-brand-accent/30 p-5 rounded-xl shadow-xs space-y-4 transition-all"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1 min-w-0">
                    <span className="text-[9px] font-mono text-brand-secondary font-semibold select-none">Data Model Entry</span>
                    <h3 className="font-display font-bold text-base text-text-primary tracking-tight leading-none">{type.name}</h3>
                    <div className="flex items-center gap-1.5 text-3xs font-mono text-text-muted mt-1 leading-none flex-wrap">
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
                      className="p-1.5 px-3 border border-brand-border rounded-lg bg-brand-surface hover:bg-brand-surface-soft text-2xs font-mono font-semibold text-text-secondary cursor-pointer leading-none flex items-center gap-1"
                    >
                      Fields
                      <ChevronRight
                        className={`w-3.5 h-3.5 transition-transform ${activeExpand === type.id ? 'rotate-90' : ''}`}
                      />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(type.id)}
                      disabled={deleteMutation.isPending}
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
                      <h4 className="text-[9px] font-mono font-bold text-text-muted uppercase mb-2">Field Specifications:</h4>
                      {type.fields.length === 0 ? (
                        <p className="text-[10px] font-mono text-text-muted">No fields defined.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-2xs font-mono">
                          {type.fields.map(f => (
                            <div
                              key={f.key}
                              className="p-2 border border-brand-border/60 bg-brand-surface-soft/40 rounded flex items-start justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className="font-bold text-text-primary">{f.label}</span>
                                  {f.required && <span className="text-[8px] text-brand-accent font-bold">*</span>}
                                </div>
                                <p className="text-[9px] text-text-muted">{f.key}</p>
                              </div>
                              <span className="text-[9px] text-[#424d45] font-bold uppercase shrink-0">
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
            <h4 className="text-2xs font-mono font-bold text-text-primary uppercase mb-1 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-brand-accent" />
              Dynamic REST inking schemas
            </h4>
            <p className="text-[11px] text-text-secondary font-light leading-relaxed">
              Whenever a schematic model is declared on the Wriven dashboard, our API routers compile separate TypeScript
              typings and deliver REST payloads dynamically. Use structured models to prevent validation errors at fetch times.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
