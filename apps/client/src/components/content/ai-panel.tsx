'use client';

import { useEffect, useMemo, useState } from 'react';
import { ComposeSection } from './ai-panel/compose-section';
import { FieldFlow } from './ai-panel/field-flow';
import { PanelShell } from './ai-panel/panel-shell';
import { TIER1, type TargetField } from './ai-panel/types';
import { serializeSourceContent } from './ai-panel/richtext';

/**
 * AI Co-Writer panel. Two flows over one Tier-1 target set: whole-entry
 * `compose` (drafts every eligible field in one call) and per-field
 * Generate/Refine with preset chips (see FieldFlow). Eligibility is derived,
 * not configured: single-value text/richtext/select that isn't sensitive.
 * Composition root only — the flows live in `./ai-panel/`.
 */
export function AiPanel({
  contentTypeId,
  entryId,
  fields,
  fieldValues,
  setField,
  onApplied,
  onUnapplied,
  requestedTarget,
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
  /** Editor signal (field-row sparkle): target this key and scroll here. */
  requestedTarget?: { key: string; nonce: number };
}) {
  const targets = useMemo<TargetField[]>(
    () => fields.filter((f) => TIER1.includes(f.type) && !f.multiple && !f.aiPrivate),
    [fields],
  );
  const defaultTarget = targets.find((t) => t.type === 'richtext')?.key ?? targets[0]?.key ?? '';
  const [targetKey, setTargetKey] = useState(defaultTarget);

  // Reset when the available fields change (content type switch).
  useEffect(() => {
    setTargetKey((cur) => (targets.some((t) => t.key === cur) ? cur : defaultTarget));
  }, [targets, defaultTarget]);

  // Editor-requested targeting (per-field sparkle). Remount-safe via nonce.
  useEffect(() => {
    if (!requestedTarget) return;
    if (targets.some((t) => t.key === requestedTarget.key)) {
      setTargetKey(requestedTarget.key);
    }
    document
      .getElementById('wriven-ai-panel')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [requestedTarget, targets]);

  // The two flows serialize against each other (one burst budget) — each
  // reports its pending state up through this pair.
  const [fieldBusy, setFieldBusy] = useState(false);
  const [composeBusy, setComposeBusy] = useState(false);

  // On a new/empty entry, drafting the whole entry is the hero action; once
  // the author has content, it demotes to a collapsed secondary affordance.
  const entryHasContent = targets.some((t) => serializeSourceContent(fieldValues[t.key], t.type));

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

  return (
    <aside className="lg:col-span-4">
      <PanelShell>
        <div className="flex flex-col gap-3 p-5">
          <ComposeSection
            contentTypeId={contentTypeId}
            entryId={entryId}
            targets={targets}
            fieldValues={fieldValues}
            setField={setField}
            onApplied={(id) => onApplied?.(id)}
            onUnapplied={(id) => onUnapplied?.(id)}
            hero={!entryHasContent}
            otherBusy={fieldBusy}
            onBusyChange={setComposeBusy}
          />
          <FieldFlow
            contentTypeId={contentTypeId}
            entryId={entryId}
            targets={targets}
            fieldValues={fieldValues}
            setField={setField}
            targetKey={targetKey}
            setTargetKey={setTargetKey}
            onApplied={(id) => onApplied?.(id)}
            onUnapplied={(id) => onUnapplied?.(id)}
            otherBusy={composeBusy}
            onBusyChange={setFieldBusy}
          />
        </div>
      </PanelShell>
    </aside>
  );
}
