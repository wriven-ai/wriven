'use client';

import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ApiRequestError, authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
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
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [state, setState] = useState<State>(token ? 'verifying' : 'no-token');
  const [error, setError] = useState<string | null>(null);
  // True when a session exists post-verify (the new flow: verify from the
  // profile page while signed in). Drives the "Back to profile" CTA + a one-shot
  // session refresh so the profile badge flips live on return.
  const [authed, setAuthed] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // verify exactly once (StrictMode double-invoke guard)
    authApi
      .verifyEmail(token)
      .then(async () => {
        setState('success');
        // Refresh the session once so the profile's "Verified" badge is live.
        // If this browser isn't signed in (link opened elsewhere), fall back to
        // the sign-in CTA.
        try {
          const session = await authApi.me();
          setSession(session);
          setAuthed(true);
        } catch {
          setAuthed(false);
        }
      })
      .catch((err) => {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : 'This verification link is invalid or has expired.',
        );
        setState('error');
      });
  }, [token, setSession]);

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
          {authed
            ? 'Your email is confirmed.'
            : 'Your email is confirmed. You can now sign in.'}
        </p>
        {authed ? (
          <button
            onClick={() => router.push('/profile')}
            className="inline-block text-sm uppercase tracking-wider font-bold text-white bg-brand-accent hover:bg-brand-accent-hover border border-brand-border-button px-4 py-3 rounded-lg neo-shadow cursor-pointer"
          >
            Back to profile
          </button>
        ) : (
          <Link
            href="/login"
            className="inline-block text-sm uppercase tracking-wider font-bold text-white bg-brand-accent hover:bg-brand-accent-hover border border-brand-border-button px-4 py-3 rounded-lg neo-shadow"
          >
            Go to sign in
          </Link>
        )}
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
