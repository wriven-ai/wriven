'use client';

import { useQuery } from '@tanstack/react-query';
import { statsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

/**
 * Workspace-level aggregate stats (projects, members, entries split, content
 * types, API keys, webhooks, media, API requests vs plan limit). See specs/17.
 *
 * Keyed by the active workspace id (the same value the API client sends as
 * X-Workspace-Id) so switching workspaces always refetches — a global key would
 * serve a stale cache within `staleTime` after a switch. Disabled until the
 * store has resolved the workspace (avoids a headerless request on first paint).
 */
export function useWorkspaceStats() {
  const workspaceId = useAuthStore((s) => s.currentWorkspaceId);
  return useQuery({
    queryKey: ['stats', 'workspace', workspaceId],
    queryFn: statsApi.workspaceStats,
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}
