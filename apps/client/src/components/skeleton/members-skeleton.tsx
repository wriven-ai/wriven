'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Workspace-members page loading skeletons — each mirrors the real markup's
 * container so it reads as the same layout, not a generic spinner.
 *  - `*Skeleton` — full card (shell + title + body), whole-page fallback.
 *  - `*Rows`/`*Body` — inner content only, dropped inside an already-rendered
 *    card while that section's React Query resolves.
 */

// A card shell identical to the real members cards — keeps the silhouette.
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
        'bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs',
        className,
      )}
    >
      {children}
    </div>
  );
}

// Section title bar (matches the real `text-sm font-mono` header + divider).
function SectionTitle({ width = 'w-32' }: { width?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Skeleton className="h-3.5 w-3.5 rounded" />
      <Skeleton
        className={cn('block h-3 border-b border-brand-border pb-2.5', width)}
      />
    </div>
  );
}

// A single member row — avatar + name/email + role badge + remove action.
export function MemberRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 p-3 border border-brand-border bg-brand-surface-soft/40 rounded-xl"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2.5 w-7 rounded" />
              </div>
              <Skeleton className="h-2.5 w-44" />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Skeleton className="h-4 w-16 rounded" />
            <Skeleton className="h-6 w-6 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Members card (shell + title + rows). */
export function MembersListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card className="space-y-4">
      <SectionTitle />
      <MemberRows rows={rows} />
    </Card>
  );
}

// A pending-invitation row — email + meta on the left, resend/revoke on the right.
export function InviteRows({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-brand-border">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
        >
          <div className="min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-44" />
            <Skeleton className="h-2.5 w-28" />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-6 w-6 rounded" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Pending-invitations card (shell + title + rows). */
export function InvitesListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card className="space-y-3">
      <SectionTitle />
      <InviteRows rows={rows} />
    </Card>
  );
}

/** The sticky "Invite a member" form card silhouette. */
export function InviteFormSkeleton() {
  return (
    <Card className="space-y-4">
      <SectionTitle width="w-28" />
      <div className="space-y-4">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-10" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-10" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-2.5 w-full" />
      </div>
    </Card>
  );
}

/** Tabs header (Members & Invites / Role Permissions Matrix). */
function TabsSkeleton() {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-brand-surface-soft/60 border border-brand-border">
      <Skeleton className="h-7 w-36 rounded-lg" />
      <Skeleton className="h-7 w-44 rounded-lg" />
    </div>
  );
}

/**
 * Full members-page skeleton — the <Suspense> fallback (brief window before the
 * page mounts) and the initial whole-page load. Mirrors the real layout: header
 * + tabs, then the members/invites grid with the sticky invite form.
 */
export function WorkspaceMembersSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-brand-border pb-5 space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3 w-96" />
      </div>

      {/* Tabs */}
      <TabsSkeleton />

      {/* Members + invites, and the sticky invite form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-6">
          <MembersListSkeleton />
          <InvitesListSkeleton />
        </div>
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-24">
            <InviteFormSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}

export default WorkspaceMembersSkeleton;