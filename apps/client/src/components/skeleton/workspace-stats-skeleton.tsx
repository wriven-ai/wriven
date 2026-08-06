'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Loading skeletons for the stats grids (specs/17). Mirrors the real card grid
 * so there's no layout shift on load. Uses the token-bound <Skeleton/>
 * primitive (bg-muted = brand-surface-soft) + the standard card shell.
 */

function StatCardSkeleton() {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-7 rounded-lg" />
      </div>
      <Skeleton className="mt-3 h-6 w-16" />
      <Skeleton className="mt-1.5 h-2.5 w-24" />
    </div>
  );
}

/** Mirrors the workspace stats grid (8 cards). */
export function WorkspaceStatsSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <div
      className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4')}
      aria-hidden
    >
      {Array.from({ length: cards }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Mirrors the project stats grid (5 cards). */
export function ProjectStatsSkeleton({ cards = 5 }: { cards?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: cards }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}
