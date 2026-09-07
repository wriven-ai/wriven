'use client';

import Link from 'next/link';

/**
 * Route-level error boundary for public pages. A render error here would
 * otherwise surface the framework's default crash screen.
 */
export default function PublicError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bg text-text-primary editorial-grid relative paper-grain">
      <div className="mx-auto max-w-xl px-4 sm:px-6 text-center space-y-6 relative z-10">
        <span className="text-sm font-semibold tracking-wider text-status-error uppercase">
          Something went wrong
        </span>
        <h1 className="font-display font-medium leading-tight tracking-tight text-text-primary text-3xl sm:text-4xl">
          This page failed to render
        </h1>
        <p className="text-text-secondary text-sm leading-relaxed font-light">
          An unexpected error occurred while loading this page. Trying again
          usually resolves it — if it persists, reach us at{' '}
          <a
            href="mailto:hello@wriven.tech"
            className="text-brand-accent hover:underline"
          >
            hello@wriven.tech
          </a>
          .
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-3">
          <button
            type="button"
            onClick={reset}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-brand-accent hover:bg-brand-accent-hover text-white border border-brand-border-button font-mono font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-lg neo-shadow-lg cursor-pointer"
          >
            Try again
          </button>
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-brand-surface-soft hover:bg-brand-border text-text-primary border border-brand-border-button font-mono font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-lg"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
