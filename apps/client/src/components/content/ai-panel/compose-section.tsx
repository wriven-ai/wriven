'use client';

import { useMutation } from '@tanstack/react-query';
import { FileText, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { aiApi } from '@/lib/api';
import { ComposeResult } from './compose-result';
import { FlowErrors } from './flow-errors';
import { GenerationProgressBar, useGenerationProgress } from './generation-progress';
import { applyGeneratedField, sameValue } from './richtext';
import { type ComposeField, type TargetField } from './types';

/**
 * Whole-entry compose: one call drafts every eligible field of the content
 * type. The author previews per field (expandable to the full value), picks a
 * subset, applies explicitly, and can undo until any applied field is manually
 * edited. One compose = one quota unit regardless of field count.
 */
export function ComposeSection({
  contentTypeId,
  entryId,
  targets,
  fieldValues,
  setField,
  onApplied,
  onUnapplied,
  /** True on a new/empty entry: the draft affordance becomes the panel hero. */
  hero,
  /** The field flow's pending state — the two share one burst budget. */
  otherBusy,
  onBusyChange,
}: {
  contentTypeId: string;
  entryId?: string;
  targets: TargetField[];
  fieldValues: Record<string, unknown>;
  setField: (key: string, value: unknown) => void;
  onApplied: (generationId: string) => void;
  onUnapplied: (generationId: string) => void;
  hero: boolean;
  otherBusy: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [brief, setBrief] = useState('');
  const [result, setResult] = useState<{
    generationId: string;
    fields: ComposeField[];
    remaining: number | null;
    truncated?: boolean;
  } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cancelled, setCancelled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastAttemptRef = useRef<{ requestId: string; instruction: string } | null>(null);
  const undoRef = useRef<{
    prev: Record<string, unknown>;
    written: Record<string, unknown>;
    keys: string[];
  } | null>(null);

  // Stop waiting when the panel unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const mutation = useMutation({
    mutationFn: (input: { requestId: string; instruction: string }) => {
      const controller = new AbortController();
      abortRef.current = controller;
      return aiApi.generate(
        {
          requestId: input.requestId,
          contentTypeId,
          entryId,
          targetKind: 'entry',
          intent: 'generate',
          instruction: input.instruction || undefined,
        },
        controller.signal,
      );
    },
    onSuccess: (data) => {
      // A non-record body is a contract violation from ai-service — surface it
      // instead of silently doing nothing (the user would see no reaction).
      if (data.output.kind !== 'record') {
        setResult({
          generationId: data.generationId,
          fields: [],
          remaining: data.remaining,
        });
        return;
      }
      const fields: ComposeField[] = Object.entries(data.output.fields).map(([key, value]) => {
        const def = targets.find((t) => t.key === key);
        return { key, label: def?.label ?? key, type: def?.type ?? 'text', value };
      });
      setResult({
        generationId: data.generationId,
        fields,
        remaining: data.remaining,
        truncated: data.truncated,
      });
      // Default to applying every drafted field; the author unchecks any to skip.
      setSelected(new Set(fields.map((f) => f.key)));
      setExpanded(new Set());
      setApplied(false);
      undoRef.current = null;
    },
    onSettled: () => {
      abortRef.current = null;
      onBusyChange(false);
    },
  });

  const busy = mutation.isPending;
  const anyBusy = busy || otherBusy;
  const progress = useGenerationProgress(busy, 'compose');

  const runCompose = () => {
    // See the field flow: both share one burst budget — serialize them.
    if (busy || otherBusy) return;
    setApplied(false);
    setCancelled(false);
    onBusyChange(true);
    const input = { requestId: crypto.randomUUID(), instruction: brief };
    lastAttemptRef.current = input;
    mutation.mutate(input);
  };

  const applyCompose = () => {
    if (!result) return;
    const prev: Record<string, unknown> = {};
    const written: Record<string, unknown> = {};
    const keys: string[] = [];
    for (const f of result.fields) {
      if (!selected.has(f.key)) continue;
      prev[f.key] = fieldValues[f.key];
      written[f.key] = applyGeneratedField(setField, f.key, f.value, f.type);
      keys.push(f.key);
    }
    undoRef.current = { prev, written, keys };
    setApplied(true);
    onApplied(result.generationId);
  };

  const snapshot = undoRef.current;
  const undoAvailable =
    applied &&
    !!snapshot &&
    snapshot.keys.length > 0 &&
    // Undo stays available only while every applied field still holds exactly
    // what the compose wrote — any manual edit voids it.
    snapshot.keys.every((key) => sameValue(fieldValues[key], snapshot.written[key]));

  const undoApply = () => {
    if (!undoRef.current || !result) return;
    for (const key of undoRef.current.keys) {
      setField(key, undoRef.current.prev[key]);
    }
    setApplied(false);
    onUnapplied(result.generationId);
  };

  const toggle = (set: Set<string>, key: string): Set<string> => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const errCode = (mutation.error as { error?: { code?: string } })?.error?.code;

  const controls = (
    <>
      <textarea
        rows={hero ? 3 : 2}
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        placeholder="Brief — e.g. a launch post about our new pricing"
        className="w-full text-sm font-mono bg-brand-surface border border-brand-border rounded-lg p-2.5 text-text-primary focus:outline-none focus:border-brand-accent resize-y"
      />
      <button
        type="button"
        onClick={runCompose}
        disabled={anyBusy}
        className={`w-full inline-flex items-center justify-center gap-2 bg-brand-secondary/90 hover:bg-brand-secondary text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-sm rounded-lg transition-all cursor-pointer ${
          hero ? 'py-2.5 px-4 neo-shadow' : 'py-2 px-4'
        }`}
      >
        {busy ? (
          <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> {progress?.label ?? 'Drafting…'}</>
        ) : (
          <><Sparkles className="w-3.5 h-3.5" /> Draft entry</>
        )}
      </button>
      {busy && progress && <GenerationProgressBar progress={progress.progress} />}
      {busy && (
        <button
          type="button"
          onClick={() => {
            abortRef.current?.abort();
            setCancelled(true);
          }}
          className="text-xs font-mono text-text-muted hover:text-text-secondary transition-colors cursor-pointer text-left"
        >
          Stop waiting — the provider may still finish, and this request can be safely retried.
        </button>
      )}
      <FlowErrors
        isError={mutation.isError}
        cancelled={cancelled}
        errCode={errCode}
        anyBusy={anyBusy}
        hasAttempt={!!lastAttemptRef.current}
        onTryAgain={runCompose}
        onSafeRetry={() => {
          const attempt = lastAttemptRef.current;
          if (attempt) mutation.mutate(attempt);
        }}
      />
      {result && (
        <ComposeResult
          fields={result.fields}
          truncated={result.truncated}
          selected={selected}
          onToggleSelected={(key, checked) =>
            setSelected((prev) => {
              const next = new Set(prev);
              if (checked) next.add(key);
              else next.delete(key);
              return next;
            })
          }
          expanded={expanded}
          onToggleExpanded={(key) => setExpanded((prev) => toggle(prev, key))}
          applied={applied}
          onApply={applyCompose}
          onUndo={undoApply}
          undoAvailable={undoAvailable}
          remaining={result.remaining}
          onToggleAllExpanded={(expand) =>
            setExpanded(expand ? new Set(result.fields.map((f) => f.key)) : new Set())
          }
        />
      )}
    </>
  );

  // Hero: a new/empty entry — drafting is the primary action, so the section
  // is open and prominent. Otherwise it stays a collapsed secondary affordance.
  if (hero) {
    return (
      <section className="border border-brand-secondary/40 rounded-lg bg-brand-secondary/5 p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-brand-secondary">
          <FileText className="w-3.5 h-3.5" />
          Draft the whole entry
        </div>
        {controls}
      </section>
    );
  }

  return (
    <details className="border border-brand-border rounded-lg bg-brand-surface-soft/40">
      <summary className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-text-secondary cursor-pointer select-none hover:text-text-primary">
        <FileText className="w-3.5 h-3.5 text-brand-secondary" />
        Draft whole entry
      </summary>
      <div className="p-3 pt-1 space-y-2">{controls}</div>
    </details>
  );
}
