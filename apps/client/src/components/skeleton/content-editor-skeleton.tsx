'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Content-editor loading skeleton. Mirrors the real editor layout: header with
 * back button + title, the field area, and the right-hand sidebar (status +
 * actions + AI panel).
 */

function FieldSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/** Full content-editor page skeleton. */
export function ContentEditorSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-6" aria-hidden>
      {/* Top bar: back + title + actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main field area */}
        <div className="lg:col-span-8 space-y-5">
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-5">
            <Skeleton className="h-10 w-full rounded-lg" />
            <FieldSkeleton rows={fields} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-4">
            <Skeleton className="h-3 w-16" />
            <div className="flex gap-2">
              <Skeleton className="h-8 flex-1 rounded-lg" />
              <Skeleton className="h-8 flex-1 rounded-lg" />
            </div>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ContentEditorSkeleton;
