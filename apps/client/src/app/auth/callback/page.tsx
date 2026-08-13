'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { authApi } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth';

/**
 * Google OAuth landing page. The gateway has already set the session cookies
 * (access + refresh + csrf) before redirecting here, so we just fetch the
 * session over those cookies and enter the dashboard.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    void (async () => {
      try {
        const session = await authApi.me();
        useAuthStore.getState().setSession(session);
        router.replace('/dashboard');
      } catch {
        useAuthStore.getState().setUnauthenticated();
        router.replace('/login');
      }
    })();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bg text-text-muted font-mono text-sm uppercase tracking-wider">
      Signing you in…
    </div>
  );
}
