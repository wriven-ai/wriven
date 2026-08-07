'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CalendarClock,
  Check,
  CreditCard,
  Database,
  Download,
  Eye,
  FileText,
  Globe,
  History,
  Layers,
  LifeBuoy,
  Loader2,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';
import {
  useCheckout,
  useInvoices,
  usePortal,
  usePlans,
  useSubscription,
  useRefreshSubscription,
  useSwapPlan,
} from '@/hooks/use-billing';
import { ApiRequestError } from '@/lib/api';
import { computeDowngradeBlocks } from '@/lib/downgrade';
import { toast } from 'sonner';
import { BlockedDowngradeDialog } from '@/components/ui/blocked-downgrade-dialog';
import { ConfirmationDialog, type ConfirmVariant } from '@/components/ui/confirmation-dialog';
import { Pagination } from '@/components/ui/pagination';
import { SuccessModal } from '@/components/ui/success-modal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useWorkspaceStats } from '@/hooks/use-workspace-stats';
import type {
  BillingCycle,
  DowngradeBlock,
  PendingDowngrade,
  PlanView,
} from '@/lib/types';
import {
  BillingSkeleton,
  PlanCardSkeleton,
  BillingSummaryRows,
  InvoiceRows,
} from '@/components/skeleton/billing-skeleton';

/** The kind of plan-change a card action represents. Drives confirm/success copy. */
type PlanActionKind =
  | 'upgrade'
  | 'downgrade'
  | 'cycle-switch'
  | 'reactivate'
  | 'cancel'
  | 'cancel-downgrade';
import { useCan } from '@/components/sidebar/use-can';
import { Permission } from '@wriven/contracts/rbac';
import { NoAccess } from '@/components/auth/no-access';

// ── helpers ────────────────────────────────────────────────────────────────

function formatPrice(cents: number | null | undefined, currency = 'usd'): string {
  if (!cents) return '$0';
  const usd = cents / 100;
  const symbol = currency === 'usd' ? '$' : '';
  return `${symbol}${usd % 1 === 0 ? usd : usd.toFixed(2)}`;
}

/** Always-2-decimals money for invoice amounts. */
function formatMoney(cents: number | null | undefined, currency = 'usd'): string {
  const symbol = currency === 'usd' ? '$' : '';
  return `${symbol}${((cents ?? 0) / 100).toFixed(2)}`;
}

function invoiceStatusClass(status: string): string {
  if (status === 'paid') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  if (status === 'open') return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
  if (status === 'uncollectible') return 'bg-red-500/10 text-red-500 border-red-500/20';
  return 'bg-brand-surface-soft text-text-muted border-brand-border';
}

