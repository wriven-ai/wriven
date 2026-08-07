'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Usage & consumption page loading skeletons. Each skeleton mirrors the real
 * markup's container (surface + hairline border + rounded-xl) so it reads as
 * the same layout, not a generic spinner. Pulse blocks use the shared
 * <Skeleton/> primitive, which is token-bound (bg-muted = brand-surface-soft)
 * and tracks light/dark automatically.
 */

function UsageCardSkeleton() {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-5 h-32 animate-pulse" />
  );
}

/** The two usage cards (API requests + storage) — matches the real 2-up grid. */
export function UsageCardsSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" aria-hidden>
      {Array.from({ length: cards }).map((_, i) => (
        <UsageCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Full usage page skeleton — mirrors the real layout: header + refresh button,
 * usage cards grid, then workspace stats section.
 */
export function UsagePageSkeleton() {
  return (
    <div className="space-y-8" aria-hidden>
      {/* Header */}
      <div className="border-b border-brand-border pb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-3 w-80" />
        </div>
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>

      <UsageCardsSkeleton />

      {/* Workspace Stats section header */}
      <div className="space-y-3 pt-2">
        <Skeleton className="h-3 w-28" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-brand-surface border border-brand-border rounded-xl p-4 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-7 rounded-lg" />
              </div>
              <Skeleton className="mt-3 h-6 w-16" />
              <Skeleton className="mt-1.5 h-2.5 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default UsagePageSkeleton;
