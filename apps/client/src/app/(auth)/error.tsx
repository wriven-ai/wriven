'use client';

/**
 * Route-level error boundary for auth screens (login, register, password
 * reset, verification).
 */
export default function AuthError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-md w-full mx-auto bg-brand-surface border border-brand-border rounded-xl p-8 space-y-5 text-center shadow-xl">
      <span className="text-sm font-semibold tracking-wider text-status-error uppercase font-mono">
        Render error
      </span>
      <h2 className="font-display font-medium text-xl text-text-primary">
        This screen failed to load
      </h2>
      <p className="text-sm text-text-secondary font-light leading-relaxed">
        Something broke while rendering this page. Retrying usually fixes it.
      </p>
      <button
        type="button"
        onClick={reset}
        className="w-full inline-flex items-center justify-center gap-2 bg-brand-accent hover:bg-brand-accent-hover text-white border border-brand-border-button font-mono font-bold text-sm uppercase tracking-wider px-6 py-3.5 rounded-lg cursor-pointer"
      >
        Try again
      </button>
    </div>
  );
}
