'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { workspaceLogApi } from '@/lib/api';
import type { WorkspaceLogWindow } from '@/lib/types';

/** Cache keys for the workspace activity feed. */
export const WORKSPACE_LOG_KEYS = {
  logs: (wsId: string | null, days: WorkspaceLogWindow, page: number) =>
    ['workspace-logs', wsId, days, page] as const,
};

/**
 * Workspace activity feed (`GET /logs`), windowed by days (7/30/90) and
 * paginated. `placeholderData` keeps the previous page visible while the
 * next loads so paging doesn't flash a skeleton.
 */
export function useWorkspaceLogs(
  wsId: string | null,
  days: WorkspaceLogWindow,
  page: number,
) {
  return useQuery({
    queryKey: WORKSPACE_LOG_KEYS.logs(wsId, days, page),
    queryFn: () => workspaceLogApi.list({ days, page, limit: 20 }),
    enabled: !!wsId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
