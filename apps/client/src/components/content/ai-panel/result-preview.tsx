'use client';

import { AlertTriangle, Wand2 } from 'lucide-react';
import type { ApplyMode, Result, TargetField } from './types';
import { InlineDiff } from './inline-diff';
import { RichTextPreview } from './rich-text-preview';

/**
 * The generated-result block: truncation notice, safe preview, regeneration
 * comparison, apply mode, apply/undo. Pure presentation — state lives in the
 * field flow.
 */
export function ResultPreview({
  result,
  targets,
  applyMode,
  onApplyModeChange,
  applied,
  onApply,
  onUndo,
  undoAvailable,
  alternates,
  onChooseAlternate,
}: {
  result: Result;
  targets: TargetField[];
  applyMode: ApplyMode;
  onApplyModeChange: (mode: ApplyMode) => void;
  applied: boolean;
  onApply: () => void;
  onUndo: () => void;
  /** Undo stays available only until the author manually edits the applied field. */
  undoAvailable: boolean;
  alternates: Result[];
  onChooseAlternate: (candidate: Result) => void;
}) {
  return (
    <div className="space-y-2 border-t border-brand-border pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-wider text-text-muted">Preview</span>
        {result.remaining != null && (
          <span className="text-xs font-mono text-text-muted">{result.remaining} left this month</span>
        )}
      </div>
      {result.truncated && (
        <p className="flex items-start gap-1.5 text-xs font-mono text-status-warning bg-status-warning/10 border border-status-warning/20 rounded-lg px-2.5 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          This response was cut off at the length limit — refine with “Continue” or shorten the input.
        </p>
      )}
      {result.targetType === 'richtext' ? (
        <RichTextPreview html={result.text} />
      ) : (
        <div className="text-sm font-sans text-text-primary bg-brand-surface-soft border border-brand-border rounded-lg p-3 max-h-64 overflow-y-auto whitespace-pre-wrap">
          {result.text}
        </div>
      )}
      {result.sourceContent && result.targetType !== 'richtext' && (
        <InlineDiff before={result.sourceContent} after={result.text} />
      )}
      {alternates.length > 0 && (
        <div className="space-y-1.5">
          <span className="block text-xs font-mono uppercase tracking-wider text-text-muted">
            Regeneration comparison
          </span>
          {alternates.map((candidate, index) => (
            <button
              key={candidate.generationId}
              type="button"
              onClick={() => onChooseAlternate(candidate)}
              className="w-full text-left text-xs font-mono text-text-secondary bg-brand-surface-soft border border-brand-border rounded px-2.5 py-2 hover:border-brand-accent/60 transition-colors cursor-pointer"
            >
              Use previous result {index + 1}: {candidate.text.slice(0, 90)}{candidate.text.length > 90 ? '…' : ''}
            </button>
          ))}
        </div>
      )}
      {result.targetType !== 'select' && (
        <label className="space-y-1">
          <span className="block text-xs font-mono uppercase tracking-wider text-text-muted">Apply mode</span>
          <select
            value={applyMode}
            onChange={(e) => onApplyModeChange(e.target.value as ApplyMode)}
            className="w-full text-sm font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-brand-accent"
          >
            <option value="replace">Replace field</option>
            <option value="append">Append to field</option>
            <option value="prepend">Insert before field</option>
          </select>
        </label>
      )}
      <button
        type="button"
        onClick={onApply}
        disabled={applied}
        className="w-full inline-flex items-center justify-center gap-2 bg-brand-secondary/90 hover:bg-brand-secondary text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-sm py-2 px-4 rounded-lg transition-all cursor-pointer mt-3"
      >
        <Wand2 className="w-3.5 h-3.5" />{' '}
        {applied
          ? 'Applied'
          : `Apply to “${targets.find((t) => t.key === result.targetKey)?.label ?? 'field'}”`}
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
    </div>
  );
}
