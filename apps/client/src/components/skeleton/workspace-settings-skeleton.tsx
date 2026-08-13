'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Workspace-settings page loading skeletons. Each skeleton mirrors the real
 * markup's container (surface + hairline border + rounded-xl) so it reads as
 * the same layout, not a generic spinner. Pulse blocks use the shared
 * <Skeleton/> primitive, which is token-bound (bg-muted = brand-surface-soft)
 * and tracks light/dark automatically.
 */

function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'bg-brand-surface border border-brand-border rounded-xl p-5 shadow-xs',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A form field — label + input silhouette. */
function FieldSkeleton({
  labelWidth = 'w-28',
  inputHeight = 'h-10',
}: {
  labelWidth?: string;
  inputHeight?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Skeleton className={cn('block h-2.5', labelWidth)} />
      <Skeleton className={cn('block w-full rounded-lg', inputHeight)} />
    </div>
  );
}

/** General settings card silhouette (form + save button). */
export function GeneralSettingsSkeleton() {
  return (
    <Card className="space-y-4">
      <Skeleton className="h-3 w-16" />
      <FieldSkeleton labelWidth="w-28" />
      <Skeleton className="h-9 w-28 rounded-lg" />
    </Card>
  );
}

/** Danger zone card silhouette (destructive action). */
export function DangerZoneSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border border-status-error/30 bg-status-error/5 p-5">
      <Skeleton className="h-3 w-20" />
      <div className="space-y-1.5">
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="h-2.5 w-2/3" />
      </div>
      <Skeleton className="h-9 w-36 rounded-lg" />
    </div>
  );
}

/**
 * Full workspace-settings page skeleton — mirrors the real layout: header +
 * general settings form + danger zone.
 */
export function WorkspaceSettingsSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-8" aria-hidden>
      {/* Header */}
      <div className="border-b border-brand-border pb-4 space-y-1.5">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-2.5 w-40" />
      </div>

      <GeneralSettingsSkeleton />
      <DangerZoneSkeleton />
    </div>
  );
}

export default WorkspaceSettingsSkeleton;
