'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  AlertCircle,
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
  KeyRound,
  Layers,
  LifeBuoy,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';
import { useCurrentWorkspace } from '@/hooks/use-current-workspace';
import {
  useCheckout,
  useInvoices,
  usePortal,
  usePlans,
  useSubscription,
  useRefreshSubscription,
} from '@/hooks/use-billing';
import { ApiRequestError } from '@/lib/api';
import type { BillingCycle, PlanView } from '@/lib/types';

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
  if (mb >= 1000) return `${mb / 1000} TB storage`;
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
    f.sso ? 'SSO / SAML' : null,
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
  { match: 'sso', Icon: KeyRound },
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

  const workspace = useCurrentWorkspace();
  const canManage =
    workspace?.role === 'owner' || workspace?.role === 'admin';

  const plansQuery = usePlans();
  const subQuery = useSubscription();
  const invoicesQuery = useInvoices();
  const refreshSubscription = useRefreshSubscription();

  const checkout = useCheckout();
  const portal = usePortal();

  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [notice, setNotice] = useState<
    { type: 'success' | 'info' | 'error'; msg: string } | null
  >(null);

  const subscription = subQuery.data;
  const hasPaidSub = !!subscription && subscription.planKey !== 'free';
  const currentPlanKey = subscription?.planKey ?? 'free';
  const invoices = invoicesQuery.data ?? [];

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
      setNotice({
        type: 'success',
        msg: 'Payment received — your plan is updating.',
      });
      refreshSubscription();
      router.replace(billingPath);
    } else if (checkoutParam === 'cancelled') {
      setNotice({ type: 'info', msg: 'Checkout cancelled.' });
      router.replace(billingPath);
    }
  }, [checkoutParam]);

  // Surface checkout errors (e.g. SUBSCRIPTION_EXISTS → use the Portal instead).
  useEffect(() => {
    if (checkout.isError && checkout.error instanceof ApiRequestError) {
      if (checkout.error.error.code === 'SUBSCRIPTION_EXISTS') {
        setNotice({
          type: 'info',
          msg: 'This workspace already has a subscription — manage it in the Billing Portal.',
        });
      } else {
        setNotice({ type: 'error', msg: checkout.error.error.message });
      }
    }
  }, [checkout.isError, checkout.error]);

  const plans = useMemo(
    () =>
      (plansQuery.data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [plansQuery.data],
  );

  const onUpgrade = (plan: PlanView) => {
    if (plan.key === 'free') return;
    setNotice(null);
    checkout.mutate({
      planKey: plan.key as 'pro' | 'business',
      billingCycle: cycle,
      successUrl,
      cancelUrl,
    });
  };

  const onPortal = () => {
    setNotice(null);
    portal.mutate({ returnUrl: `${origin}${billingPath}` });
  };

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
          <p className="text-2xs sm:text-xs font-mono text-text-muted mt-1 leading-relaxed">
            {"// Manage your plan, payment method, and Stripe billing"}
          </p>
        </div>
        {subscription && (
          <span
            className={`text-[10px] font-mono font-bold uppercase tracking-wider border px-3 py-1.5 rounded-lg ${statusBadgeClass(
              subscription.status,
            )}`}
          >
            {subscription.planName} · {subscription.status}
          </span>
        )}
      </div>

      {/* Notice (success / cancel / error) */}
      {notice && (
        <div
          className={`flex items-start gap-2 rounded-xl border p-4 text-2xs font-mono ${
            notice.type === 'success'
              ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600'
              : notice.type === 'error'
                ? 'bg-red-500/5 border-red-500/20 text-red-600'
                : 'bg-brand-surface border-brand-border text-text-secondary'
          }`}
        >
          {notice.type === 'error' ? (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <Check className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <span>{notice.msg}</span>
        </div>
      )}

      {!canManage && (
        <div className="flex items-center gap-2 rounded-xl border border-brand-border bg-brand-surface p-4 text-2xs font-mono text-text-muted">
          <ShieldCheck className="w-4 h-4 text-brand-secondary shrink-0" />
          Only workspace owners or admins can change the plan. Ask an admin to
          upgrade.
        </div>
      )}

      {/* Plans + summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Plan cards */}
        <div className="lg:col-span-8 space-y-5" id="plan-cards">
          <span className="block text-center text-[11px] font-mono tracking-wider text-text-secondary font-bold">
            Available Plans
          </span>

          {/* Monthly / yearly toggle — centered above the cards */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-brand-border bg-brand-surface-soft">
              {(['monthly', 'yearly'] as BillingCycle[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCycle(c)}
                  className={`px-5 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
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
            {plans.map((plan) => {
              const isCurrent = plan.key === currentPlanKey;
              const highlight = plan.key === 'pro';
              const price =
                cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
              return (
                <div
                  key={plan.id}
                  className={`relative bg-brand-surface rounded-xl p-5 shadow-xs flex flex-col gap-4 transition-all ${
                    highlight
                      ? 'border-2 border-brand-accent'
                      : 'border border-brand-border'
                  }`}
                  id={`plan-card-${plan.key}`}
                >
                  {highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="text-[9px] font-mono font-black uppercase tracking-widest bg-brand-accent text-white px-3 py-1 rounded-full">
                        Most Popular
                      </span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display font-bold text-base text-text-primary tracking-tight">
                        {plan.name}
                      </h3>
                      {isCurrent && (
                        <span className="text-[8px] font-bold font-mono uppercase bg-brand-surface-soft border border-brand-border text-text-secondary px-1.5 py-0.5 rounded">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-0.5">
                      <span className="font-display font-black text-2xl text-text-primary">
                        {formatPrice(price, plan.currency)}
                      </span>
                      <span className="text-2xs font-mono text-text-muted">
                        /{cycle === 'yearly' ? 'yr' : 'mo'}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-text-secondary font-light leading-relaxed">
                      {plan.description}
                    </p>
                  </div>

                  <ul className="space-y-2 flex-grow">
                    {planFeatures(plan).map((feature, i) => {
                      const Icon = featureIcon(feature);
                      return (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-2xs font-mono text-text-secondary"
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
                    hasPaidSub={hasPaidSub}
                    canManage={canManage}
                    upgradeBusy={
                      checkout.isPending &&
                      checkout.variables?.planKey === plan.key
                    }
                    portalBusy={portal.isPending}
                    onUpgrade={() => onUpgrade(plan)}
                    onPortal={onPortal}
                  />
                </div>
              );
            })}
          </div>

          {plans.length === 0 && !plansQuery.isLoading && (
            <div className="text-center py-6 font-mono text-2xs text-text-muted">
              No plans available.
            </div>
          )}
          {plansQuery.isLoading && (
            <div className="text-center py-6 font-mono text-2xs text-text-muted">
              Loading plans…
            </div>
          )}
        </div>

        {/* Current billing summary */}
        <div className="lg:col-span-4 space-y-4 sticky top-6">
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 shadow-xs space-y-4">
            <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold">
              Billing Summary
            </span>

            {subQuery.isLoading ? (
              <div className="text-2xs font-mono text-text-muted">
                Loading…
              </div>
            ) : subscription ? (
              <div className="space-y-3 font-mono text-2xs">
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
                className="w-full inline-flex items-center justify-center gap-1.5 font-mono font-bold text-2xs py-2.5 rounded-lg border border-brand-border hover:border-brand-accent hover:text-brand-accent text-text-secondary transition-all disabled:opacity-50"
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

            <p className="text-[10px] font-mono text-text-muted text-center">
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
          <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold flex items-center gap-1.5">
            <CreditCard className="w-4 h-4 text-brand-secondary" /> Payment Method
          </span>

          <div className="bg-brand-surface-soft border border-brand-border rounded-xl p-4 text-center space-y-2">
            <CreditCard className="w-8 h-8 text-text-muted mx-auto" />
            {subscription?.hasPaymentMethod ? (
              <p className="text-2xs font-mono text-text-secondary font-medium">
                Card on file — manage it in the Billing Portal.
              </p>
            ) : (
              <>
                <p className="text-2xs font-mono text-text-secondary font-medium">
                  No payment method on file
                </p>
                <p className="text-[10px] font-mono text-text-muted leading-relaxed">
                  A card is added when you upgrade, or via the Billing Portal.
                </p>
              </>
            )}
          </div>

          {hasPaidSub && canManage ? (
            <button
              onClick={onPortal}
              disabled={portal.isPending}
              className="w-full inline-flex items-center justify-center gap-1.5 font-mono font-bold text-2xs py-2.5 rounded-lg border border-brand-border hover:border-brand-accent hover:text-brand-accent text-text-secondary transition-all disabled:opacity-50"
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
              className="w-full inline-flex items-center justify-center gap-1.5 border border-brand-border text-text-muted font-mono font-bold text-2xs py-2.5 rounded-lg cursor-not-allowed opacity-50"
            >
              <CreditCard className="w-3.5 h-3.5" /> Add Payment Method
            </button>
          )}

          <p className="text-[10px] font-mono text-text-muted text-center">
            Payments processed securely via Stripe. Card details never touch
            Wriven servers.
          </p>
        </div>

        {/* Invoice history */}
        <div className="lg:col-span-7 bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
          <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold">
            Invoice History
          </span>
          {invoicesQuery.isLoading ? (
            <div className="text-center py-6 font-mono text-2xs text-text-muted">
              Loading…
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-6 font-mono text-2xs text-text-muted">
              No invoices yet.
            </div>
          ) : (
            <div className="divide-y divide-brand-border" id="invoice-list">
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                >
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-2xs font-mono font-bold text-text-primary truncate">
                      {inv.description ?? `Invoice ${inv.number ?? inv.id}`}
                    </p>
                    <p className="text-[9.5px] font-mono text-text-muted">
                      {inv.number ?? '—'} · {inv.createdAt.slice(0, 10)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-2xs font-mono font-bold text-text-primary">
                      {formatMoney(inv.amountPaid, inv.currency)}
                    </span>
                    <span
                      className={`text-[8px] font-bold font-mono uppercase px-1.5 py-0.5 rounded border ${invoiceStatusClass(
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
                        className="p-1.5 border border-brand-border hover:bg-brand-surface-soft text-text-muted hover:text-text-primary rounded cursor-pointer transition-colors"
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
          )}
        </div>
      </div>
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

function PlanCta({
  plan,
  isCurrent,
  hasPaidSub,
  canManage,
  upgradeBusy,
  portalBusy,
  onUpgrade,
  onPortal,
}: {
  plan: PlanView;
  isCurrent: boolean;
  hasPaidSub: boolean;
  canManage: boolean;
  upgradeBusy: boolean;
  portalBusy: boolean;
  onUpgrade: () => void;
  onPortal: () => void;
}) {
  if (isCurrent) {
    return (
      <button
        disabled
        className="w-full inline-flex items-center justify-center gap-1.5 font-mono font-bold text-2xs py-2.5 rounded-lg border border-brand-border text-text-muted bg-brand-surface-soft cursor-not-allowed"
      >
        Current Plan
      </button>
    );
  }

  // Free plan isn't reachable via Checkout — downgrades/cancels go via the Portal.
  if (plan.key === 'free') {
    return hasPaidSub ? (
      <button
        onClick={onPortal}
        disabled={!canManage || portalBusy}
        className="w-full inline-flex items-center justify-center gap-1.5 font-mono font-bold text-2xs py-2.5 rounded-lg border border-brand-border text-text-secondary hover:border-brand-accent hover:text-brand-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {portalBusy ? 'Opening…' : 'Cancel in Portal'}
      </button>
    ) : (
      <div className="h-[38px]" />
    );
  }

  // Paid plan, not current: already subscribed → manage via Portal; else Upgrade.
  if (hasPaidSub) {
    return (
      <button
        onClick={onPortal}
        disabled={!canManage || portalBusy}
        className="w-full inline-flex items-center justify-center gap-1.5 font-mono font-bold text-2xs py-2.5 rounded-lg border border-brand-border text-text-secondary hover:border-brand-accent hover:text-brand-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {portalBusy ? 'Opening…' : 'Manage in Portal'}
      </button>
    );
  }

  return (
    <button
      onClick={onUpgrade}
      disabled={!canManage || upgradeBusy}
      className={`w-full inline-flex items-center justify-center gap-1.5 font-mono font-bold text-2xs py-2.5 rounded-lg border cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
        plan.key === 'pro'
          ? 'bg-brand-accent hover:bg-brand-accent-hover text-white border-brand-border-button neo-shadow'
          : 'border-brand-border hover:border-brand-accent hover:text-brand-accent text-text-secondary'
      }`}
    >
      {upgradeBusy ? (
        <>
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Processing…
        </>
      ) : (
        <>
          Upgrade <ArrowUpRight className="w-3.5 h-3.5" />
        </>
      )}
    </button>
  );
}

function BillingSkeleton() {
  return (
    <div className="space-y-8">
      <div className="h-8 w-64 bg-brand-surface rounded animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-72 bg-brand-surface border border-brand-border rounded-xl animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
