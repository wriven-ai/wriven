'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { aiApi } from '@/lib/api';
import type { AiIntent, AiRefinePreset } from '@/lib/types';
import { FlowControls } from './flow-controls';
import { FlowErrors } from './flow-errors';
import {
  appendTurn,
  applyGeneratedField,
  combineContent,
  generationTurnLabel,
  sameValue,
  serializeSourceContent,
} from './richtext';
import { ResultPreview } from './result-preview';
import {
  type AiTurn,
  type ApplyMode,
  type GenerationInput,
  type Result,
  type TargetField,
} from './types';

/**
 * Single-field flow: pick a Tier-1 target, Generate or Refine (+preset chips),
 * then preview and explicitly apply. Multi-turn history is client-held per
 * field. Applying is always a deliberate mutation — never auto-saved.
 */
export function FieldFlow({
  contentTypeId,
  entryId,
  targets,
  fieldValues,
  setField,
  targetKey,
  setTargetKey,
  onApplied,
  onUnapplied,
  /** The compose flow's pending state — the two share one burst budget. */
  otherBusy,
  onBusyChange,
}: {
  contentTypeId: string;
  entryId?: string;
  targets: TargetField[];
  fieldValues: Record<string, unknown>;
  setField: (key: string, value: unknown) => void;
  targetKey: string;
  setTargetKey: (key: string) => void;
  onApplied: (generationId: string) => void;
  onUnapplied: (generationId: string) => void;
  otherBusy: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [intent, setIntent] = useState<AiIntent>('generate');
  const [preset, setPreset] = useState<AiRefinePreset | undefined>(undefined);
  const [instruction, setInstruction] = useState('');
  const [histories, setHistories] = useState<Record<string, AiTurn[]>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [alternates, setAlternates] = useState<Result[]>([]);
  const [applied, setApplied] = useState(false);
  const [applyMode, setApplyMode] = useState<ApplyMode>('replace');
  const [cancelled, setCancelled] = useState(false);
  const lastAttemptRef = useRef<GenerationInput | null>(null);
  const requestInFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const undoRef = useRef<{ key: string; prev: unknown; written: unknown } | null>(null);
  const resultRef = useRef<Result | null>(null);
  const instructionRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  // Stop waiting when the panel unmounts. The server-side generation may still
  // complete and bill — only the client wait dies.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

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
        [input.targetKey]: appendTurn(
          previous[input.targetKey] ?? [],
          generationTurnLabel(input),
          text,
        ),
      }));
      setApplied(false);
      setCancelled(false);
      lastAttemptRef.current = null;
    },
    onSettled: () => {
      requestInFlightRef.current = false;
      abortRef.current = null;
      onBusyChange(false);
    },
  });

  const busy = mutation.isPending;
  const anyBusy = busy || otherBusy;

  const submit = (input: GenerationInput) => {
    // One generation at a time across BOTH flows — a concurrent field + compose
    // pair just self-triggers the shared per-workspace burst limit.
    if (requestInFlightRef.current || otherBusy) return;
    requestInFlightRef.current = true;
    onBusyChange(true);
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
    const key = result.targetKey;
    const prev = fieldValues[key];
    const existing = serializeSourceContent(prev, result.targetType) ?? '';
    const output = combineContent(existing, result.text, result.targetType, applyMode);
    // applyGeneratedField converts richtext HTML → ProseMirror JSON (falling
    // back to raw text on malformed HTML) and returns the value written.
    const written = applyGeneratedField(setField, key, output, result.targetType);
    undoRef.current = { key, prev, written };
    setApplied(true);
    onApplied(result.generationId);
  };

  const undoAvailable =
    applied && !!undoRef.current && sameValue(fieldValues[undoRef.current.key], undoRef.current.written);

  const undoApply = () => {
    if (!undoRef.current || !result) return;
    setField(undoRef.current.key, undoRef.current.prev);
    setApplied(false);
    onUnapplied(result.generationId);
  };

  const chooseAlternate = (candidate: Result) => {
    setResult((current) => {
      if (current && current.targetKey === candidate.targetKey) {
        setAlternates((previous) =>
          [current, ...previous.filter((item) => item.generationId !== candidate.generationId)].slice(0, 2),
        );
      }
      return candidate;
    });
    setApplied(false);
    // The chosen alternate becomes the latest turn of the conversation, so the
    // next refine acts on it rather than the discarded generation.
    setHistories((previous) => ({
      ...previous,
      [candidate.targetKey]: appendTurn(
        previous[candidate.targetKey] ?? [],
        generationTurnLabel(candidate),
        candidate.text,
      ),
    }));
  };

  const onTargetChange = (key: string) => {
    setTargetKey(key);
    setResult(null);
    setAlternates([]);
    setApplied(false);
    setApplyMode('replace');
    setPreset(undefined);
  };

  const refineDisabled = !canRefine || (!draft && !unAppliedDraft);
  const errCode = (mutation.error as { error?: { code?: string } })?.error?.code;
  const runLabel =
    intent === 'refine'
      ? 'Refine'
      : result?.targetKey === targetKey && !applied
        ? 'Regenerate'
        : 'Generate';

  return (
    <div className="space-y-3">
      <FlowControls
        targets={targets}
        targetKey={targetKey}
        onTargetChange={onTargetChange}
        anyBusy={anyBusy}
        busy={busy}
        intent={intent}
        onIntentChange={chooseIntent}
        preset={preset}
        onPresetChange={choosePreset}
        refineDisabled={refineDisabled}
        instruction={instruction}
        onInstructionChange={setInstruction}
        instructionRef={instructionRef}
        // Instruction is required for every operation — without it the model
        // has no topic anchor and burns a quota unit on generic filler.
        runDisabled={anyBusy || !targetKey || !instruction.trim()}
        runLabel={runLabel}
        onRun={run}
        onStopWaiting={() => {
          abortRef.current?.abort();
          setCancelled(true);
        }}
        historyTurns={history.length / 2}
        onClearHistory={() => {
          setHistories((prev) => ({ ...prev, [targetKey]: [] }));
          if (result?.targetKey === targetKey) {
            setResult(null);
            setAlternates([]);
          }
        }}
      />

      <FlowErrors
        isError={mutation.isError}
        cancelled={cancelled}
        errCode={errCode}
        anyBusy={anyBusy}
        hasAttempt={!!lastAttemptRef.current}
        onTryAgain={run}
        onSafeRetry={() => submit(lastAttemptRef.current as GenerationInput)}
      />

      {/* Preview — only for the field it was generated against; switching
          targets mid-flight must not paint a result under the wrong label. */}
      {result && result.targetKey === targetKey && (
        <ResultPreview
          result={result}
          targets={targets}
          applyMode={applyMode}
          onApplyModeChange={setApplyMode}
          applied={applied}
          onApply={apply}
          onUndo={undoApply}
          undoAvailable={undoAvailable}
          alternates={alternates}
          onChooseAlternate={chooseAlternate}
        />
      )}
    </div>
  );
}
