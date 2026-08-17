'use client';

import { ERR_MESSAGES } from './types';

/**
 * The field flow's failure surfaces, each with the honest retry affordance:
 * - terminal failure → fresh request (same-key retry would replay the stored
 *   failure forever);
 * - 409 in-progress → same-key retry is exactly right (pending row);
 * - stop-waiting → same-key retry replays the stored result, no second call.
 */
export function FlowErrors({
  isError,
  cancelled,
  errCode,
  anyBusy,
  hasAttempt,
  onTryAgain,
  onSafeRetry,
}: {
  isError: boolean;
  cancelled: boolean;
  errCode: string | undefined;
  anyBusy: boolean;
  hasAttempt: boolean;
  onTryAgain: () => void;
  onSafeRetry: () => void;
}) {
  if (!isError) return null;

  if (cancelled) {
    return (
      <div className="text-xs font-mono text-text-muted bg-brand-surface-soft border border-brand-border rounded-lg px-3 py-2 space-y-1">
        <p>Stopped waiting. The request may still finish on its own.</p>
        {hasAttempt && (
          <button
            type="button"
            onClick={onSafeRetry}
            disabled={anyBusy}
            className="text-brand-secondary hover:text-brand-accent transition-colors cursor-pointer text-left disabled:opacity-50"
          >
            Retry the same request safely
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="text-sm font-mono text-status-error bg-status-error/10 border border-status-error/20 rounded-lg px-3 py-2">
        {ERR_MESSAGES[errCode ?? ''] ?? 'Something went wrong. Try again.'}
      </div>
      <button
        type="button"
        onClick={onTryAgain}
        disabled={anyBusy}
        className="text-xs font-mono text-brand-secondary hover:text-brand-accent transition-colors cursor-pointer text-left disabled:opacity-50"
      >
        Try again with a new request
      </button>
      {errCode === 'AI_GENERATION_IN_PROGRESS' && hasAttempt && (
        <button
          type="button"
          onClick={onSafeRetry}
          disabled={anyBusy}
          className="text-xs font-mono text-brand-secondary hover:text-brand-accent transition-colors cursor-pointer text-left disabled:opacity-50"
        >
          Retry the same request safely
        </button>
      )}
    </>
  );
}
