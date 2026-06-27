'use client';

import { notFound, useParams } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth';
import { useWorkspaceProjects } from './use-workspace-projects';

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
 * URL → store sync for the project scope. Resolves `projSlug` against the
 * active workspace's projects (server state, via React Query) and mirrors its
 * id into the store for X-Project-Id.
 *
 * 404s only once the list is *settled* (fetched, not refetching) and the slug
 * is absent — so a freshly-created project (cache refetching) or the initial
 * load never flashes a false 404.
 */
export function useSyncProjectFromUrl() {
  const { projSlug } = useParams<{ projSlug: string }>();
  const setCurrentProjectId = useAuthStore((s) => s.setCurrentProjectId);
  const { workspace, projects, isSettled } = useWorkspaceProjects();

  const project = projects.find((p) => p.slug === projSlug) ?? null;

  useEffect(() => {
    if (project) setCurrentProjectId(project.id);
  }, [project, setCurrentProjectId]);

  if (workspace && isSettled && !project) {
    notFound();
  }

  return project;
}
