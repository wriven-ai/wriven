'use client';

import { useEffect, useState } from 'react';

/**
 * Perceived-progress affordance for the AI panel. A generation is one blocking
 * HTTP request — there is no token-level progress to surface without streaming
 * — so this stages honest pipeline labels on a timer (they mirror what
 * ai-service actually does per operation) and eases a bar that asymptotes at
 * 92%, never reading 100% until the real result swaps in.
 */

const PHASES = {
  // Single-field generate/refine — small output cap, fast op.
  field: [
    [0, 'Sending your brief'],
    [2, 'Writing'],
    [12, 'Wrapping up'],
  ],
  // Whole-entry compose — drafts every eligible field in one call.
  compose: [
    [0, 'Reading your brief'],
    [3, 'Planning field structure'],
    [10, 'Drafting fields'],
    [25, 'Polishing output'],
  ],
} as const;

const EXPECTED_SECONDS = { field: 12, compose: 25 } as const;

/** `null` while idle; otherwise the current phase label and eased bar percent. */
export function useGenerationProgress(active: boolean, kind: keyof typeof PHASES) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 500);
    return () => clearInterval(timer);
  }, [active]);

  if (!active) return null;

  const phases = PHASES[kind];
  let label: string = phases[0][1];
  for (const [start, text] of phases) {
    if (elapsed >= start) label = text;
  }

  // Fast early movement, a crawl near the end — the classic anti-"is it
  // stuck?" easing. Clamped so only the caller's success state reads 100%.
  const progress = 92 * (1 - Math.exp((-2.5 * elapsed) / EXPECTED_SECONDS[kind]));

  return { label, progress: Math.min(92, progress) };
}

export function GenerationProgressBar({ progress }: { progress: number }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1 w-full bg-brand-surface-soft rounded-full overflow-hidden"
    >
      <div
        style={{ width: `${progress}%` }}
        className="h-full bg-brand-accent rounded-full transition-all duration-500 ease-out"
      />
    </div>
  );
}
