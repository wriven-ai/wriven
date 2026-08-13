'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Content-list page loading skeletons. Mirrors the real entries table layout:
 * header row + entry rows (title + slug + status + updated + delete action).
 */

function EntryRowSkeleton() {
  return (
    <div className="grid grid-cols-12 gap-3 px-4 py-3 items-center">
      <div className="col-span-12 sm:col-span-6 min-w-0 space-y-1.5">
        <Skeleton className="h-3 w-3/4 max-w-48" />
        <Skeleton className="h-2.5 w-24" />
      </div>
      <div className="col-span-6 sm:col-span-2">
        <Skeleton className="h-4 w-14 rounded" />
      </div>
      <div className="col-span-5 sm:col-span-3">
        <Skeleton className="h-2.5 w-20" />
      </div>
      <div className="col-span-1 flex justify-end">
        <Skeleton className="h-4 w-4 rounded" />
      </div>
    </div>
  );
}

/** Entry rows only — drops inside the rendered table while entries load. */
export function EntryRowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-brand-border" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <EntryRowSkeleton key={i} />
      ))}
    </div>
  );
}

/** Full entries table skeleton — header + rows, drops while entries load. */
export function ContentListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl shadow-xs overflow-hidden" aria-hidden>
      {/* Table header */}
      <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-brand-border bg-brand-surface-soft/40">
        <Skeleton className="h-3 w-16 col-span-6" />
        <Skeleton className="h-3 w-12 col-span-2" />
        <Skeleton className="h-3 w-14 col-span-3" />
        <span className="col-span-1" />
      </div>
      <EntryRowsSkeleton rows={rows} />
    </div>
  );
}

/** Content-type select dropdown skeleton — drops in while types load. */
export function ContentTypeSelectSkeleton() {
  return <Skeleton className="h-8 w-48 rounded" />;
}

/** Full content-list page skeleton (header + selector + table). */
export function ContentListPageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-8" aria-hidden>
      {/* Header */}
      <div className="border-b border-brand-border pb-5 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3 w-72" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      <ContentTypeSelectSkeleton />
      <ContentListSkeleton rows={rows} />
    </div>
  );
}

export default ContentListPageSkeleton;
