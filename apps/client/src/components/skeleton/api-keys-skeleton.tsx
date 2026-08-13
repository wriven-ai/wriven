'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * API-keys page loading skeleton. Mirrors the real layout: header + project ID
 * card + create-form card + key list.
 */

export function ApiKeyCardSkeleton() {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-3.5 px-4 space-y-2.5">
      <div className="flex justify-between items-center gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-3.5" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3.5 w-20 rounded" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
        <Skeleton className="h-6 w-14 rounded-lg" />
      </div>
      <div className="border border-brand-border-button bg-brand-surface-soft rounded-lg p-1.5 px-3 flex items-center justify-between">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-2.5 w-16" />
      </div>
    </div>
  );
}

/** API key rows only — drops inside the rendered list while keys load. */
export function ApiKeyRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <ApiKeyCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Full API-keys page skeleton. */
export function ApiKeysPageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-8" aria-hidden>
      {/* Header */}
      <div className="border-b border-brand-border pb-5 space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3 w-64" />
      </div>

      {/* Project ID card */}
      <div className="rounded-xl border border-brand-border bg-brand-surface p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-3.5" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-3 w-56" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 flex-1 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Create form */}
        <div className="lg:col-span-5 bg-brand-surface border border-brand-border rounded-xl p-5 space-y-5">
          <div className="border-b border-brand-border pb-2.5">
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-20" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          </div>
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>

        {/* Key list */}
        <div className="lg:col-span-7 space-y-4">
          <Skeleton className="h-3 w-24" />
          <div className="space-y-4">
            {Array.from({ length: cards }).map((_, i) => (
              <ApiKeyCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ApiKeysPageSkeleton;
