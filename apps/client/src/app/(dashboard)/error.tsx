'use client';

/**
 * Route-level error boundary for the dashboard area. Keeps the user inside
 * the app chrome instead of the framework's default crash screen; `reset`
 * re-renders the failed segment.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="max-w-md w-full bg-brand-surface border border-brand-border rounded-xl p-8 space-y-5 text-center shadow-xl">
        <span className="text-sm font-semibold tracking-wider text-status-error uppercase font-mono">
          Render error
        </span>
        <h2 className="font-display font-medium text-xl text-text-primary">
          This panel failed to load
        </h2>
        <p className="text-sm text-text-secondary font-light leading-relaxed">
          Something broke while rendering this screen. Retrying re-renders it;
          your data is untouched. If it keeps failing, contact support from the
          workspace Support tab.
        </p>
        <button
          type="button"
          onClick={reset}
          className="w-full inline-flex items-center justify-center gap-2 bg-brand-accent hover:bg-brand-accent-hover text-white border border-brand-border-button font-mono font-bold text-sm uppercase tracking-wider px-6 py-3.5 rounded-lg cursor-pointer"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
