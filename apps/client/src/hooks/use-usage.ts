'use client';

import { useQuery } from '@tanstack/react-query';
import { usageApi } from '@/lib/api';

/** Cache key for workspace usage (Delivery API requests + storage). */
export const USAGE_KEYS = {
  usage: ['usage'] as const,
};

/**
 * Current-period workspace usage vs plan limits (requests used/limit +
 * storage used/limit). Refreshes every 60s — usage moves slowly. See specs/14.
 */
export function useUsage() {
  return useQuery({
    queryKey: USAGE_KEYS.usage,
    queryFn: usageApi.getUsage,
    staleTime: 60_000,
  });
}
