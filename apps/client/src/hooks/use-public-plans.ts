'use client';

import { useQuery } from '@tanstack/react-query';
import { plansApi } from '@/lib/api';

/** Cache key for the public plan catalog. */
export const PLAN_KEYS = {
  public: ['plans', 'public'] as const,
};

/**
 * Public plan catalog (free/starter/pro) for the `/pricing` page. No auth, no
 * workspace — fetched from `GET /plans`. Plans change rarely → 10min stale.
 */
export function usePublicPlans() {
  return useQuery({
    queryKey: PLAN_KEYS.public,
    queryFn: plansApi.listPublic,
    staleTime: 600_000,
  });
}
