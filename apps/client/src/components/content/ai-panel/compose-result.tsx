'use client';

import { AlertTriangle, ChevronDown, Wand2 } from 'lucide-react';
import { previewText } from './richtext';
import { RichTextPreview } from './rich-text-preview';
import type { ComposeField } from './types';

/**
 * The whole-entry compose result: truncation notice, one row per drafted field
 * (checkbox + expandable full value), apply-selected, undo, remaining quota.
 * Pure presentation — the mutation and undo snapshot live in ComposeSection.
 */
export function ComposeResult({
  fields,
  truncated,
  selected,
  onToggleSelected,
  expanded,
  onToggleExpanded,
  applied,
  onApply,
  onUndo,
  undoAvailable,
  remaining,
  onToggleAllExpanded,
}: {
  fields: ComposeField[];
  truncated?: boolean;
  selected: Set<string>;
  onToggleSelected: (key: string, checked: boolean) => void;
  expanded: Set<string>;
  onToggleExpanded: (key: string) => void;
  applied: boolean;
  onApply: () => void;
  onUndo: () => void;
  /** Undo stays available only until any applied field is manually edited. */
  undoAvailable: boolean;
  remaining: number | null;
  /** One-click expand/collapse of every field preview. */
  onToggleAllExpanded: (expand: boolean) => void;
}) {
  const allExpanded = fields.length > 0 && fields.every((f) => expanded.has(f.key));
  return (
    <div className="space-y-2 border-t border-brand-border pt-2">
      {fields.length === 0 && (
        <p className="text-xs font-mono text-status-error bg-status-error/10 border border-status-error/20 rounded-lg px-2.5 py-2">
          The draft came back empty. Try again or rephrase the brief.
        </p>
      )}
      {truncated && (
        <p className="flex items-start gap-1.5 text-xs font-mono text-status-warning bg-status-warning/10 border border-status-warning/20 rounded-lg px-2.5 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          The draft was cut off at the length limit — apply it, then refine the affected field with “Continue”.
        </p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
          Drafted fields
        </span>
        <button
          type="button"
          onClick={() => onToggleAllExpanded(!allExpanded)}
          aria-expanded={allExpanded}
          title={allExpanded ? 'Collapse all previews' : 'Expand all previews'}
          className="inline-flex items-center gap-1 text-xs font-mono text-text-muted hover:text-brand-accent transition-colors cursor-pointer"
        >
          {allExpanded ? 'Collapse all' : 'Expand all'}
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${allExpanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
      {fields.map((f) => (
        <div key={f.key} className="bg-brand-surface-soft border border-brand-border rounded-lg p-2.5">
          <label className="flex gap-2 items-start text-xs font-mono text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selected.has(f.key)}
              disabled={applied}
              onChange={(e) => onToggleSelected(f.key, e.target.checked)}
              className="mt-0.5 rounded border-brand-border text-brand-accent cursor-pointer focus:ring-0"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-text-primary">{f.label}</span>
              <span className="block text-text-muted truncate">
                {previewText(f.value, f.type) || <em>empty</em>}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onToggleExpanded(f.key)}
              aria-expanded={expanded.has(f.key)}
              className="text-text-muted hover:text-brand-accent transition-colors cursor-pointer mt-0.5"
              title={expanded.has(f.key) ? 'Collapse' : 'Show full value'}
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${expanded.has(f.key) ? 'rotate-180' : ''}`}
              />
            </button>
          </label>
          {expanded.has(f.key) &&
            (f.type === 'richtext' ? (
              <div className="mt-2">
                <RichTextPreview html={f.value} />
              </div>
            ) : (
              <p className="mt-2 text-xs font-mono text-text-primary bg-brand-surface border border-brand-border rounded-lg p-2.5 max-h-48 overflow-y-auto whitespace-pre-wrap">
                {f.value || <em>empty</em>}
              </p>
            ))}
        </div>
      ))}
      <button
        type="button"
        onClick={onApply}
        disabled={applied || selected.size === 0}
        className="w-full inline-flex items-center justify-center gap-2 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-sm py-2 px-4 rounded-lg transition-all cursor-pointer"
      >
        <Wand2 className="w-3.5 h-3.5" />
        {applied ? 'Applied' : `Apply ${selected.size} field${selected.size === 1 ? '' : 's'}`}
      </button>
      {applied && undoAvailable && (
        <button
          type="button"
          onClick={onUndo}
          className="w-full text-xs font-mono text-text-secondary hover:text-brand-accent transition-colors cursor-pointer"
        >
          Undo AI application
        </button>
      )}
      {remaining != null && (
        <p className="text-xs font-mono text-text-muted text-right">{remaining} left this month</p>
      )}
    </div>
  );
}
