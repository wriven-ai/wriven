'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { authApi } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth';

/**
 * Google OAuth landing page. The gateway redirects here with the access token
 * in the URL fragment (#access_token=...). We read it, store it, fetch the
 * session, then enter the dashboard. The refresh cookie is already set.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    void (async () => {
      const fragment = window.location.hash.replace(/^#/, '');
      const token = new URLSearchParams(fragment).get('access_token');

      if (!token) {
        router.replace('/login');
        return;
      }

      useAuthStore.getState().setAccessToken(token);
      // Clear the token from the URL.
      window.history.replaceState(null, '', window.location.pathname);

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
    <div className="min-h-screen flex items-center justify-center bg-brand-bg text-text-muted font-mono text-xs uppercase tracking-wider">
      Signing you in…
    </div>
  );
}
