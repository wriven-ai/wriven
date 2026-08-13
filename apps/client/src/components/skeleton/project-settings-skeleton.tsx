'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Project-settings page loading skeleton. Mirrors the real layout: header +
 * general settings form + danger zone card.
 */

function FieldSkeleton({ labelWidth = 'w-24' }: { labelWidth?: string }) {
  return (
    <div className="space-y-1.5">
      <Skeleton className={`h-2.5 ${labelWidth}`} />
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  );
}

/** Full project-settings page skeleton. */
export function ProjectSettingsSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-8" aria-hidden>
      {/* Header */}
      <div className="border-b border-brand-border pb-4 space-y-1.5">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-2.5 w-32" />
      </div>

      {/* General form */}
      <div className="space-y-4 rounded-xl border border-brand-border bg-brand-surface p-5">
        <Skeleton className="h-3 w-16" />
        <FieldSkeleton labelWidth="w-24" />
        <FieldSkeleton labelWidth="w-12" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      {/* Danger zone */}
      <div className="space-y-3 rounded-xl border border-status-error/30 bg-status-error/5 p-5">
        <Skeleton className="h-3 w-20" />
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-2/3" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
    </div>
  );
}

export default ProjectSettingsSkeleton;
