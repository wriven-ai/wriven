'use client';

import { useQuery } from '@tanstack/react-query';
import { projectApi } from '@/lib/api';
import { useCurrentWorkspace } from './use-current-workspace';

/**
 * Server source of truth for the active workspace's projects. Keyed by
 * workspace id, so it shares cache + invalidation with the projects page
 * (`['projects', workspaceId]`). The nav (context + scope sync) reads projects
 * from here instead of the store — projects are server state, fetched on demand,
 * not part of the auth session payload.
 *
 * Resolves the workspace by URL slug, or the default workspace at /dashboard
 * (via useCurrentWorkspace). `isSettled` tells callers it's safe to act on
 * "not found" (a successful fetch that's not currently refetching).
 */
export function useWorkspaceProjects() {
  const workspace = useCurrentWorkspace();

  const query = useQuery({
    queryKey: ['projects', workspace?.id],
    queryFn: () => projectApi.list(workspace!.id),
    enabled: !!workspace,
  });

  return {
    workspace,
    projects: query.data ?? [],
    isLoading: query.isLoading,
    /** True once we have a real answer and aren't mid-refetch — safe to 404. */
    isSettled: query.isSuccess && !query.isFetching,
  };
}
