'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { workspaceApi } from '@/lib/api';

/**
 * Fallback route for `/billing`.
 * Redirects to `/w/[firstWorkspaceSlug]/billing` with any query parameters intact
 * (e.g. `?checkout=success`), avoiding a 404 if Stripe or a link hits `/billing`.
 */
function BillingRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function redirect() {
      try {
        const list = await workspaceApi.list();
        if (list.length > 0) {
          const params = searchParams.toString();
          const query = params ? `?${params}` : '';
          router.replace(`/w/${list[0].slug}/billing${query}`);
          return;
        }
      } catch {
        // user not authenticated or API error -> redirect to dashboard
      }
      router.replace('/dashboard');
    }
    void redirect();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bg text-text-muted font-mono text-sm uppercase tracking-wider">
      Redirecting to billing…
    </div>
  );
}

export default function BillingRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-brand-bg text-text-muted font-mono text-sm uppercase tracking-wider">
          Loading…
        </div>
      }
    >
      <BillingRedirectInner />
    </Suspense>
  );
}
