'use client';

import { useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { useAuthStore } from '../../stores/auth';
import { WrivenLoader } from '../ui/wriven-loader';

/**
 * Client-side route guard. Wrap protected areas (e.g. the dashboard layout).
 * Redirects to /login once the session bootstrap resolves to unauthenticated.
 * src/proxy.ts handles the instant edge redirect when no refresh cookie
 * exists; this guard covers the remaining case (cookie present but invalid)
 * after the silent refresh in <Providers>.
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-brand-bg">
        <WrivenLoader size="lg" />
        <p className="text-text-muted font-mono text-sm uppercase tracking-wider">
          Loading workspace…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
