'use client';

import { RefreshCw, Sparkles } from 'lucide-react';
import type { RefObject } from 'react';
import type { AiIntent, AiRefinePreset } from '@/lib/types';
import { GenerationProgressBar } from './generation-progress';
import { PRESET_HINTS, REFINE_PRESETS, type TargetField } from './types';

/**
 * The field flow's input controls: target selector, Generate/Refine intent,
 * preset chips (visible in both intents — clicking one switches to Refine),
 * instruction box, run/stop buttons, conversation reset. Pure presentation.
 */
export function FlowControls({
  targets,
  targetKey,
  onTargetChange,
  anyBusy,
  busy,
  intent,
  onIntentChange,
  preset,
  onPresetChange,
  refineDisabled,
  instruction,
  onInstructionChange,
  instructionRef,
  runDisabled,
  runLabel,
  onRun,
  onStopWaiting,
  /** Live phase label from useGenerationProgress; falls back to "Working…". */
  progressLabel,
  progress,
  historyTurns,
  onClearHistory,
}: {
  targets: TargetField[];
  targetKey: string;
  onTargetChange: (key: string) => void;
  anyBusy: boolean;
  busy: boolean;
  intent: AiIntent;
  onIntentChange: (intent: AiIntent) => void;
  preset: AiRefinePreset | undefined;
  onPresetChange: (preset: AiRefinePreset) => void;
  refineDisabled: boolean;
  instruction: string;
  onInstructionChange: (value: string) => void;
  instructionRef: RefObject<HTMLTextAreaElement | null>;
  runDisabled: boolean;
  runLabel: string;
  onRun: () => void;
  onStopWaiting: () => void;
  progressLabel: string | null;
  progress: number | null;
  historyTurns: number;
  onClearHistory: () => void;
}) {
  return (
    <>
      {/* Target field */}
      <label className="space-y-1.5">
        <span className="block text-xs font-mono uppercase tracking-wider text-text-muted">Field</span>
        <select
          value={targetKey}
          disabled={anyBusy}
          onChange={(e) => onTargetChange(e.target.value)}
          className="w-full text-sm font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-brand-accent"
        >
          {targets.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label} ({t.type})
            </option>
          ))}
        </select>
      </label>

      {/* Intent — the whole action model is these two choices. Refine only
          exists as a segment when there is content to refine; on an empty
          field a disabled toggle is noise, so Generate stands alone. */}
      <div
        role="group"
        aria-label="What should AI do"
        className={`grid gap-1 p-1 bg-brand-surface-soft border border-brand-border rounded-lg ${refineDisabled ? 'grid-cols-1' : 'grid-cols-2'}`}
      >
        <button
          type="button"
          aria-pressed={intent === 'generate'}
          onClick={() => onIntentChange('generate')}
          className={`text-sm font-mono font-bold py-1.5 rounded transition-colors cursor-pointer ${
            intent === 'generate'
              ? 'bg-brand-surface text-brand-accent border border-brand-border'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          Generate
        </button>
        {!refineDisabled && (
          <button
            type="button"
            aria-pressed={intent === 'refine'}
            onClick={() => onIntentChange('refine')}
            className={`text-sm font-mono font-bold py-1.5 rounded transition-colors cursor-pointer ${
              intent === 'refine'
                ? 'bg-brand-surface text-brand-accent border border-brand-border'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Refine
          </button>
        )}
      </div>

      {/* Refine presets — shortcuts, not modes. Shown only while Refine is the
          active intent: they are refine verbs and must not read as generate
          options. */}
      {intent === 'refine' && !refineDisabled && (
        <div className="flex flex-wrap gap-1.5">
          {REFINE_PRESETS.map((option) => {
            const active = intent === 'refine' && preset === option.key;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                onClick={() => onPresetChange(option.key)}
                className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                  active
                    ? 'bg-brand-secondary/15 text-brand-secondary border-brand-secondary/40'
                    : 'bg-brand-surface-soft text-text-muted border-brand-border hover:text-text-secondary hover:border-brand-accent/40'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Instruction — always required: an instruction-less generation has no
          topic anchor and burns a quota unit on generic filler. */}
      <label className="space-y-1.5">
        <span className="block text-xs font-mono uppercase tracking-wider text-text-muted">
          Instruction <span className="normal-case text-text-muted/70">— required</span>
        </span>
        <textarea
          ref={instructionRef}
          rows={4}
          value={instruction}
          onChange={(e) => onInstructionChange(e.target.value)}
          placeholder={
            intent === 'refine'
              ? preset
                ? PRESET_HINTS[preset]
                : 'How should it change? e.g. make it punchier'
              : 'What should the AI write? e.g. a launch post about our new pricing'
          }
          className="w-full text-sm font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-3 text-text-primary focus:outline-none focus:border-brand-accent leading-relaxed resize-y"
        />
      </label>

      <button
        type="button"
        onClick={onRun}
        disabled={runDisabled}
        className="w-full inline-flex items-center justify-center gap-2 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-sm py-2.5 px-4 rounded-lg transition-all cursor-pointer neo-shadow"
      >
        {busy ? (
          <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> {progressLabel ?? 'Working…'}</>
        ) : (
          <>
            <Sparkles className="w-3.5 h-3.5" /> {runLabel}
          </>
        )}
      </button>

      {busy && progress !== null && <GenerationProgressBar progress={progress} />}

      {busy && (
        <button
          type="button"
          onClick={onStopWaiting}
          className="text-xs font-mono text-text-muted hover:text-text-secondary transition-colors cursor-pointer text-left"
        >
          Stop waiting — the provider may still finish, and this request can be safely retried.
        </button>
      )}

      {historyTurns > 0 && (
        <button
          type="button"
          onClick={onClearHistory}
          className="text-xs font-mono text-text-muted hover:text-brand-accent transition-colors cursor-pointer text-left"
        >
          Clear conversation ({historyTurns} turns)
        </button>
      )}
    </>
  );
}
