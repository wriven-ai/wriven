'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { authApi } from '../lib/api';
import { useAuthStore } from '../stores/auth';

/** Convenience selectors for the current session. */
export function useAuth() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const workspaces = useAuthStore((s) => s.workspaces);
  const projects = useAuthStore((s) => s.projects);
  const currentWorkspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const currentProjectId = useAuthStore((s) => s.currentProjectId);
  const setWorkspace = useAuthStore((s) => s.setWorkspace);
  const setProject = useAuthStore((s) => s.setProject);
  const updateUser = useAuthStore((s) => s.updateUser);
  const currentWorkspace =
    workspaces.find((w) => w.id === currentWorkspaceId) ?? null;
  // Projects scoped to the active workspace.
  const currentWorkspaceProjects = projects.filter(
    (p) => p.workspaceId === currentWorkspaceId,
  );
  const currentProject =
    projects.find((p) => p.id === currentProjectId) ?? null;
  return {
    status,
    user,
    workspaces,
    projects,
    currentWorkspaceId,
    currentProjectId,
    currentWorkspace,
    currentWorkspaceProjects,
    currentProject,
    setWorkspace,
    setProject,
    updateUser,
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
