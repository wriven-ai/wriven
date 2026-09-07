'use client';

import { useQuery } from '@tanstack/react-query';
import { plansApi } from '@/lib/api';
import type { PlanView } from '@/lib/types';

/** Cache key for the public plan catalog. */
export const PLAN_KEYS = {
  public: ['plans', 'public'] as const,
};

/**
 * Public plan catalog (free/starter/pro) for the `/pricing` page. No auth, no
 * workspace — fetched from `GET /plans`. Plans change rarely → 10min stale.
 * `initialData` comes from the server-rendered fetch (`lib/server/plans`) so
 * the first paint has real plans with no skeleton flash; the client query
 * then takes over staleness/refreshing.
 */
export function usePublicPlans(initialData?: PlanView[]) {
  return useQuery({
    queryKey: PLAN_KEYS.public,
    queryFn: plansApi.listPublic,
    staleTime: 600_000,
    initialData,
  });
}
