'use client';

import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth';
import type { WorkspaceView } from '@/lib/types';

/** The user's default workspace: the one flagged `isDefault`, else the first. */
function pickDefault(workspaces: WorkspaceView[]): WorkspaceView | null {
  return workspaces.find((w) => w.isDefault) ?? workspaces[0] ?? null;
}

/**
 * Resolves the workspace currently in scope: the one named by the URL slug, or
 * the default workspace when there's no slug (i.e. at /dashboard). Mirrors its
 * id into the store so the API client sends the right X-Workspace-Id even on
 * the slug-less /dashboard route.
 */
export function useCurrentWorkspace(): WorkspaceView | null {
  const { wsSlug } = useParams<{ wsSlug?: string }>();
  const workspaces = useAuthStore((s) => s.workspaces);
  const setCurrentWorkspaceId = useAuthStore((s) => s.setCurrentWorkspaceId);

  const workspace = wsSlug
    ? (workspaces.find((w) => w.slug === wsSlug) ?? null)
    : pickDefault(workspaces);

  useEffect(() => {
    if (workspace) setCurrentWorkspaceId(workspace.id);
  }, [workspace, setCurrentWorkspaceId]);

  return workspace;
}
