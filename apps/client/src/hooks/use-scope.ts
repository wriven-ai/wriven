'use client';

import { notFound, useParams } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth';

/**
 * URL → store sync for the workspace scope. Resolves `wsSlug` to a workspace and
 * mirrors its id into the store so the API client sends the right X-Workspace-Id.
 * The URL stays the source of truth; the store is just a mirror for the header.
 * Invalid slug (once the session is loaded) → 404.
 *
 * @returns the resolved workspace, or null while the session is still loading.
 */
export function useSyncWorkspaceFromUrl() {
  const { wsSlug } = useParams<{ wsSlug: string }>();
  const status = useAuthStore((s) => s.status);
  const workspaces = useAuthStore((s) => s.workspaces);
  const setCurrentWorkspaceId = useAuthStore((s) => s.setCurrentWorkspaceId);

  const workspace = workspaces.find((w) => w.slug === wsSlug) ?? null;

  useEffect(() => {
    if (workspace) setCurrentWorkspaceId(workspace.id);
  }, [workspace, setCurrentWorkspaceId]);

  // Only 404 once the session is known; never during the loading window.
  if (status === 'authenticated' && workspaces.length > 0 && !workspace) {
    notFound();
  }

  return workspace;
}

/**
 * URL → store sync for the project scope. Resolves `projSlug` within the active
 * workspace and mirrors its id into the store for X-Project-Id.
 * Invalid slug (once loaded) → 404.
 */
export function useSyncProjectFromUrl() {
  const { wsSlug, projSlug } = useParams<{ wsSlug: string; projSlug: string }>();
  const status = useAuthStore((s) => s.status);
  const workspaces = useAuthStore((s) => s.workspaces);
  const projects = useAuthStore((s) => s.projects);
  const setCurrentProjectId = useAuthStore((s) => s.setCurrentProjectId);

  const workspace = workspaces.find((w) => w.slug === wsSlug) ?? null;
  const project =
    workspace != null
      ? (projects.find(
          (p) => p.workspaceId === workspace.id && p.slug === projSlug,
        ) ?? null)
      : null;

  useEffect(() => {
    if (project) setCurrentProjectId(project.id);
  }, [project, setCurrentProjectId]);

  if (status === 'authenticated' && workspace && !project) {
    notFound();
  }

  return project;
}
