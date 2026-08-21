'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Billing-page loading skeletons — each mirrors the real markup's container so
 * it reads as the same layout, not a generic spinner.
 *  - `*Skeleton` — full card (shell + title + body), whole-page fallback.
 *  - `*Rows`/`*Body` — inner content only, dropped inside an already-rendered
 *    card while that section's React Query resolves.
 */

// A card shell identical to the real billing cards — keeps the silhouette.
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

// Section title bar (matches the real `text-sm font-mono` header + divider).
function SectionTitle({ width = 'w-28' }: { width?: string }) {
  return (
    <Skeleton
      className={cn('block h-3 border-b border-brand-border pb-2.5', width)}
    />
  );
}

// "Plan name · $price/mo" + description block at the top of a plan card.
function PlanHeaderSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-14 rounded-full" />
      </div>
      <div className="flex items-baseline gap-1">
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-3 w-6" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

// Icon + feature line, repeated.
function PlanFeaturesSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-3.5 rounded" />
          <Skeleton className="h-3 flex-1 max-w-40" />
        </div>
      ))}
    </div>
  );
}

/** A single plan-card skeleton — drop into the real grid while `usePlans` loads. */
export function PlanCardSkeleton({ highlight = false }: { highlight?: boolean }) {
  return (
    <Card
      className={cn(
        'relative flex flex-col gap-4',
        highlight && 'border-2 border-brand-accent',
      )}
    >
      {highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Skeleton className="h-4 w-24 rounded-full bg-brand-accent/30" />
        </div>
      )}
      <PlanHeaderSkeleton />
      <PlanFeaturesSkeleton />
      <Skeleton className="h-9 w-full rounded-lg mt-auto" />
    </Card>
  );
}

/** The monthly/yearly toggle + 3-up plan grid — shown while `usePlans` loads. */
export function PlanCardsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-brand-border bg-brand-surface-soft">
          <Skeleton className="h-7 w-20 rounded-lg" />
          <Skeleton className="h-7 w-20 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <PlanCardSkeleton key={i} highlight={i === 1} />
        ))}
      </div>
    </div>
  );
}

/** Label → value rows only — drop inside the summary card while sub loads. */
export function BillingSummaryRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Summary card (shell + title + rows + portal button + footer). */
export function BillingSummarySkeleton() {
  return (
    <Card className="space-y-4 sticky top-6">
      <SectionTitle width="w-28" />
      <BillingSummaryRows />
      <Skeleton className="h-9 w-full rounded-lg" />
      <Skeleton className="h-2.5 w-48 mx-auto" />
    </Card>
  );
}

/** Invoice list rows only — drop inside the invoice card while it loads. */
export function InvoiceRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-brand-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-2.5 w-24" />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-12 rounded" />
            <Skeleton className="h-6 w-6 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Invoice history card (shell + title + rows). */
export function InvoiceHistorySkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card className="space-y-4">
      <SectionTitle width="w-28" />
      <InvoiceRows rows={rows} />
    </Card>
  );
}

/** Payment-method card silhouette. */
export function PaymentMethodSkeleton() {
  return (
    <Card className="space-y-4">
      <SectionTitle width="w-32" />
      <div className="bg-brand-surface-soft border border-brand-border rounded-xl p-4 space-y-2">
        <Skeleton className="h-8 w-8 rounded mx-auto" />
        <Skeleton className="h-3 w-40 mx-auto" />
        <Skeleton className="h-2.5 w-52 mx-auto" />
      </div>
      <Skeleton className="h-9 w-full rounded-lg" />
      <Skeleton className="h-2.5 w-48 mx-auto" />
    </Card>
  );
}

/**
 * Full billing-page skeleton — the <Suspense> fallback (brief window before the
 * page mounts) and the initial whole-page load. Mirrors the real two-row layout:
 * plans + summary, then payment method + invoices.
 */
export function BillingSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-brand-border pb-5 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-3 w-72" />
        </div>
        <Skeleton className="h-6 w-28 rounded-lg" />
      </div>

      {/* Plans + summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-5">
          <Skeleton className="block h-3 w-32 mx-auto" />
          <PlanCardsSkeleton />
        </div>
        <div className="lg:col-span-4">
          <BillingSummarySkeleton />
        </div>
      </div>

      {/* Payment method + invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5">
          <PaymentMethodSkeleton />
        </div>
        <div className="lg:col-span-7">
          <InvoiceHistorySkeleton />
        </div>
      </div>
    </div>
  );
}

export default BillingSkeleton;
