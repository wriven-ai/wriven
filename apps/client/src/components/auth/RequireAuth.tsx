'use client';

import { useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { useAuthStore } from '../../stores/auth';

/**
 * Client-side route guard. Wrap protected areas (e.g. the dashboard layout).
 * Redirects to /login once the session bootstrap resolves to unauthenticated.
 * The HttpOnly refresh token can't be read in middleware, so guarding happens
 * here after the silent refresh in <Providers>.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg text-text-muted font-mono text-xs uppercase tracking-wider">
        Loading workspace…
      </div>
    );
  }

  return <>{children}</>;
}
