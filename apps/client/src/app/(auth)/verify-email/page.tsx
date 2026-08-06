'use client';

import { AlertCircle, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ApiRequestError, authApi } from '@/lib/api';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="absolute top-6 left-6">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm font-mono font-bold text-text-secondary uppercase tracking-wider hover:text-brand-accent transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-brand-accent" />
          Back to sign in
        </Link>
      </div>
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-4 relative z-10">
        <span className="text-sm font-semibold tracking-wider text-brand-secondary uppercase bg-brand-surface border border-brand-border px-3 py-1 rounded inline-block">
          Email Verification
        </span>
        <h2 className="font-display font-medium text-text-primary text-2xl tracking-tight">
          Verify your email
        </h2>
      </div>
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-brand-surface py-8 px-6 border border-brand-border-button rounded-xl shadow-2xl neo-shadow-lg sm:px-10 space-y-6">
          {children}
        </div>
      </div>
    </>
  );
}

type State = 'verifying' | 'success' | 'error' | 'no-token';

function VerifyInner() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<State>(token ? 'verifying' : 'no-token');
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // verify exactly once (StrictMode double-invoke guard)
    authApi
      .verifyEmail(token)
      .then(() => setState('success'))
      .catch((err) => {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : 'This verification link is invalid or has expired.',
        );
        setState('error');
      });
  }, [token]);

  if (state === 'no-token') {
    return (
      <div className="text-center space-y-3">
        <AlertCircle className="w-8 h-8 mx-auto text-status-error" />
        <p className="text-sm font-mono text-status-error">
          This verification link is invalid or incomplete.
        </p>
        <Link href="/login" className="inline-block text-sm text-brand-accent font-semibold hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  if (state === 'verifying') {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-text-muted">
        <Loader2 className="w-7 h-7 animate-spin text-brand-accent" />
        <p className="text-sm font-mono">Verifying your email…</p>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="p-5 rounded-lg bg-emerald-500/5 border border-status-success text-sm font-mono text-text-primary text-center space-y-3">
        <CheckCircle className="w-8 h-8 mx-auto text-status-success" />
        <strong className="block font-bold">Email verified</strong>
        <p className="text-text-secondary font-light leading-relaxed">
          Your email is confirmed. You can now sign in.
        </p>
        <Link
          href="/login"
          className="inline-block text-sm uppercase tracking-wider font-bold text-white bg-brand-accent hover:bg-brand-accent-hover border border-brand-border-button px-4 py-3 rounded-lg neo-shadow"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center space-y-3">
      <AlertCircle className="w-8 h-8 mx-auto text-status-error" />
      <p className="text-sm font-mono text-status-error">{error}</p>
      <Link href="/login" className="inline-block text-sm text-brand-accent font-semibold hover:underline">
        Go to sign in
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Shell>
      <Suspense
        fallback={
          <p className="text-center text-sm font-mono text-text-muted">Loading…</p>
        }
      >
        <VerifyInner />
      </Suspense>
    </Shell>
  );
}
