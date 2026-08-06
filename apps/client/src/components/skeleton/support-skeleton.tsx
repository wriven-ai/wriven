'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Support-page loading skeletons. Each skeleton mirrors the real markup's
 * container (surface + hairline border + rounded-xl) so it reads as the same
 * layout, not a generic spinner. Pulse blocks use the shared <Skeleton/>
 * primitive, which is token-bound (bg-muted = brand-surface-soft) and tracks
 * light/dark automatically.
 *
 * Three pages:
 *  - `SupportListSkeleton`    list page (header + filters + ticket rows)
 *  - `NewTicketSkeleton`      "open a ticket" form page
 *  - `TicketDetailSkeleton`  conversation thread page
 * Granular `*Rows`/`*Body` helpers drop inside already-rendered cards while a
 * section's React Query resolves.
 */

// A card shell identical to the real support cards — keeps the silhouette.
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

/** Shared page header — title bar + trailing action/button. */
function PageHeader({
  titleClass = 'h-7 w-40',
  subtitleClass = 'h-3 w-72',
  actions,
}: {
  titleClass?: string;
  subtitleClass?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="border-b border-brand-border pb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className={cn('block', titleClass)} />
        <Skeleton className={cn('block', subtitleClass)} />
      </div>
      {actions ?? <Skeleton className="h-9 w-28 rounded-lg shrink-0" />}
    </div>
  );
}

/** Status filter chips — all + open/pending/resolved/closed. */
export function FilterChips() {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-7 w-16 rounded-full" />
      ))}
    </div>
  );
}

/** A single ticket row — unread dot + meta line + subject + timestamp. */
export function TicketRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-brand-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-5 py-4"
        >
          <div className="w-2 shrink-0">
            {i % 3 === 0 && <Skeleton className="h-2 w-2 rounded-full" />}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-2.5 w-10" />
              <Skeleton className="h-4 w-14 rounded" />
              <Skeleton className="h-4 w-12 rounded" />
            </div>
            <Skeleton className="h-3 w-2/3 max-w-80" />
          </div>
          <div className="shrink-0 text-right">
            <Skeleton className="ml-auto h-2.5 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Ticket list card (shell + rows) — drop while `useQuery` loads. */
export function TicketListCard({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden shadow-xs">
      <TicketRows rows={rows} />
    </div>
  );
}

/** Full support-list page skeleton — <Suspense> fallback + whole-page load. */
export function SupportListSkeleton() {
  return (
    <div className="space-y-8 text-left">
      <PageHeader
        titleClass="h-8 w-40"
        subtitleClass="h-3 w-96"
        actions={<Skeleton className="h-9 w-28 rounded-lg shrink-0" />}
      />
      <FilterChips />
      <TicketListCard />
    </div>
  );
}

/** Form-field silhouette — label + input, shared by the new-ticket form. */
function FormFieldSkeleton({
  labelClass = 'h-2.5 w-16',
  inputClass = 'h-10 w-full rounded-lg',
}: {
  labelClass?: string;
  inputClass?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Skeleton className={cn('block', labelClass)} />
      <Skeleton className={cn('block', inputClass)} />
    </div>
  );
}

/** Full "open a ticket" form skeleton. */
export function NewTicketSkeleton() {
  return (
    <div className="space-y-8 text-left max-w-2xl">
      <PageHeader
        titleClass="h-7 w-52"
        subtitleClass="h-3 w-96"
        actions={null}
      />
      <div className="space-y-6">
        <FormFieldSkeleton labelClass="w-20" inputClass="h-10" />
        <FormFieldSkeleton labelClass="w-20" inputClass="h-10" />
        <FormFieldSkeleton
          labelClass="w-20"
          inputClass="h-40 w-full rounded-lg"
        />
        <Card className="h-14">{null}</Card>
        <div className="flex items-center gap-3 pt-2">
          <Skeleton className="h-11 w-32 rounded-lg" />
          <Skeleton className="h-4 w-14" />
        </div>
      </div>
    </div>
  );
}

/** A chat bubble silhouette — avatar + meta + body block. */
export function MessageBubbleRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: rows }).map((_, i) => {
        const own = i % 2 === 1;
        return (
          <div
            key={i}
            className={cn('flex gap-3', own ? 'flex-row-reverse' : 'flex-row')}
          >
            <Skeleton className="h-7 w-7 rounded-full shrink-0" />
            <div className={cn('flex flex-col gap-1 max-w-[75%]', own ? 'items-end' : 'items-start')}>
              <div className={cn('flex items-center gap-2', own ? 'flex-row-reverse' : 'flex-row')}>
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-2.5 w-12" />
              </div>
              <Skeleton
                className={cn(
                  'h-16 w-72 rounded-xl',
                )}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Conversation thread (opening post + bubbles) — drop while `useQuery` loads. */
export function TicketThread() {
  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-2.5 w-10" />
          <Skeleton className="h-2.5 w-14" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
      </Card>
      <MessageBubbleRows rows={2} />
    </div>
  );
}

/** Reply box silhouette. */
export function ReplyBoxSkeleton() {
  return (
    <Card className="space-y-4">
      <Skeleton className="block h-3 w-10" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-6 rounded" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
    </Card>
  );
}

/** Full ticket-detail page skeleton. */
export function TicketDetailSkeleton() {
  return (
    <div className="space-y-6 text-left max-w-3xl">
      {/* Header */}
      <div className="border-b border-brand-border pb-5 space-y-3">
        <div className="flex items-start gap-3">
          <Skeleton className="h-3 w-8 mt-1 shrink-0" />
          <Skeleton className="h-7 w-96" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-5 w-16 rounded" />
          <Skeleton className="h-5 w-14 rounded" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
      <TicketThread />
      <ReplyBoxSkeleton />
    </div>
  );
}

export default SupportListSkeleton;