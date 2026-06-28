'use client';

import type { EntryStatus, FieldDef } from '@/lib/types';
import { RichTextEditor } from '@/components/editor/rich-text-editor';
import { MediaField } from '@/components/editor/media-field';

export const STATUS_COLORS: Record<EntryStatus, string> = {
  draft: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
  published: 'text-green-500 bg-green-500/10 border-green-500/30',
  archived: 'text-text-muted bg-brand-surface-soft border-brand-border',
};

/** A ProseMirror doc counts as empty if it has no text and no media node. */
export function isRichTextEmpty(v: unknown): boolean {
  if (!v) return true;
  if (typeof v === 'string') return v.trim() === '';
  return !/"type":"(text|image)"/.test(JSON.stringify(v));
}

/** Whether a field's value is "empty" for required-validation purposes. */
export function isFieldEmpty(field: FieldDef, value: unknown): boolean {
  switch (field.type) {
    case 'boolean':
      return false; // a checkbox is never "missing"
    case 'number':
      return value === undefined || value === null || (value as string) === '';
    case 'media':
      return Array.isArray(value) ? value.length === 0 : !value;
    case 'richtext':
      return isRichTextEmpty(value);
    default:
      return value === undefined || value === null || String(value).trim() === '';
  }
}

export function FieldInput({
  field,
  value,
  onChange,
  invalid,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  invalid?: boolean;
}) {
  const base = `w-full text-xs font-mono bg-brand-surface-soft border rounded-lg px-3.5 py-2.5 text-text-primary focus:outline-none ${
    invalid
      ? 'border-status-error focus:border-status-error'
      : 'border-brand-border focus:border-brand-accent'
  }`;
  const invalidWrap = invalid ? 'rounded-lg ring-1 ring-status-error' : '';

  switch (field.type) {
    case 'text':
      return (
        <input
          type="text"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={base}
          placeholder={field.label}
        />
      );
    case 'richtext':
      return (
        <div className={invalidWrap}>
          <RichTextEditor value={value} onChange={onChange} placeholder={`${field.label}…`} />
        </div>
      );
    case 'number':
      return (
        <input
          type="number"
          value={(value as number) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className={base}
        />
      );
    case 'boolean':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
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
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      );
    case 'select':
      return (
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={`${base} cursor-pointer`}
        >
          <option value="">— Select —</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case 'media':
      return (
        <div className={invalid ? 'rounded-lg ring-1 ring-status-error p-2' : ''}>
          <MediaField value={value} onChange={onChange} multiple={field.multiple} />
        </div>
      );
    case 'reference':
      return (
        <div className="text-[10px] font-mono text-text-muted p-3 border border-dashed border-brand-border rounded-lg">
          Reference picker — not yet available
        </div>
      );
    default:
      return null;
  }
}

/** Label + control + inline error for one structured field. */
export function FieldRow({
  field,
  value,
  onChange,
  error,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      {field.type !== 'boolean' && (
        <label className="flex items-center gap-1.5 text-2xs font-mono text-text-secondary">
          <span className={error ? 'text-status-error font-bold' : undefined}>{field.label}</span>
          {field.required && <span className="text-brand-accent font-bold">*</span>}
          <span className="text-[9px] text-text-muted uppercase ml-auto">[{field.type}]</span>
        </label>
      )}
      <FieldInput field={field} value={value} onChange={onChange} invalid={!!error} />
      {error && <p className="text-[9px] font-mono text-status-error">{error}</p>}
    </div>
  );
}