function storageLabel(mb: number | null | undefined): string {
  if (mb == null) return 'Unlimited storage';
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb % 1024 ? 1 : 0)} GB storage`;
  return `${mb} MB storage`;
}

/** Turn a plan's limits + features into a readable feature list. */
function planFeatures(plan: PlanView): string[] {
  const l = plan.limits;
  const f = plan.features;
  const qty = (n: number | null | undefined, label: string) =>
    n == null ? `Unlimited ${label}` : `${n} ${label}`;
  return [
    qty(l.projects, 'projects'),
    qty(l.members, 'members'),
    qty(l.contentTypes, 'content types'),
    qty(l.entries, 'entries'),
    storageLabel(l.storageMb),
    f.auditLog ? 'Audit log' : null,
    f.revisionHistory ? 'Revision history' : null,
    f.scheduledPublishing ? 'Scheduled publishing' : null,
    f.previewApi ? 'Preview API' : null,
    f.customRoles ? 'Custom roles' : null,
    `${f.supportTier ?? 'community'} support`,
  ].filter(Boolean) as string[];
}

function statusBadgeClass(status: string): string {
  if (status === 'past_due') return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
  if (status === 'canceled' || status === 'incomplete')
    return 'bg-red-500/10 text-red-500 border-red-500/20';
  return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
}

type FeatureIcon = React.ComponentType<{ className?: string }>;

/** Pick an icon per feature by keyword (falls back to a check). */
const FEATURE_ICON_MAP: { match: string; Icon: FeatureIcon }[] = [
  { match: 'member', Icon: Users },
  { match: 'project', Icon: Layers },
  { match: 'content type', Icon: Boxes },
  { match: 'entrie', Icon: FileText },
  { match: 'storage', Icon: Database },
  { match: 'bandwidth', Icon: Globe },
  { match: 'api request', Icon: Zap },
  { match: 'audit', Icon: ScrollText },
  { match: 'revision', Icon: History },
  { match: 'scheduled', Icon: CalendarClock },
  { match: 'preview', Icon: Eye },
  { match: 'custom role', Icon: ShieldCheck },
  { match: 'support', Icon: LifeBuoy },
];

function featureIcon(feature: string): FeatureIcon {
  const hit = FEATURE_ICON_MAP.find((m) => feature.toLowerCase().includes(m.match));
  return hit?.Icon ?? Check;
}

// ── page (Suspense wrapper — useSearchParams requires it) ───────────────────

export default function BillingPage() {
  return (
    <Suspense fallback={<BillingSkeleton />}>
      <BillingInner />
    </Suspense>
  );
}

function BillingInner() {
  const router = useRouter();
  const params = useParams<{ wsSlug: string }>();
  const wsSlug = params.wsSlug;
  const searchParams = useSearchParams();
  const checkoutParam = searchParams.get('checkout');

  const can = useCan();
  const canManage = can(Permission.WORKSPACE_BILLING_MANAGE);

  const plansQuery = usePlans();
  const subQuery = useSubscription();
  const invoicesQuery = useInvoices();
  const statsQuery = useWorkspaceStats();
  const refreshSubscription = useRefreshSubscription();

  const checkout = useCheckout();
  const portal = usePortal();
  const swap = useSwapPlan();

  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  // Plan-change flow: confirm → updating → success (idle otherwise).
  const [step, setStep] = useState<'idle' | 'confirm' | 'updating' | 'success'>(
    'idle',
  );
  const [pending, setPending] = useState<{
    plan: PlanView;
    cycle: BillingCycle;
    kind: PlanActionKind;
  } | null>(null);
  const [successCtx, setSuccessCtx] = useState<
    { title: string; description: string } | null
  >(null);
  // Downgrade blocked by over-limit resources — drives the BlockedDowngradeDialog.
  const [blocked, setBlocked] = useState<{
    planName: string;
    blocks: DowngradeBlock[];
  } | null>(null);

  const subscription = subQuery.data;
  const hasPaidSub = !!subscription && subscription.planKey !== 'free';
  const currentPlanKey = subscription?.planKey ?? 'free';
  const invoices = invoicesQuery.data ?? [];

  // Invoice history pagination — 5 per page.
  const INVOICES_PER_PAGE = 5;
  const [invoicePage, setInvoicePage] = useState(1);
  const invoiceTotalPages = Math.max(1, Math.ceil(invoices.length / INVOICES_PER_PAGE));
  // Clamp to a valid page if the list shrank (refetch / fewer invoices).
  const safeInvoicePage = Math.min(invoicePage, invoiceTotalPages);
  const pagedInvoices = invoices.slice(
    (safeInvoicePage - 1) * INVOICES_PER_PAGE,
    safeInvoicePage * INVOICES_PER_PAGE,
  );

  // Redirect URLs must point at the real route (/w/[wsSlug]/billing), not the
  // backend default (APP_URL/billing) which omits the workspace segment.
  const billingPath = `/w/${wsSlug}/billing`;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const successUrl = `${origin}${billingPath}?checkout=success`;
  const cancelUrl = `${origin}${billingPath}?checkout=cancelled`;

  // Handle the Stripe redirect-back (?checkout=success|cancelled). The webhook is
  // the source of truth — refresh the subscription (flip may lag by a second).
  useEffect(() => {
    if (checkoutParam === 'success') {
      toast.success('Payment received — your plan is updating.');
      refreshSubscription();
      router.replace(billingPath);
    } else if (checkoutParam === 'cancelled') {
      toast('Checkout cancelled.');
      router.replace(billingPath);
    }
  }, [checkoutParam]);

  // Surface checkout errors (e.g. SUBSCRIPTION_EXISTS → use the Portal instead).
  useEffect(() => {
    if (checkout.isError && checkout.error instanceof ApiRequestError) {
      setStep('idle');
      setPending(null);
      if (checkout.error.error.code === 'SUBSCRIPTION_EXISTS') {
        toast(
          'This workspace already has a subscription — manage it in the Billing Portal.',
        );
      } else {
        toast.error(checkout.error.error.message);
      }
    }
  }, [checkout.isError, checkout.error]);

  const plans = useMemo(
    () =>
      (plansQuery.data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [plansQuery.data],
  );
  const currentPlanSortOrder =
    plans.find((p) => p.key === currentPlanKey)?.sortOrder ?? 0;
  const confirm = pending
    ? confirmContent(pending.kind, pending.plan, pending.cycle)
    : null;

  /** Card clicked → open the confirmation dialog with action-aware copy.
   *  Downgrades are screened first: if the workspace exceeds the target plan's
   *  stock-resource limits, the BlockedDowngradeDialog opens instead. The
   *  gateway guard (DOWNGRADE_BLOCKED) is the authoritative backstop — handles
   *  races, direct API use, and the stats-not-loaded-yet window. */
  const handleSelect = (
    plan: PlanView,
    targetCycle: BillingCycle,
    kind: PlanActionKind,
  ) => {
    if ((kind === 'downgrade' || kind === 'cancel') && statsQuery.data) {
      const blocks = computeDowngradeBlocks(statsQuery.data, plan.limits);
      if (blocks.length > 0) {
        setBlocked({ planName: plan.name, blocks });
        return;
      }
    }
    setPending({ plan, cycle: targetCycle, kind });
    setStep('confirm');
  };

  /** Confirm → route to Checkout (free→paid, redirects) or a direct swap
   *  (paid→paid). The swap's success/copy is derived from the requested action
   *  since the returned view may lag the webhook that flips the row. */
  const handleConfirm = () => {
    if (!pending) return;
    const { plan, cycle, kind } = pending;
    setStep('updating');
    if (!hasPaidSub) {
      // No card on file yet → Checkout collects payment (redirects to Stripe).
      checkout.mutate({
        planKey: plan.key as 'starter' | 'pro',
        billingCycle: cycle,
        successUrl,
        cancelUrl,
      });
      return;
    }
    // Paid → paid: direct prorated swap. Stays in-app; webhook flips the row ~1s later.
    swap.mutate(
      { planKey: plan.key as 'free' | 'starter' | 'pro', billingCycle: cycle },
      {
        onSuccess: () => {
          setSuccessCtx(successContent(kind, plan, cycle));
          setStep('success');
        },
        onError: (err) => {
          setStep('idle');
          // Server-side downgrade guard (race / direct-API / stats-not-loaded).
          if (
            err instanceof ApiRequestError &&
            err.error.code === 'DOWNGRADE_BLOCKED' &&
            err.error.details
          ) {
            setBlocked({ planName: plan.name, blocks: err.error.details });
            return;
          }
          toast.error(
            err instanceof ApiRequestError
              ? err.error.message
              : 'Could not update the plan. Try again.',
          );
        },
      },
    );
  };

  const onPortal = () => {
    portal.mutate({ returnUrl: `${origin}${billingPath}` });
  };

  if (!canManage) return <NoAccess />;

  return (
    <div className="space-y-8 text-left" id="billing-workspace">
      {/* Header */}
      <div className="border-b border-brand-border pb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
            Billing &{' '}
            <span className="font-normal italic text-brand-secondary">
              Subscription
            </span>
          </h1>
          <p className="text-sm sm:text-sm font-mono text-text-muted mt-1 leading-relaxed">
            {"// Manage your plan, payment method, and Stripe billing"}
          </p>
        </div>
        {subscription && (
          <span
             className={`text-xs font-mono font-bold uppercase tracking-wider border px-3 py-1.5 rounded-lg ${statusBadgeClass(
              subscription.status,
            )}`}
          >
            {subscription.planName} · {subscription.status}
          </span>
        )}
      </div>

      {!canManage && (
        <div className="flex items-center gap-2 rounded-xl border border-brand-border bg-brand-surface p-4 text-sm font-mono text-text-muted">
          <ShieldCheck className="w-4 h-4 text-brand-secondary shrink-0" />
          Only workspace owners or admins can change the plan. Ask an admin to
          upgrade.
        </div>
      )}

      {/* Plans + summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Plan cards */}
        <div className="lg:col-span-8 space-y-5" id="plan-cards">
          <span className="block text-center text-sm font-mono tracking-wider text-text-secondary font-bold">
            Available Plans
          </span>

          {/* Monthly / yearly toggle — centered above the cards */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-brand-border bg-brand-surface-soft">
              {(['monthly', 'yearly'] as BillingCycle[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCycle(c)}
                   className={`px-5 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-colors ${
                    cycle === c
                      ? 'bg-brand-accent text-white'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {plansQuery.isLoading
              ? [0, 1, 2].map((i) => (
                  <PlanCardSkeleton key={i} highlight={i === 1} />
                ))
              : plans.map((plan) => {
              const isCurrent = plan.key === currentPlanKey;
              const highlight = plan.key === 'pro';
              const isYearly = cycle === 'yearly';
              // Annual tab shows the monthly-equivalent ($/mo); the yearly total
              // is billed once per year. Math.round guards non-divisible yearly
              // prices (current tiers 10800/19440 divide cleanly → 900/1620).
              const price = isYearly
                ? Math.round((plan.priceYearly ?? 0) / 12)
                : plan.priceMonthly;
              return (
                <div
                  key={plan.id}
                  className={`relative bg-brand-surface rounded-xl p-5 shadow-xs flex flex-col gap-4 transition-all ${
                    isCurrent
                      ? 'border-2 border-brand-accent'
                      : 'border border-brand-border'
                  }`}
                  id={`plan-card-${plan.key}`}
                >
                  {highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="text-[10px] font-mono font-black uppercase tracking-widest bg-brand-accent text-white px-2.5 py-0.5 rounded-full">
                        Popular
                      </span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display font-bold text-base text-text-primary tracking-tight">
                        {plan.name}
                      </h3>
                      {isCurrent && (
                         <span className="text-xs font-bold font-mono uppercase bg-amber-500/10 border border-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded">
                          {subscription?.cancelAtPeriodEnd
                            ? 'Canceling'
                            : subscription?.pendingDowngrade
                              ? 'Downgrade scheduled'
                              : 'Active'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-0.5">
                      <span className="font-display font-black text-2xl text-text-primary">
                        {formatPrice(price, plan.currency)}
                      </span>
                      <span className="text-sm font-mono text-text-muted">
                        /mo
                      </span>
                    </div>
                    <p className="text-sm text-text-secondary font-light leading-relaxed">
                      {plan.description}
                    </p>
                  </div>

                  <ul className="space-y-2 flex-grow">
                    {planFeatures(plan).map((feature, i) => {
                      const Icon = featureIcon(feature);
                      return (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm font-mono text-text-secondary"
                        >
                          <Icon className="w-3.5 h-3.5 text-brand-secondary mt-0.5 shrink-0" />
                          {feature}
                        </li>
                      );
                    })}
                  </ul>

                  <PlanCta
                    plan={plan}
                    isCurrent={isCurrent}
                    currentSortOrder={currentPlanSortOrder}
                    subCycle={subscription?.billingCycle ?? null}
                    selectedCycle={cycle}
                    cancelAtPeriodEnd={subscription?.cancelAtPeriodEnd ?? false}
                    pendingDowngrade={subscription?.pendingDowngrade ?? null}
                    hasPaidSub={hasPaidSub}
                    canManage={canManage}
                    checkoutBusy={
                      checkout.isPending &&
                      checkout.variables?.planKey === plan.key
                    }
                    swapBusy={
                      swap.isPending && swap.variables?.planKey === plan.key
                    }
                    onSelect={handleSelect}
                  />
                </div>
              );
            })}
          </div>

          {plans.length === 0 && !plansQuery.isLoading && (
            <div className="text-center py-6 font-mono text-sm text-text-muted">
              No plans available.
            </div>
          )}
        </div>

        {/* Current billing summary */}
        <div className="lg:col-span-4 space-y-4 sticky top-6">
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 shadow-xs space-y-4">
            <span className="text-sm font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold">
              Billing Summary
            </span>

            {subQuery.isLoading ? (
              <BillingSummaryRows />
            ) : subscription ? (
              <div className="space-y-3 font-mono text-sm">
                <Row label="Plan" value={subscription.planName} />
                <Row label="Status" value={subscription.status} />
                <Row
                  label="Billing cycle"
                  value={subscription.billingCycle ?? '—'}
                />
                <Row
                  label="Current period"
                  value={
                    subscription.currentPeriodStart && subscription.currentPeriodEnd
                      ? `${subscription.currentPeriodStart.slice(0, 10)} → ${subscription.currentPeriodEnd.slice(0, 10)}`
                      : '—'
                  }
                />
                <Row
                  label="Renews"
                  value={
                    subscription.cancelAtPeriodEnd
                      ? `Cancels ${subscription.currentPeriodEnd?.slice(0, 10) ?? '—'}`
                      : (subscription.currentPeriodEnd?.slice(0, 10) ?? '—')
                  }
                />
                <Row
                  label="Payment method"
                  value={subscription.hasPaymentMethod ? 'On file' : 'None'}
                />
              </div>
            ) : null}

            {hasPaidSub && canManage && (
              <button
                onClick={onPortal}
                disabled={portal.isPending}
                className="w-full inline-flex items-center justify-center gap-1.5 font-mono font-bold text-sm py-2.5 rounded-lg border border-brand-border hover:border-brand-accent hover:text-brand-accent text-text-secondary transition-all disabled:opacity-50"
              >
                {portal.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Opening…
                  </>
                ) : (
                  <>
                    <CreditCard className="w-3.5 h-3.5" /> Manage in Portal
                  </>
                )}
              </button>
            )}

            <p className="text-sm font-mono text-text-muted text-center">
              Payments processed securely via Stripe. Card details never touch
              Wriven servers.
            </p>
          </div>
        </div>
      </div>

      {/* Payment method + Invoice history (shells — invoice endpoint deferred) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Payment method */}
        <div className="lg:col-span-5 bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
          <span className="text-sm font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold flex items-center gap-1.5">
            <CreditCard className="w-4 h-4 text-brand-secondary" /> Payment Method
          </span>

          <div className="bg-brand-surface-soft border border-brand-border rounded-xl p-4 text-center space-y-2">
            <CreditCard className="w-8 h-8 text-text-muted mx-auto" />
            {subscription?.hasPaymentMethod ? (
              <p className="text-sm font-mono text-text-secondary font-medium">
                Card on file — manage it in the Billing Portal.
              </p>
            ) : (
              <>
                <p className="text-sm font-mono text-text-secondary font-medium">
                  No payment method on file
                </p>
                <p className="text-sm font-mono text-text-muted leading-relaxed">
                  A card is added when you upgrade, or via the Billing Portal.
                </p>
              </>
            )}
          </div>

          {hasPaidSub && canManage ? (
            <button
              onClick={onPortal}
              disabled={portal.isPending}
              className="w-full inline-flex items-center justify-center gap-1.5 font-mono font-bold text-sm py-2.5 rounded-lg border border-brand-border hover:border-brand-accent hover:text-brand-accent text-text-secondary transition-all disabled:opacity-50"
            >
              {portal.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Opening…
                </>
              ) : (
                <>
                  <CreditCard className="w-3.5 h-3.5" /> Manage in Portal
                </>
              )}
            </button>
          ) : (
            <button
              disabled
              className="w-full inline-flex items-center justify-center gap-1.5 border border-brand-border text-text-muted font-mono font-bold text-sm py-2.5 rounded-lg cursor-not-allowed opacity-50"
            >
              <CreditCard className="w-3.5 h-3.5" /> Add Payment Method
            </button>
          )}

          <p className="text-sm font-mono text-text-muted text-center">
            Payments processed securely via Stripe. Card details never touch
            Wriven servers.
          </p>
        </div>

        {/* Invoice history */}
        <div className="lg:col-span-7 bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
          <span className="text-sm font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold">
            Invoice History
          </span>
          {invoicesQuery.isLoading ? (
            <InvoiceRows />
          ) : invoices.length === 0 ? (
            <div className="text-center py-6 font-mono text-sm text-text-muted">
              No invoices yet.
            </div>
          ) : (
            <>
              <div className="divide-y divide-brand-border" id="invoice-list">
                {pagedInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-mono font-bold text-text-primary truncate">
                        {inv.description ?? `Invoice ${inv.number ?? inv.id}`}
                      </p>
                      <p className="text-sm font-mono text-text-muted">
                        {inv.number ?? '—'} · {inv.createdAt.slice(0, 10)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-mono font-bold text-text-primary">
                        {formatMoney(inv.amountPaid, inv.currency)}
                      </span>
                      <span
                        className={`text-xs font-bold font-mono uppercase px-1.5 py-0.5 rounded border ${invoiceStatusClass(
                          inv.status,
                        )}`}
                      >
                        {inv.status}
                      </span>
                      {inv.url ? (
                        <a
                          href={inv.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View / download invoice"
                          className="p-1.5 border border-brand-border hover:bg-brand-surface-soft text-text-muted hover:text-primary rounded cursor-pointer transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="p-1.5 text-text-muted opacity-30">
                          <Download className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {invoiceTotalPages > 1 && (
                <Pagination
                  currentPage={safeInvoicePage}
                  totalPages={invoiceTotalPages}
                  onPageChange={setInvoicePage}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Plan-change flow: confirm → updating → success. */}
      <ConfirmationDialog
        open={step === 'confirm' && !!confirm}
        onOpenChange={(o) => {
          if (!o) {
            setStep('idle');
            setPending(null);
          }
        }}
        title={confirm?.title ?? ''}
        description={confirm?.description}
        confirmLabel={confirm?.confirmLabel}
        variant={confirm?.variant ?? 'accent'}
        loading={checkout.isPending}
        lockWhileLoading
        onConfirm={handleConfirm}
      />

      {/* Updating overlay — locked while the swap/checkout is in flight. */}
      <Dialog
        open={step === 'updating'}
        onOpenChange={() => {
          /* locked: dismissal blocked while the update is in flight */
        }}
      >
        <DialogContent showCloseButton={false} className="font-mono">
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <Loader2 className="size-7 animate-spin text-brand-accent" />
            <DialogTitle className="font-display text-sm font-bold tracking-tight text-text-primary">
              Updating your plan
            </DialogTitle>
            <DialogDescription className="font-light text-text-secondary">
              Securely processing the change with Stripe…
            </DialogDescription>
          </div>
        </DialogContent>
      </Dialog>

      <SuccessModal
        open={step === 'success'}
        onOpenChange={(o) => {
          if (!o) {
            setStep('idle');
            setPending(null);
            setSuccessCtx(null);
          }
        }}
        title={successCtx?.title ?? ''}
        description={successCtx?.description}
        actionLabel="Done"
      />

      {/* Downgrade blocked by over-limit resources (eager preview or server guard). */}
      <BlockedDowngradeDialog
        open={!!blocked}
        targetPlanName={blocked?.planName ?? ''}
        blocks={blocked?.blocks ?? []}
        onOpenChange={(o) => {
          if (!o) setBlocked(null);
        }}
      />
    </div>
  );
}

// ── sub-components ──────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-text-muted">{label}</span>
      <strong className="text-text-primary capitalize">{value}</strong>
    </div>
  );
}

/** Shared CTA button class by intent: accent (upgrade/reactivate), secondary
 *  (downgrade / cycle switch), disabled (current / no-op). */
function ctaClass(variant: 'accent' | 'secondary' | 'disabled'): string {
  const base =
    'w-full inline-flex items-center justify-center gap-1.5 font-mono font-bold text-xs py-2.5 rounded-lg border transition-all';
  if (variant === 'accent')
    return `${base} bg-brand-accent hover:bg-brand-accent-hover text-white border-brand-border-button neo-shadow cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`;
  if (variant === 'secondary')
    return `${base} border-brand-accent text-brand-accent hover:bg-brand-accent hover:text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`;
  return `${base} text-text-muted bg-brand-surface-soft border-brand-border cursor-not-allowed`;
}

/** Confirm-dialog copy for each plan-change kind. */
function confirmContent(
  kind: PlanActionKind,
  plan: PlanView,
  cycle: BillingCycle,
): {
  title: string;
  description: string;
  confirmLabel: string;
  variant: ConfirmVariant;
} {
  const cycleWord = cycle === 'yearly' ? 'annual' : 'monthly';
  switch (kind) {
    case 'upgrade':
      return {
        title: `Upgrade to ${plan.name}?`,
        description:
          'Your plan upgrades immediately and the prorated difference is charged to your card now.',
        confirmLabel: 'Upgrade',
        variant: 'accent',
      };
    case 'downgrade':
      return {
        title: `Downgrade to ${plan.name}?`,
        description:
          'Your plan changes at the end of your current billing period — you keep paid access until then.',
        confirmLabel: 'Downgrade',
        variant: 'neutral',
      };
    case 'cycle-switch':
      return {
        title: `Switch to ${cycleWord} billing?`,
        description:
          'Your billing cycle changes immediately; the prorated difference is charged or credited now.',
        confirmLabel: 'Switch',
        variant: 'accent',
      };
    case 'reactivate':
      return {
        title: `Reactivate ${plan.name}?`,
        description:
          'The scheduled cancellation will be cancelled and your subscription continues as normal.',
        confirmLabel: 'Reactivate',
        variant: 'accent',
      };
    case 'cancel':
      return {
        title: 'Downgrade to Free?',
        description:
          'Your subscription will cancel at the end of the current billing period. You keep access until then.',
        confirmLabel: 'Cancel plan',
        variant: 'danger',
      };
    case 'cancel-downgrade':
      return {
        title: 'Cancel the scheduled downgrade?',
        description: `You'll stay on ${plan.name} and the scheduled change will be removed.`,
        confirmLabel: 'Cancel downgrade',
        variant: 'accent',
      };
  }
}

/** Success-modal copy for each plan-change kind. */
function successContent(
  kind: PlanActionKind,
  plan: PlanView,
  cycle: BillingCycle,
): { title: string; description: string } {
  const cycleWord = cycle === 'yearly' ? 'annual' : 'monthly';
  switch (kind) {
    case 'upgrade':
      return {
        title: 'Plan upgraded',
        description: `You're now on ${plan.name}. The prorated difference was charged to your card.`,
      };
    case 'downgrade':
      return {
        title: 'Downgrade scheduled',
        description: `Your switch to ${plan.name} takes effect at the end of your current billing period.`,
      };
    case 'cycle-switch':
      return {
        title: 'Billing cycle updated',
        description: `You're now billed ${cycleWord}.`,
      };
    case 'reactivate':
      return {
        title: 'Subscription reactivated',
        description: 'The scheduled cancellation was cancelled.',
      };
    case 'cancel':
      return {
        title: 'Cancellation scheduled',
        description:
          'Your subscription will end at the close of the current billing period.',
      };
    case 'cancel-downgrade':
      return {
        title: 'Downgrade cancelled',
        description: `You're staying on ${plan.name}.`,
      };
  }
}

function PlanCta({
  plan,
  isCurrent,
  currentSortOrder,
  subCycle,
  selectedCycle,
  cancelAtPeriodEnd,
  pendingDowngrade,
  hasPaidSub,
  canManage,
  checkoutBusy,
  swapBusy,
  onSelect,
}: {
  plan: PlanView;
  isCurrent: boolean;
  currentSortOrder: number;
  subCycle: BillingCycle | null;
  selectedCycle: BillingCycle;
  cancelAtPeriodEnd: boolean;
  pendingDowngrade: PendingDowngrade | null;
  hasPaidSub: boolean;
  canManage: boolean;
  checkoutBusy: boolean;
  swapBusy: boolean;
  onSelect: (plan: PlanView, cycle: BillingCycle, kind: PlanActionKind) => void;
}) {
  // The card for the plan the workspace currently subscribes to.
  if (isCurrent) {
    // A cancellation is already scheduled → offer to reactivate (clears it).
    if (cancelAtPeriodEnd) {
      return (
        <button
          onClick={() =>
            onSelect(plan, subCycle ?? selectedCycle, 'reactivate')
          }
          disabled={!canManage || swapBusy}
          className={ctaClass('accent')}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${swapBusy ? 'animate-spin' : ''}`}
          />{' '}
          Reactivate
        </button>
      );
    }
    // A downgrade is scheduled → offer to cancel it (release the schedule).
    if (pendingDowngrade) {
      return (
        <button
          onClick={() =>
            onSelect(plan, subCycle ?? selectedCycle, 'cancel-downgrade')
          }
          disabled={!canManage || swapBusy}
          className={ctaClass('accent')}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${swapBusy ? 'animate-spin' : ''}`}
          />{' '}
          Cancel downgrade
        </button>
      );
    }
    // Same plan, but the selected billing cycle differs from the live one → switch.
    if (subCycle && subCycle !== selectedCycle) {
      return (
        <button
          onClick={() => onSelect(plan, selectedCycle, 'cycle-switch')}
          disabled={!canManage || swapBusy}
          className={ctaClass('secondary')}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${swapBusy ? 'animate-spin' : ''}`}
          />{' '}
          {`Switch to ${selectedCycle === 'yearly' ? 'Annual' : 'Monthly'}`}
        </button>
      );
    }
    // Current plan + matching cycle → no action available.
    return (
      <button disabled className={ctaClass('disabled')}>
        Current Plan
      </button>
    );
  }

  // Downgrade to free = schedule cancellation at period end.
  if (plan.key === 'free') {
    if (cancelAtPeriodEnd) {
      return (
        <button disabled className={ctaClass('disabled')}>
          Cancellation scheduled
        </button>
      );
    }
    return (
      <button
        onClick={() => onSelect(plan, subCycle ?? selectedCycle, 'cancel')}
        disabled={!canManage || swapBusy}
        className={ctaClass('secondary')}
      >
        <RefreshCw
          className={`w-3.5 h-3.5 ${swapBusy ? 'animate-spin' : ''}`}
        />{' '}
        <ArrowDownRight className="w-3.5 h-3.5" /> Downgrade to Free
      </button>
    );
  }

  // This card is the target of a scheduled (deferred) downgrade → no action
  // available until it lands at period end.
  if (pendingDowngrade?.planKey === plan.key) {
    return (
      <button disabled className={ctaClass('disabled')}>
        Scheduled ·{' '}
        {new Date(pendingDowngrade.effectiveAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })}
      </button>
    );
  }

  // Paid plan, not current: upgrade (higher tier) or downgrade (lower tier).
  // Routing (Checkout vs swap) happens in the parent by `hasPaidSub`.
  const isUpgrade = plan.sortOrder > currentSortOrder;
  const busy = !hasPaidSub ? checkoutBusy : swapBusy;
  return (
    <button
      onClick={() =>
        onSelect(plan, selectedCycle, isUpgrade ? 'upgrade' : 'downgrade')
      }
      disabled={!canManage || busy}
      className={ctaClass(isUpgrade ? 'accent' : 'secondary')}
    >
      {busy ? (
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
      ) : isUpgrade ? (
        <ArrowUpRight className="w-3.5 h-3.5" />
      ) : (
        <ArrowDownRight className="w-3.5 h-3.5" />
      )}{' '}
      {isUpgrade ? `Upgrade to ${plan.name}` : `Downgrade to ${plan.name}`}
    </button>
  );
}
