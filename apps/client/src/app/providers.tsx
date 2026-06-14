'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { authApi, configureApi } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { TooltipProvider } from '@/components/ui/tooltip';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  const bootstrapped = useRef(false);

  useEffect(() => {
    // Wire the API client to the auth store (token, workspace, auth-failure).
    configureApi({
      getAccessToken: () => useAuthStore.getState().accessToken,
      setAccessToken: (token) => useAuthStore.getState().setAccessToken(token),
      getWorkspaceId: () => useAuthStore.getState().currentWorkspaceId,
      onAuthFailure: () => useAuthStore.getState().setUnauthenticated(),
    });

    if (bootstrapped.current) return;
    bootstrapped.current = true;

    // Silent session restore: access token lives in memory and is gone after a
    // reload, but the refresh cookie persists. /auth/me 401s → the client
    // refreshes via the cookie and retries; success restores the session.
    void (async () => {
      try {
        const session = await authApi.me();
        useAuthStore.getState().setSession(session);
      } catch {
        useAuthStore.getState().setUnauthenticated();
      }
    })();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}
