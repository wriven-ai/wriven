'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { authApi } from '../lib/api';
import { useAuthStore } from '../stores/auth';

/** Convenience selectors for the current session. */
export function useAuth() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const orgs = useAuthStore((s) => s.orgs);
  const workspaces = useAuthStore((s) => s.workspaces);
  const currentWorkspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const currentWorkspace =
    workspaces.find((w) => w.id === currentWorkspaceId) ?? null;
  return {
    status,
    user,
    orgs,
    workspaces,
    currentWorkspaceId,
    currentWorkspace,
    isAuthenticated: status === 'authenticated',
  };
}

/** Log out: revoke server session, clear local state, go to /login. */
export function useLogout() {
  const router = useRouter();
  return useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the server call fails, clear locally.
    }
    useAuthStore.getState().clear();
    router.push('/login');
  }, [router]);
}
