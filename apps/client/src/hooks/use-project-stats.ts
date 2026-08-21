'use client';

import { useQuery } from '@tanstack/react-query';
import { statsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

/**
 * Keyed by the active project id (the value sent as X-Project-Id) so switching
 * projects always refetches — a global key would serve the previous project's
 * stats within `staleTime`. Disabled until the store has resolved the project
 * (the project layout's URL-sync sets it; avoids a headerless 403 on mount).
 */
export function useProjectStats() {
  const projectId = useAuthStore((s) => s.currentProjectId);
  return useQuery({
    queryKey: ['stats', 'project', projectId],
    queryFn: statsApi.projectStats,
    enabled: !!projectId,
    staleTime: 60_000,
  });
}
