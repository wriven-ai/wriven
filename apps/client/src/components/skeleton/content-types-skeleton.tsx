'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Content-types page loading skeleton. Mirrors the real layout: header +
 * create-form card + content-type list card.
 */

export function ContentTypeCardSkeleton() {
  return (
    <div className="bg-brand-surface border border-brand-border p-5 rounded-xl shadow-xs space-y-4">
      <div className="flex justify-between items-start gap-4">
        <div className="space-y-1.5 min-w-0">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-4 w-32" />
          <div className="flex items-center gap-2 mt-2">
            <Skeleton className="h-4 w-20 rounded" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <Skeleton className="h-7 w-16 rounded-lg" />
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-7 w-7 rounded" />
        </div>
      </div>
    </div>
  );
}

/** Full content-types page skeleton. */
export function ContentTypesPageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-8" aria-hidden>
      {/* Header */}
      <div className="border-b border-brand-border pb-5 space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3 w-72" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Create form */}
        <div className="lg:col-span-5 bg-brand-surface border border-brand-border rounded-xl p-5 space-y-5">
          <div className="border-b border-brand-border pb-2.5">
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>

        {/* List */}
        <div className="lg:col-span-7 space-y-4">
          <Skeleton className="h-3 w-28" />
          <div className="space-y-4">
            {Array.from({ length: cards }).map((_, i) => (
              <ContentTypeCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ContentTypesPageSkeleton;
