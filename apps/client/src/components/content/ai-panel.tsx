'use client';

import { useMutation } from '@tanstack/react-query';
import { generateHTML, generateJSON } from '@tiptap/html';
import Link from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { RefreshCw, Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { aiApi } from '@/lib/api';

/** One turn of multi-turn refinement (client-held). Mirrors contracts AiTurn. */
type AiTurn = { role: 'user' | 'assistant'; content: string };

const OPERATIONS = [
  { key: 'generate', label: 'Generate' },
  { key: 'expand', label: 'Expand' },
  { key: 'shorten', label: 'Shorten' },
  { key: 'rewrite', label: 'Rewrite' },
  { key: 'tone', label: 'Change tone' },
  { key: 'summarize', label: 'Summarize' },
  { key: 'continue', label: 'Continue' },
] as const;

type Operation = (typeof OPERATIONS)[number]['key'];

type Result = {
  generationId: string;
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  remaining: number | null;
  targetKey: string;
  targetType: string;
  operation: Operation;
  instruction: string;
  sourceContent?: string;
};

type GenerationInput = {
  requestId: string;
  targetKey: string;
  targetType: string;
  sourceContent?: string;
  operation: Operation;
  instruction: string;
  tone?: string;
  history: AiTurn[];
};

type ApplyMode = 'replace' | 'append' | 'prepend';

const TIER1 = ['text', 'richtext', 'select'];

/**
 * AI Co-Writer panel. Generates/refines a Tier-1 field (text | richtext |
 * select), multi-turn (client-held history), then applies the result to the
 * entry form. Richtext: AI emits semantic HTML → parsed to ProseMirror JSON via
 * `generateJSON` on apply (structure preserved: headings, lists, links). The
 * preview is a read-only TipTap instance so only schema-valid HTML renders
 * (scripts/unknown tags dropped — safe). See ai content generation feature.
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
    aiAssist?: boolean;
    aiOperations?: Operation[];
    aiPrivate?: boolean;
  }[];
  fieldValues: Record<string, unknown>;
  setField: (key: string, value: unknown) => void;
  /** Lets the editor link this explicit apply to the next saved revision. */
  onApplied?: (generationId: string) => void;
  onUnapplied?: (generationId: string) => void;
}) {
  // Tier-1 fields with AI not explicitly disabled.
  const targets = useMemo(
    () =>
      fields.filter(
        (f) => TIER1.includes(f.type) && !f.multiple && !f.aiPrivate && f.aiAssist !== false,
      ),
    [fields],
  );
  const defaultTarget = targets.find((t) => t.type === 'richtext')?.key ?? targets[0]?.key ?? '';

  const [targetKey, setTargetKey] = useState(defaultTarget);
  const [operation, setOperation] = useState<Operation>('generate');
  const [instruction, setInstruction] = useState('');
  const [tone, setTone] = useState('');
  const [histories, setHistories] = useState<Record<string, AiTurn[]>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [alternates, setAlternates] = useState<Result[]>([]);
  const [applied, setApplied] = useState(false);
  const [applyMode, setApplyMode] = useState<ApplyMode>('replace');
  const [cancelled, setCancelled] = useState(false);
  const lastAttemptRef = useRef<GenerationInput | null>(null);
  const requestInFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const undoRef = useRef<{ key: string; value: unknown } | null>(null);
  const resultRef = useRef<Result | null>(null);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  // Reset when the available fields change (content type switch).
  useEffect(() => {
    setTargetKey((cur) => (targets.some((t) => t.key === cur) ? cur : defaultTarget));
  }, [targets, defaultTarget]);

  const target = targets.find((t) => t.key === targetKey);
  const history = histories[targetKey] ?? [];
  const availableOperations = useMemo(
    () =>
      target?.aiOperations?.length
        ? OPERATIONS.filter((candidate) => target.aiOperations?.includes(candidate.key))
        : target?.type === 'select'
          ? OPERATIONS.filter((candidate) => candidate.key === 'generate')
        : OPERATIONS,
    [target],
  );

  useEffect(() => {
    setOperation((current) =>
      availableOperations.some((candidate) => candidate.key === current)
        ? current
        : availableOperations[0]?.key ?? 'generate',
    );
  }, [availableOperations]);

  const mutation = useMutation({
    mutationFn: (input: GenerationInput) => {
      const controller = new AbortController();
      abortRef.current = controller;
      return aiApi.generate({
        requestId: input.requestId,
        contentTypeId,
        entryId,
        fieldKey: input.targetKey,
        operation: input.operation,
        instruction: input.instruction || undefined,
        sourceContent: input.sourceContent,
        tone: input.tone,
        history: input.history.length ? input.history : undefined,
      }, controller.signal);
    },
    onSuccess: (data, input) => {
      const next = { ...data, ...input };
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
          { role: 'user', content: generationTurnLabel(input) },
          { role: 'assistant', content: data.text },
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

  const generate = () => {
    if (!target) return;
    const unAppliedDraft = result?.targetKey === target.key && !applied ? result.text : undefined;
    const input: GenerationInput = {
      requestId: crypto.randomUUID(),
      targetKey: target.key,
      targetType: target.type,
      sourceContent: unAppliedDraft ?? serializeSourceContent(fieldValues[target.key], target.type),
      operation,
      instruction,
      tone: tone.trim() || undefined,
      history,
    };
    submit(input);
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
          <p className="text-sm font-mono text-text-muted leading-relaxed">
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
    AI_GENERATION_IN_PROGRESS: 'This generation is still in progress. Retry safely in a moment.',
    IDEMPOTENCY_KEY_REUSED: 'That generation request cannot be reused. Start a new generation.',
    VALIDATION_ERROR: 'That field does not support AI generation.',
  };

  return (
    <aside className="lg:col-span-4">
      <PanelShell>
        <div className="flex flex-col gap-3 p-5">
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

          {/* Operation */}
          <label className="space-y-1.5">
            <span className="block text-xs font-mono uppercase tracking-wider text-text-muted">Operation</span>
            <select
              value={operation}
              onChange={(e) => setOperation(e.target.value as Operation)}
              className="w-full text-sm font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-brand-accent"
            >
              {availableOperations.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          {operation === 'tone' && (
            <label className="space-y-1.5">
              <span className="block text-xs font-mono uppercase tracking-wider text-text-muted">Target tone</span>
              <input
                type="text"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="e.g. confident and concise"
                className="w-full text-sm font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-brand-accent"
              />
            </label>
          )}

          {/* Instruction */}
          <label className="space-y-1.5">
            <span className="block text-xs font-mono uppercase tracking-wider text-text-muted">
              Instruction <span className="normal-case text-text-muted/70">— optional</span>
            </span>
            <textarea
              rows={4}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g. Add 3 bullet points about pricing"
              className="w-full text-sm font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-3 text-text-primary focus:outline-none focus:border-brand-accent leading-relaxed resize-y"
            />
          </label>

          <button
            type="button"
            onClick={generate}
            disabled={
              mutation.isPending ||
              !targetKey ||
              (operation === 'tone' && !tone.trim())
            }
            className="w-full inline-flex items-center justify-center gap-2 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-sm py-2.5 px-4 rounded-lg transition-all cursor-pointer neo-shadow"
          >
            {mutation.isPending ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="w-3.5 h-3.5" /> {result?.targetKey === targetKey && !applied ? 'Refine draft' : 'Generate'}</>
            )}
          </button>

          {mutation.isPending && (
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
              disabled={mutation.isPending}
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
  const detail = input.operation === 'tone' ? input.tone : input.instruction;
  return `${input.operation}${detail ? `: ${detail}` : ''}`.slice(0, 2_000);
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
