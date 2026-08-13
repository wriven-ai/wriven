'use client';

import { useMutation } from '@tanstack/react-query';
import { generateHTML, generateJSON } from '@tiptap/html';
import Link from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { AlertTriangle, FileText, RefreshCw, Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { aiApi } from '@/lib/api';
import type { AiIntent, AiRefinePreset } from '@/lib/types';

/** One turn of multi-turn refinement (client-held). Mirrors contracts AiTurn. */
type AiTurn = { role: 'user' | 'assistant'; content: string };

/**
 * Refine shortcuts. These only prefill the author's intent — the server maps each
 * to a tuned prompt, so they are chips beside one instruction box rather than a
 * list of co-equal modes.
 */
const REFINE_PRESETS: { key: AiRefinePreset; label: string }[] = [
  { key: 'shorten', label: 'Shorten' },
  { key: 'expand', label: 'Expand' },
  { key: 'rewrite', label: 'Rewrite' },
  { key: 'tone', label: 'Change tone' },
  { key: 'summarize', label: 'Summarize' },
  { key: 'continue', label: 'Continue' },
];

/** Placeholder copy per preset, so the instruction box always tells the author what to type. */
const PRESET_HINTS: Record<AiRefinePreset, string> = {
  shorten: 'e.g. cut it to two sentences',
  expand: 'e.g. add a paragraph about pricing',
  rewrite: 'e.g. make it clearer for beginners',
  tone: 'Describe the tone — e.g. confident and concise',
  summarize: 'e.g. summarize as three bullets',
  continue: 'e.g. keep going for one more paragraph',
};

type Result = {
  generationId: string;
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  remaining: number | null;
  truncated?: boolean;
  targetKey: string;
  targetType: string;
  intent: AiIntent;
  preset?: AiRefinePreset;
  instruction: string;
  sourceContent?: string;
};

type GenerationInput = {
  requestId: string;
  targetKey: string;
  targetType: string;
  sourceContent?: string;
  intent: AiIntent;
  preset?: AiRefinePreset;
  instruction: string;
  history: AiTurn[];
};

type ApplyMode = 'replace' | 'append' | 'prepend';

const TIER1 = ['text', 'richtext', 'select'];

/**
 * AI Co-Writer panel. Generates or refines a Tier-1 field (text | richtext |
 * select), multi-turn (client-held history), then applies the result to the
 * entry form. Richtext: AI emits semantic HTML → parsed to ProseMirror JSON via
 * `generateJSON` on apply (structure preserved: headings, lists, links). The
 * preview is a read-only TipTap instance so only schema-valid HTML renders
 * (scripts/unknown tags dropped — safe).
 *
 * Eligibility is derived, not configured: any single-value text/richtext/select
 * field that isn't marked sensitive. See specs/21.
 */
export function AiPanel({
  contentTypeId,
  entryId,
  fields,
  fieldValues,
  setField,
  onApplied,
  onUnapplied,
}: {
  contentTypeId: string;
  entryId?: string;
  fields: {
    key: string;
    label: string;
    type: string;
    options?: string[];
    multiple?: boolean;
    aiPrivate?: boolean;
  }[];
  fieldValues: Record<string, unknown>;
  setField: (key: string, value: unknown) => void;
  /** Lets the editor link this explicit apply to the next saved revision. */
  onApplied?: (generationId: string) => void;
  onUnapplied?: (generationId: string) => void;
}) {
  // Tier-1, single-value, non-sensitive fields.
  const targets = useMemo(
    () => fields.filter((f) => TIER1.includes(f.type) && !f.multiple && !f.aiPrivate),
    [fields],
  );
  const defaultTarget = targets.find((t) => t.type === 'richtext')?.key ?? targets[0]?.key ?? '';

  const [targetKey, setTargetKey] = useState(defaultTarget);
  const [intent, setIntent] = useState<AiIntent>('generate');
  const [preset, setPreset] = useState<AiRefinePreset | undefined>(undefined);
  const [instruction, setInstruction] = useState('');
  const [histories, setHistories] = useState<Record<string, AiTurn[]>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [alternates, setAlternates] = useState<Result[]>([]);
  const [applied, setApplied] = useState(false);
  const [applyMode, setApplyMode] = useState<ApplyMode>('replace');
  const [cancelled, setCancelled] = useState(false);
  // Whole-entry compose is a separate, self-contained flow from the per-field one.
  const [composeBrief, setComposeBrief] = useState('');
  const [composeResult, setComposeResult] = useState<{
    generationId: string;
    fields: { key: string; label: string; type: string; value: string }[];
    remaining: number | null;
    truncated?: boolean;
  } | null>(null);
  const [composeSelected, setComposeSelected] = useState<Set<string>>(new Set());
  const [composeApplied, setComposeApplied] = useState(false);
  const lastAttemptRef = useRef<GenerationInput | null>(null);
  const requestInFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const undoRef = useRef<{ key: string; value: unknown } | null>(null);
  const resultRef = useRef<Result | null>(null);
  const instructionRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  // Reset when the available fields change (content type switch).
  useEffect(() => {
    setTargetKey((cur) => (targets.some((t) => t.key === cur) ? cur : defaultTarget));
  }, [targets, defaultTarget]);

  const target = targets.find((t) => t.key === targetKey);
  const history = histories[targetKey] ?? [];
  // A select holds one allowed value: refining an enum choice is meaningless.
  const canRefine = target?.type !== 'select';
  const draft = serializeSourceContent(fieldValues[targetKey], target?.type ?? 'text');
  const unAppliedDraft = result?.targetKey === targetKey && !applied ? result.text : undefined;
  const sourceContent = unAppliedDraft ?? draft;

  // Refine needs something to work on; fall back to generate when the field is empty.
  useEffect(() => {
    if (!canRefine || (!draft && !unAppliedDraft)) {
      setIntent('generate');
      setPreset(undefined);
    }
  }, [canRefine, draft, unAppliedDraft]);

  const mutation = useMutation({
    mutationFn: (input: GenerationInput) => {
      const controller = new AbortController();
      abortRef.current = controller;
      return aiApi.generate(
        {
          requestId: input.requestId,
          contentTypeId,
          entryId,
          targetKind: 'field',
          fieldKey: input.targetKey,
          intent: input.intent,
          preset: input.preset,
          instruction: input.instruction || undefined,
          sourceContent: input.sourceContent,
          history: input.history.length ? input.history : undefined,
        },
        controller.signal,
      );
    },
    onSuccess: (data, input) => {
      // The field flow only ever targets one field, so output is always scalar.
      const text = data.output.kind === 'scalar' ? data.output.text : '';
      const next: Result = {
        generationId: data.generationId,
        text,
        model: data.model,
        usage: data.usage,
        remaining: data.remaining,
        truncated: data.truncated,
        targetKey: input.targetKey,
        targetType: input.targetType,
        intent: input.intent,
        preset: input.preset,
        instruction: input.instruction,
        sourceContent: input.sourceContent,
      };
      const current = resultRef.current;
      if (current && current.targetKey === next.targetKey) {
        setAlternates((previous) => [current, ...previous].slice(0, 2));
      }
      setResult(next);
      // A generation is immediately a conversational draft. Authors can refine
      // it before applying it to the entry; apply is only a deliberate mutation.
      setHistories((previous) => ({
        ...previous,
        [input.targetKey]: [
          ...(previous[input.targetKey] ?? []),
          { role: 'user' as const, content: generationTurnLabel(input) },
          { role: 'assistant' as const, content: text },
        ].slice(-8),
      }));
      setApplied(false);
      setCancelled(false);
      lastAttemptRef.current = null;
    },
    onSettled: () => {
      requestInFlightRef.current = false;
      abortRef.current = null;
    },
  });

  const submit = (input: GenerationInput) => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setCancelled(false);
    lastAttemptRef.current = input;
    mutation.mutate(input);
  };

  const run = () => {
    if (!target) return;
    const refining = intent === 'refine' && canRefine;
    submit({
      requestId: crypto.randomUUID(),
      targetKey: target.key,
      targetType: target.type,
      // Refine transforms the author's actual draft; generate starts fresh.
      sourceContent: refining ? sourceContent : undefined,
      intent: refining ? 'refine' : 'generate',
      preset: refining ? preset : undefined,
      instruction,
      history,
    });
  };

  const composeMutation = useMutation({
    mutationFn: (input: { requestId: string; instruction: string }) =>
      aiApi.generate({
        requestId: input.requestId,
        contentTypeId,
        entryId,
        targetKind: 'entry',
        intent: 'generate',
        instruction: input.instruction || undefined,
      }),
    onSuccess: (data) => {
      if (data.output.kind !== 'record') return;
      const fields = Object.entries(data.output.fields).map(([key, value]) => {
        const def = targets.find((t) => t.key === key);
        return { key, label: def?.label ?? key, type: def?.type ?? 'text', value };
      });
      setComposeResult({
        generationId: data.generationId,
        fields,
        remaining: data.remaining,
        truncated: data.truncated,
      });
      // Default to applying every drafted field; the author unchecks any to skip.
      setComposeSelected(new Set(fields.map((f) => f.key)));
      setComposeApplied(false);
    },
  });

  const runCompose = () => {
    if (composeMutation.isPending) return;
    setComposeApplied(false);
    composeMutation.mutate({ requestId: crypto.randomUUID(), instruction: composeBrief });
  };

  const applyCompose = () => {
    if (!composeResult) return;
    for (const f of composeResult.fields) {
      if (!composeSelected.has(f.key)) continue;
      applyGeneratedField(setField, f.key, f.value, f.type);
    }
    setComposeApplied(true);
    onApplied?.(composeResult.generationId);
  };

  const chooseIntent = (next: AiIntent) => {
    setIntent(next);
    if (next === 'generate') setPreset(undefined);
  };

  const choosePreset = (next: AiRefinePreset) => {
    setIntent('refine');
    setPreset((current) => (current === next ? undefined : next));
    instructionRef.current?.focus();
  };

  const apply = () => {
    if (!result) return;
    undoRef.current = { key: result.targetKey, value: fieldValues[result.targetKey] };
    const existing = serializeSourceContent(fieldValues[result.targetKey], result.targetType) ?? '';
    const output = combineContent(existing, result.text, result.targetType, applyMode);
    if (result.targetType === 'richtext') {
      // AI emitted semantic HTML → ProseMirror JSON (headings/lists/links preserved).
      try {
        const doc = generateJSON(output, [
          StarterKit,
          Link.configure({
            HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
          }),
        ]);
        setField(result.targetKey, doc);
      } catch {
        // Malformed HTML — fall back to inserting the raw text as paragraphs.
        setField(result.targetKey, output);
      }
    } else {
      setField(result.targetKey, output.trim());
    }
    setApplied(true);
    onApplied?.(result.generationId);
  };

  const undoApply = () => {
    if (!undoRef.current) return;
    setField(undoRef.current.key, undoRef.current.value);
    setApplied(false);
    if (result) onUnapplied?.(result.generationId);
  };

  const stopWaiting = () => {
    abortRef.current?.abort();
    setCancelled(true);
  };

  if (targets.length === 0) {
    return (
      <aside className="lg:col-span-4">
        <PanelShell>
          <p className="p-5 text-sm font-mono text-text-muted leading-relaxed">
            AI generation needs a text, richtext, or select field on this content type.
          </p>
        </PanelShell>
      </aside>
    );
  }

  const errCode = (mutation.error as { error?: { code?: string } })?.error?.code;
  const errMsg: Record<string, string> = {
    AI_NOT_CONFIGURED: 'AI is not configured on this workspace.',
    AI_QUOTA_UNAVAILABLE: 'AI usage could not be verified. Please try again shortly.',
    PLAN_LIMIT_REACHED: 'Monthly AI generation limit reached for your plan.',
    RATE_LIMITED: 'Too many AI requests — please slow down.',
    AI_GENERATION_FAILED: 'Generation failed. Try again or rephrase.',
    AI_INPUT_TOO_LARGE:
      'This request is too large. Shorten the field content or clear the conversation.',
    AI_GENERATION_IN_PROGRESS: 'This generation is still in progress. Retry safely in a moment.',
    IDEMPOTENCY_KEY_REUSED: 'That generation request cannot be reused. Start a new generation.',
    VALIDATION_ERROR: 'That field does not support AI generation.',
  };

  const refineDisabled = !canRefine || (!draft && !unAppliedDraft);
  const busy = mutation.isPending;

  return (
    <aside className="lg:col-span-4">
      <PanelShell>
        <div className="flex flex-col gap-3 p-5">
          {/* Whole-entry compose — drafts every eligible field in one call. */}
          <details className="border border-brand-border rounded-lg bg-brand-surface-soft/40">
            <summary className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-text-secondary cursor-pointer select-none hover:text-text-primary">
              <FileText className="w-3.5 h-3.5 text-brand-secondary" />
              Draft whole entry
            </summary>
            <div className="p-3 pt-1 space-y-2">
              <textarea
                rows={2}
                value={composeBrief}
                onChange={(e) => setComposeBrief(e.target.value)}
                placeholder="Brief — e.g. a launch post about our new pricing"
                className="w-full text-sm font-mono bg-brand-surface border border-brand-border rounded-lg p-2.5 text-text-primary focus:outline-none focus:border-brand-accent resize-y"
              />
              <button
                type="button"
                onClick={runCompose}
                disabled={composeMutation.isPending}
                className="w-full inline-flex items-center justify-center gap-2 bg-brand-secondary/90 hover:bg-brand-secondary text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-sm py-2 px-4 rounded-lg transition-all cursor-pointer"
              >
                {composeMutation.isPending ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Drafting…</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5" /> Draft entry</>
                )}
              </button>
              {composeMutation.isError && (
                <p className="text-xs font-mono text-status-error bg-status-error/10 border border-status-error/20 rounded-lg px-2.5 py-2">
                  {errMsg[(composeMutation.error as { error?: { code?: string } })?.error?.code ?? ''] ??
                    'Drafting failed. Try again or rephrase the brief.'}
                </p>
              )}
              {composeResult && (
                <div className="space-y-2 border-t border-brand-border pt-2">
                  {composeResult.truncated && (
                    <p className="flex items-start gap-1.5 text-xs font-mono text-status-warning bg-status-warning/10 border border-status-warning/20 rounded-lg px-2.5 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                      The draft was cut off at the length limit.
                    </p>
                  )}
                  {composeResult.fields.map((f) => (
                    <label
                      key={f.key}
                      className="flex gap-2 items-start text-xs font-mono text-text-secondary cursor-pointer select-none bg-brand-surface-soft border border-brand-border rounded-lg p-2.5"
                    >
                      <input
                        type="checkbox"
                        checked={composeSelected.has(f.key)}
                        onChange={(e) =>
                          setComposeSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(f.key);
                            else next.delete(f.key);
                            return next;
                          })
                        }
                        className="mt-0.5 rounded border-brand-border text-brand-accent cursor-pointer focus:ring-0"
                      />
                      <span className="min-w-0">
                        <span className="block font-bold text-text-primary">{f.label}</span>
                        <span className="block text-text-muted truncate">
                          {previewText(f.value, f.type) || <em>empty</em>}
                        </span>
                      </span>
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={applyCompose}
                    disabled={composeApplied || composeSelected.size === 0}
                    className="w-full inline-flex items-center justify-center gap-2 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-sm py-2 px-4 rounded-lg transition-all cursor-pointer"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    {composeApplied ? 'Applied' : `Apply ${composeSelected.size} field${composeSelected.size === 1 ? '' : 's'}`}
                  </button>
                  {composeResult.remaining != null && (
                    <p className="text-xs font-mono text-text-muted text-right">
                      {composeResult.remaining} left this month
                    </p>
                  )}
                </div>
              )}
            </div>
          </details>

          {/* Target field */}
          <label className="space-y-1.5">
            <span className="block text-xs font-mono uppercase tracking-wider text-text-muted">Field</span>
            <select
              value={targetKey}
              onChange={(e) => {
                setTargetKey(e.target.value);
                setResult(null);
                setAlternates([]);
                setApplied(false);
                setApplyMode('replace');
                setPreset(undefined);
              }}
              className="w-full text-sm font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-brand-accent"
            >
              {targets.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label} ({t.type})
                </option>
              ))}
            </select>
          </label>

          {/* Intent — the whole action model is these two choices. */}
          <div
            role="group"
            aria-label="What should AI do"
            className="grid grid-cols-2 gap-1 p-1 bg-brand-surface-soft border border-brand-border rounded-lg"
          >
            {(['generate', 'refine'] as const).map((option) => {
              const disabled = option === 'refine' && refineDisabled;
              const active = intent === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  disabled={disabled}
                  onClick={() => chooseIntent(option)}
                  title={
                    disabled
                      ? canRefine
                        ? 'Add some content to this field first'
                        : 'A select field can only be generated'
                      : undefined
                  }
                  className={`text-sm font-mono font-bold py-1.5 rounded transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                    active
                      ? 'bg-brand-surface text-brand-accent border border-brand-border'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {option === 'generate' ? 'Generate' : 'Refine'}
                </button>
              );
            })}
          </div>

          {/* Refine presets — shortcuts, not modes. */}
          {intent === 'refine' && !refineDisabled && (
            <div className="flex flex-wrap gap-1.5">
              {REFINE_PRESETS.map((option) => {
                const active = preset === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => choosePreset(option.key)}
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

          {/* Instruction */}
          <label className="space-y-1.5">
            <span className="block text-xs font-mono uppercase tracking-wider text-text-muted">
              Instruction{' '}
              <span className="normal-case text-text-muted/70">
                {preset === 'tone' ? '— required' : '— optional'}
              </span>
            </span>
            <textarea
              ref={instructionRef}
              rows={4}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={
                intent === 'refine' && preset
                  ? PRESET_HINTS[preset]
                  : 'e.g. Add 3 bullet points about pricing'
              }
              className="w-full text-sm font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-3 text-text-primary focus:outline-none focus:border-brand-accent leading-relaxed resize-y"
            />
          </label>

          <button
            type="button"
            onClick={run}
            disabled={
              busy || !targetKey || (intent === 'refine' && preset === 'tone' && !instruction.trim())
            }
            className="w-full inline-flex items-center justify-center gap-2 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-sm py-2.5 px-4 rounded-lg transition-all cursor-pointer neo-shadow"
          >
            {busy ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Working…</>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />{' '}
                {intent === 'refine' ? 'Refine' : result?.targetKey === targetKey && !applied ? 'Regenerate' : 'Generate'}
              </>
            )}
          </button>

          {busy && (
            <button
              type="button"
              onClick={stopWaiting}
              className="text-xs font-mono text-text-muted hover:text-text-secondary transition-colors cursor-pointer text-left"
            >
              Stop waiting — the provider may still finish, and this request can be safely retried.
            </button>
          )}

          {history.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setHistories((prev) => ({ ...prev, [targetKey]: [] }));
                if (result?.targetKey === targetKey) {
                  setResult(null);
                  setAlternates([]);
                }
              }}
              className="text-xs font-mono text-text-muted hover:text-brand-accent transition-colors cursor-pointer text-left"
            >
              Clear conversation ({history.length / 2} turns)
            </button>
          )}

          {/* Error */}
          {mutation.isError && !cancelled && (
            <div className="text-sm font-mono text-status-error bg-status-error/10 border border-status-error/20 rounded-lg px-3 py-2">
              {errMsg[errCode ?? ''] ?? 'Something went wrong. Try again.'}
            </div>
          )}

          {mutation.isError && !cancelled && lastAttemptRef.current && (
            <button
              type="button"
              onClick={() => submit(lastAttemptRef.current as GenerationInput)}
              disabled={busy}
              className="text-xs font-mono text-brand-secondary hover:text-brand-accent transition-colors cursor-pointer text-left disabled:opacity-50"
            >
              Retry the same request safely
            </button>
          )}

          {/* Preview */}
          {result && (
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
                      onClick={() => {
                        setAlternates((previous) => [result, ...previous.filter((item) => item.generationId !== candidate.generationId)].slice(0, 2));
                        setResult(candidate);
                        setApplied(false);
                      }}
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
                    onChange={(e) => setApplyMode(e.target.value as ApplyMode)}
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
                onClick={apply}
                disabled={applied}
                className="w-full inline-flex items-center justify-center gap-2 bg-brand-secondary/90 hover:bg-brand-secondary text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-sm py-2 px-4 rounded-lg transition-all cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5" />{' '}
                {applied
                  ? 'Applied'
                  : `Apply to “${targets.find((t) => t.key === result.targetKey)?.label ?? 'field'}”`}
              </button>
              {applied && undoRef.current && (
                <button
                  type="button"
                  onClick={undoApply}
                  className="w-full text-xs font-mono text-text-secondary hover:text-brand-accent transition-colors cursor-pointer"
                >
                  Undo AI application
                </button>
              )}
            </div>
          )}
        </div>
      </PanelShell>
    </aside>
  );
}

/** Convert the editor's current value into the bounded source snapshot for AI. */
function serializeSourceContent(value: unknown, fieldType: string): string | undefined {
  if (value == null) return undefined;
  if (fieldType !== 'richtext') {
    const text =
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
        ? String(value).trim()
        : '';
    return text || undefined;
  }
  if (typeof value === 'string') return value.trim() || undefined;
  try {
    const html = generateHTML(value as Parameters<typeof generateHTML>[0], [
      StarterKit,
      Link.configure({
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
      }),
    ]).trim();
    return html || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Apply one generated value to a field (replace semantics), converting richtext
 * HTML to ProseMirror JSON. Shared by the whole-entry compose apply.
 */
function applyGeneratedField(
  setField: (key: string, value: unknown) => void,
  key: string,
  value: string,
  type: string,
): void {
  if (type === 'richtext') {
    try {
      setField(
        key,
        generateJSON(value, [
          StarterKit,
          Link.configure({
            HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
          }),
        ]),
      );
    } catch {
      setField(key, value);
    }
  } else {
    setField(key, value.trim());
  }
}

/** Plain-text preview of a possibly-HTML generated value, for the compose list. */
function previewText(value: string, type: string): string {
  const text = type === 'richtext' ? value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : value;
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

/** Keep application explicit: structured/select values only support replacement. */
function combineContent(
  existing: string,
  generated: string,
  fieldType: string,
  mode: ApplyMode,
): string {
  if (mode === 'replace' || fieldType === 'select') return generated;
  if (fieldType === 'richtext') {
    return mode === 'prepend' ? `${generated}\n${existing}` : `${existing}\n${generated}`;
  }
  return mode === 'prepend' ? `${generated}\n\n${existing}` : `${existing}\n\n${generated}`;
}

function generationTurnLabel(input: GenerationInput): string {
  const action = input.intent === 'refine' ? input.preset ?? 'refine' : 'generate';
  return `${action}${input.instruction ? `: ${input.instruction}` : ''}`.slice(0, 2_000);
}

/** Compact character diff for plain-text generations; richtext remains rendered safely above. */
function InlineDiff({ before, after }: { before: string; after: string }) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end += 1;
  }
  const removed = before.slice(start, before.length - end);
  const added = after.slice(start, after.length - end);
  if (!removed && !added) return null;
  return (
    <div className="text-xs font-mono leading-relaxed text-text-secondary bg-brand-surface-soft border border-brand-border rounded-lg p-3 whitespace-pre-wrap">
      <span>{before.slice(0, start)}</span>
      {removed && <del className="bg-status-error/15 text-status-error no-underline">{removed}</del>}
      {added && <ins className="bg-green-500/15 text-green-700 dark:text-green-300 no-underline">{added}</ins>}
      <span>{before.slice(before.length - end)}</span>
    </div>
  );
}

/** Shared panel chrome (header). */
function PanelShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl shadow-sm flex flex-col sticky top-4">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-brand-border">
        <Sparkles className="w-4 h-4 text-brand-secondary" />
        <span className="text-sm font-mono font-bold tracking-wider text-text-primary">Wriven Co-Writer</span>
        <span className="ml-auto text-xs font-mono bg-brand-secondary/10 text-brand-secondary px-2 py-0.5 rounded font-bold">AI</span>
      </div>
      {children}
    </div>
  );
}

/**
 * Read-only TipTap renderer for the richtext preview. ProseMirror only emits
 * schema-valid nodes, so scripts/unknown tags in the model output are dropped
 * (safe by construction). Re-rendered when `html` changes.
 */
function RichTextPreview({ html }: { html: string }) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [StarterKit, Link.configure({
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
      })],
    content: html,
  });
  useEffect(() => {
    if (editor) editor.commands.setContent(html, { emitUpdate: false });
  }, [html, editor]);
  if (!editor) return null;
  return (
    <EditorContent
      editor={editor}
      className="text-sm font-sans text-text-primary bg-brand-surface-soft border border-brand-border rounded-lg p-3 max-h-64 overflow-y-auto prose prose-sm max-w-none"
    />
  );
}
