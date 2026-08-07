'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Media-library loading skeleton. Mirrors the real layout: control bar + upload
 zone + asset grid (3-up) + inspector sidebar.
 */

function MediaCardSkeleton() {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
      <Skeleton className="h-28 w-full" />
      <div className="p-3 space-y-1.5">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-2.5 w-16" />
      </div>
    </div>
  );
}

/** Media grid skeleton (3-up cards). */
export function MediaGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4" aria-hidden>
      {Array.from({ length: cards }).map((_, i) => (
        <MediaCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Full media-library page skeleton. */
export function MediaLibraryPageSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="space-y-8" aria-hidden>
      {/* Header */}
      <div className="border-b border-brand-border pb-5 space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3 w-72" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: controls + upload + grid */}
        <div className="lg:col-span-8 space-y-5">
          {/* Control bar */}
          <div className="bg-brand-surface border border-brand-border p-4 rounded-xl flex items-center justify-between gap-3">
            <Skeleton className="h-8 flex-1 max-w-xs rounded-lg" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-7 w-7 rounded-lg" />
            </div>
          </div>

          {/* Upload zone */}
          <Skeleton className="h-32 w-full rounded-xl" />

          <MediaGridSkeleton cards={cards} />
        </div>

        {/* Right: inspector */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <div className="space-y-3 pt-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-2.5 w-20" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              ))}
            </div>
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
          <div className="bg-brand-surface border border-brand-border p-4 rounded-xl space-y-3">
            <Skeleton className="h-3 w-16" />
            <div className="flex justify-between">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-2.5 w-12" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default MediaLibraryPageSkeleton;
