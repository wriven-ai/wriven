'use client';

import { useMutation } from '@tanstack/react-query';
import { generateJSON } from '@tiptap/html';
import Link from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { RefreshCw, Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  remaining: number | null;
};

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
  setField,
}: {
  contentTypeId: string;
  entryId?: string;
  fields: { key: string; label: string; type: string; options?: string[]; aiAssist?: boolean }[];
  setField: (key: string, value: unknown) => void;
}) {
  // Tier-1 fields with AI not explicitly disabled.
  const targets = useMemo(
    () => fields.filter((f) => TIER1.includes(f.type) && f.aiAssist !== false),
    [fields],
  );
  const defaultTarget = targets.find((t) => t.type === 'richtext')?.key ?? targets[0]?.key ?? '';

  const [targetKey, setTargetKey] = useState(defaultTarget);
  const [operation, setOperation] = useState<Operation>('generate');
  const [instruction, setInstruction] = useState('');
  const [history, setHistory] = useState<AiTurn[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [applied, setApplied] = useState(false);

  // Reset when the available fields change (content type switch).
  useEffect(() => {
    setTargetKey((cur) => (targets.some((t) => t.key === cur) ? cur : defaultTarget));
  }, [targets, defaultTarget]);

  const target = targets.find((t) => t.key === targetKey);

  const mutation = useMutation({
    mutationFn: () =>
      aiApi.generate({
        contentTypeId,
        entryId,
        fieldKey: targetKey,
        operation,
        instruction: instruction || undefined,
        history: history.length ? history : undefined,
      }),
    onSuccess: (data) => {
      setResult(data);
      setApplied(false);
    },
  });

  const generate = () => {
    if (!targetKey) return;
    mutation.mutate();
  };

  const apply = () => {
    if (!result || !target) return;
    if (target.type === 'richtext') {
      // AI emitted semantic HTML → ProseMirror JSON (headings/lists/links preserved).
      try {
        const doc = generateJSON(result.text, [
          StarterKit,
          Link.configure({
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
      }),
        ]);
        setField(target.key, doc);
      } catch {
        // Malformed HTML — fall back to inserting the raw text as paragraphs.
        setField(target.key, result.text);
      }
    } else {
      setField(target.key, result.text.trim());
    }
    // Append this turn to history so the next generate can refine it.
    setHistory((prev) =>
      [
        ...prev,
        { role: 'user' as const, content: `${operation}: ${instruction || ''}` },
        { role: 'assistant' as const, content: result.text },
      ].slice(-8),
    );
    setApplied(true);
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
    PLAN_LIMIT_REACHED: 'Monthly AI generation limit reached for your plan.',
    RATE_LIMITED: 'Too many AI requests — please slow down.',
    AI_GENERATION_FAILED: 'Generation failed. Try again or rephrase.',
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
              onChange={(e) => setTargetKey(e.target.value)}
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
              {OPERATIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

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
            disabled={mutation.isPending || !targetKey}
            className="w-full inline-flex items-center justify-center gap-2 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-sm py-2.5 px-4 rounded-lg transition-all cursor-pointer neo-shadow"
          >
            {mutation.isPending ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="w-3.5 h-3.5" /> Generate</>
            )}
          </button>

          {history.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setHistory([]);
                setResult(null);
              }}
              className="text-xs font-mono text-text-muted hover:text-brand-accent transition-colors cursor-pointer text-left"
            >
              Clear conversation ({history.length / 2} turns)
            </button>
          )}

          {/* Error */}
          {mutation.isError && (
            <div className="text-sm font-mono text-status-error bg-status-error/10 border border-status-error/20 rounded-lg px-3 py-2">
              {errMsg[errCode ?? ''] ?? 'Something went wrong. Try again.'}
            </div>
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
              {target?.type === 'richtext' ? (
                <RichTextPreview html={result.text} />
              ) : (
                <div className="text-sm font-sans text-text-primary bg-brand-surface-soft border border-brand-border rounded-lg p-3 max-h-64 overflow-y-auto whitespace-pre-wrap">
                  {result.text}
                </div>
              )}
              <button
                type="button"
                onClick={apply}
                disabled={applied}
                className="w-full inline-flex items-center justify-center gap-2 bg-brand-secondary/90 hover:bg-brand-secondary text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-sm py-2 px-4 rounded-lg transition-all cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5" /> {applied ? 'Applied' : `Apply to “${target?.label}”`}
              </button>
            </div>
          )}
        </div>
      </PanelShell>
    </aside>
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
