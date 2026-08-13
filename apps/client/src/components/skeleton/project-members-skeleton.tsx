'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Project-members page loading skeleton. Mirrors the real layout: header + tabs,
 * member rows + invite form.
 */

function MemberRowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-3 p-3 border border-brand-border bg-brand-surface-soft/40 rounded-xl">
      <div className="flex items-center gap-3 min-w-0">
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-2.5 w-40" />
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Skeleton className="h-4 w-14 rounded" />
        <Skeleton className="h-6 w-6 rounded" />
      </div>
    </div>
  );
}

/** Full project-members page skeleton. */
export function ProjectMembersSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-6" aria-hidden>
      {/* Header */}
      <div className="border-b border-brand-border pb-5 space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3 w-72" />
      </div>

      {/* Tabs */}
      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-brand-surface-soft/60 border border-brand-border">
        <Skeleton className="h-7 w-32 rounded-lg" />
        <Skeleton className="h-7 w-40 rounded-lg" />
      </div>

      {/* Members + invite form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-4">
            <Skeleton className="h-3 w-24 border-b border-brand-border pb-2" />
            <div className="space-y-3.5">
              {Array.from({ length: rows }).map((_, i) => (
                <MemberRowSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-24 bg-brand-surface border border-brand-border rounded-xl p-5 space-y-4">
            <Skeleton className="h-3 w-20 border-b border-brand-border pb-2" />
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-brand-border bg-brand-surface-soft/40 p-1">
              <Skeleton className="h-8 rounded-md" />
              <Skeleton className="h-8 rounded-md" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-2.5 w-10" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProjectMembersSkeleton;
