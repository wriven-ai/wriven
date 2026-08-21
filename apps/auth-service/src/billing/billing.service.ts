import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@wriven/database';
import type Stripe from 'stripe';
import type {
  BillingCycle,
  CheckoutSessionView,
  InvoiceStatus,
  InvoiceView,
  PendingDowngrade,
  PlanFeatures,
  PlanLimits,
  PlanView,
  PortalSessionView,
  SubscriptionStatus,
  SubscriptionView,
} from '@wriven/contracts';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';
import { STRIPE_CLIENT } from './stripe-client.provider';

const { plans, subscriptions, users } = schema;

const toIso = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null;

/**
 * Map the `pending_change` jsonb row value (includes the internal `scheduleId`)
 * to the tenant-facing {@link PendingDowngrade} view (which omits it). Returns
 * null for a missing/malformed row so a bad payload never surfaces to the UI.
 */
function toPendingDowngrade(raw: unknown): PendingDowngrade | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (
    typeof p.planKey !== 'string' ||
    typeof p.planName !== 'string' ||
    (p.billingCycle !== 'monthly' && p.billingCycle !== 'yearly') ||
    typeof p.effectiveAt !== 'string'
  ) {
    return null;
  }
  return {
    planKey: p.planKey,
    planName: p.planName,
    billingCycle: p.billingCycle,
    effectiveAt: p.effectiveAt,
  };
}

function toPlanView(p: typeof plans.$inferSelect): PlanView {
  return {
    id: p.id,
    key: p.key,
    name: p.name,
    description: p.description,
    sortOrder: p.sortOrder,
    isPublic: p.isPublic,
    active: p.active,
    priceMonthly: p.priceMonthly,
    priceYearly: p.priceYearly,
    yearlyDiscountPercent: p.yearlyDiscountPercent,
    yearlyDiscountAmount: p.yearlyDiscountAmount,
    currency: p.currency,
    trialDays: p.trialDays,
    limits: (p.limits ?? {}) as PlanLimits,
    features: (p.features ?? {}) as PlanFeatures,
  };
}

/**
 * Customer-facing billing: plan catalog, current subscription, Checkout +
 * Billing Portal sessions. Stripe → `subscriptions` reconciliation lives in
 * {@link StripeWebhookService}; this service only reads/writes the row to
 * create the Stripe Customer and start sessions.
 */
@Injectable()
export class BillingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
  ) {}

  /** Public, active plans for the pricing/billing surface. */
  async listPlans(): Promise<PlanView[]> {
    const rows = await this.db.query.plans.findMany({
      where: and(eq(plans.active, true), eq(plans.isPublic, true)),
      orderBy: (plans, { asc }) => [asc(plans.sortOrder)],
    });
    return rows.map(toPlanView);
  }

  /** Current subscription for a workspace (always exists — defaults to free). */
  async getSubscription(workspaceId: string): Promise<SubscriptionView> {
    const sub = await this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.workspaceId, workspaceId),
      with: { plan: { columns: { key: true, name: true } } },
    });
    const active = sub?.status === 'active' || sub?.status === 'trialing';
    return {
      planKey: sub?.plan.key ?? 'free',
      planName: sub?.plan.name ?? 'Free',
      status: (sub?.status ?? 'active') as SubscriptionStatus,
      billingCycle: (sub?.billingCycle as BillingCycle | null) ?? null,
      currentPeriodStart: toIso(sub?.currentPeriodStart ?? null),
      currentPeriodEnd: toIso(sub?.currentPeriodEnd ?? null),
      trialEndsAt: toIso(sub?.trialEndsAt ?? null),
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      pendingDowngrade: toPendingDowngrade(sub?.pendingChange),
      hasPaymentMethod: !!sub?.stripeCustomerId && active,
    };
  }

  /** Last Stripe invoices for the workspace's customer (link-out only). */
  async listInvoices(workspaceId: string): Promise<InvoiceView[]> {
    const sub = await this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.workspaceId, workspaceId),
      columns: { stripeCustomerId: true },
    });
    if (!sub?.stripeCustomerId) return [];
    const invoices = await this.stripe.invoices.list({
      customer: sub.stripeCustomerId,
      limit: 20,
    });
    return invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      amountPaid: inv.amount_paid,
      currency: inv.currency,
      status: (inv.status ?? 'open') as InvoiceStatus,
      createdAt: new Date(inv.created * 1000).toISOString(),
      description: inv.description,
      url: inv.hosted_invoice_url ?? null,
    }));
  }

  /** Create a Stripe Checkout Session for the free → paid transition only.
   *  Changing an existing paid plan must go through the Billing Portal (proration)
   *  — a second Checkout would create a second subscription and double-charge. */
  async createCheckout(input: {
    workspaceId: string;
    userId: string;
    planKey: string;
    billingCycle: BillingCycle;
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<CheckoutSessionView> {
    const plan = await this.db.query.plans.findFirst({
      where: eq(plans.key, input.planKey),
    });
    if (!plan || !plan.active) {
      throw rpcError('NOT_FOUND', `Plan "${input.planKey}" not found.`);
    }
    const priceId =
      input.billingCycle === 'yearly'
        ? plan.stripePriceIdYearly
        : plan.stripePriceIdMonthly;
    if (!priceId) {
      throw rpcError(
        'INTERNAL_ERROR',
        `Plan "${input.planKey}" is not linked to a Stripe price (${input.billingCycle}). Run the billing setup.`,
      );
    }

    // Gate on the Stripe sub id, not the row status: the free row always
    // exists with status='active' but a NULL stripe_subscription_id. A
    // `canceled` paid row is reusable — syncSubscription overwrites its sub id
    // on the next checkout.session.completed. Anything else live would
    // double-charge; plan changes go through the Portal.
    const existing = await this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.workspaceId, input.workspaceId),
      columns: { status: true, stripeSubscriptionId: true },
    });
    if (existing?.stripeSubscriptionId && existing.status !== 'canceled') {
      throw rpcError(
        'SUBSCRIPTION_EXISTS',
        'This workspace already has an active subscription. Use the Billing Portal to change plans.',
      );
    }

    const customerId = await this.ensureCustomer(
      input.workspaceId,
      input.userId,
    );

    const successUrl = BillingService.safeUrl(
      input.successUrl,
      '/billing?checkout=success',
    );
    const cancelUrl = BillingService.safeUrl(
      input.cancelUrl,
      '/billing?checkout=cancelled',
    );
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: input.workspaceId,
        // Managed Payments (Stripe's 2025+ default, merchant-of-record + Tax)
        // needs product tax_codes and a fully-configured account — a sandbox
        // without Stripe Tax provisioned fails ("product tax code missing").
        // Classic Checkout by default; opt in via STRIPE_MANAGED_PAYMENTS=true.
        ...(process.env.STRIPE_MANAGED_PAYMENTS === 'true'
          ? {}
          : { managed_payments: { enabled: false } }),
        subscription_data: {
          metadata: {
            workspaceId: input.workspaceId,
            planKey: plan.key,
            billingCycle: input.billingCycle,
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
      {
        // Per workspace+customer+plan+cycle+day: dedupes double-clicks within a
        // day, allows a fresh session tomorrow. The customer is in the key so a
        // replay never carries changed params (Stripe rejects key reuse with
        // different params — e.g. after a new Stripe customer is created).
        idempotencyKey: `checkout:${input.workspaceId}:${customerId}:${plan.key}:${input.billingCycle}:${new Date().toISOString().slice(0, 10)}`,
      },
    );
    return { url: session.url as string, sessionId: session.id };
  }

  /** Create a Stripe Billing Portal session (manage card / upgrade / cancel). */
  async createPortal(input: {
    workspaceId: string;
    returnUrl?: string;
  }): Promise<PortalSessionView> {
    const sub = await this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.workspaceId, input.workspaceId),
      columns: { stripeCustomerId: true },
    });
    if (!sub?.stripeCustomerId) {
      throw rpcError(
        'NOT_FOUND',
        'This workspace has no billing account yet.',
      );
    }
    const session = await this.stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: BillingService.safeUrl(input.returnUrl, '/billing'),
    });
    return { url: session.url };
  }

  /**
   * Change an existing paid subscription's plan/cycle, or cancel down to free.
   *  - Upgrade / cycle switch → immediate prorated invoice (`always_invoice`),
   *    mirrored onto the row now; the webhook reconciler confirms later.
   *  - Downgrade (lower tier) → deferred via a 2-phase Subscription Schedule:
   *    current price until period end, lower price at renewal
   *    (`proration_behavior: 'none'`). Pending target stored on
   *    `pending_change`, cleared when phase 2 lands.
   *  - Downgrade to free → `cancel_at_period_end` (access until period end).
   *  - Reactivation (same plan + cycle) → release schedule + clear pending.
   *  Any non-reactivation change first releases a pending schedule — a
   *  scheduled sub rejects direct `subscriptions.update`.
   */
  async swapPlan(input: {
    workspaceId: string;
    planKey: string;
    billingCycle: BillingCycle;
  }): Promise<SubscriptionView> {
    const current = await this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.workspaceId, input.workspaceId),
      columns: {
        id: true,
        status: true,
        stripeSubscriptionId: true,
        cancelAtPeriodEnd: true,
        pendingChange: true,
        billingCycle: true,
      },
      with: { plan: { columns: { key: true, sortOrder: true } } },
    });
    if (!current?.stripeSubscriptionId || current.status === 'canceled') {
      throw rpcError(
        'SUBSCRIPTION_NOT_FOUND',
        'This workspace has no active subscription to change. Subscribe first.',
      );
    }

    const target = await this.db.query.plans.findFirst({
      where: eq(plans.key, input.planKey),
    });
    if (!target || !target.active) {
      throw rpcError('NOT_FOUND', `Plan "${input.planKey}" not found.`);
    }

    const pending = (current.pendingChange ?? null) as {
      scheduleId?: string;
    } | null;

    // Reactivation: same plan AND cycle — clear whatever is pending (a
    // scheduled downgrade and/or a cancel-at-period-end). A same-plan cycle
    // change (monthly↔yearly) must NOT short-circuit here; it falls through
    // to the prorated price update below.
    if (
      input.planKey === current.plan?.key &&
      input.billingCycle === current.billingCycle
    ) {
      if (pending?.scheduleId) {
        await this.stripe.subscriptionSchedules.release(pending.scheduleId);
      }
      if (current.cancelAtPeriodEnd) {
        await this.stripe.subscriptions.update(current.stripeSubscriptionId, {
          cancel_at_period_end: false,
        });
      }
      if (pending?.scheduleId || current.cancelAtPeriodEnd) {
        await this.db
          .update(subscriptions)
          .set({
            ...(pending?.scheduleId ? { pendingChange: null } : {}),
            ...(current.cancelAtPeriodEnd ? { cancelAtPeriodEnd: false } : {}),
          })
          .where(eq(subscriptions.id, current.id));
      }
      return this.getSubscription(input.workspaceId);
    }

    if (pending?.scheduleId) {
      await this.stripe.subscriptionSchedules.release(pending.scheduleId);
      await this.clearPendingChange(current.id);
    }

    // Mirror the flag onto the row so the card flips to "Canceling" immediately.
    if (input.planKey === 'free') {
      await this.stripe.subscriptions.update(current.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      await this.db
        .update(subscriptions)
        .set({ cancelAtPeriodEnd: true })
        .where(eq(subscriptions.id, current.id));
      return this.getSubscription(input.workspaceId);
    }

    const priceId =
      input.billingCycle === 'yearly'
        ? target.stripePriceIdYearly
        : target.stripePriceIdMonthly;
    if (!priceId) {
      throw rpcError(
        'INTERNAL_ERROR',
        `Plan "${input.planKey}" is not linked to a Stripe price (${input.billingCycle}). Run the billing setup.`,
      );
    }

    const stripeSub = await this.stripe.subscriptions.retrieve(
      current.stripeSubscriptionId,
    );
    const item = stripeSub.items.data[0];
    const currentPriceId = item?.price?.id;
    // current_period_end lives on the SubscriptionItem in stripe@22 — the
    // top-level Subscription field was removed. (See StripeWebhookService.
    // syncSubscription for the same item-level read.)
    const periodEnd = item?.current_period_end;
    if (!item?.id || !currentPriceId || !periodEnd) {
      throw rpcError(
        'INTERNAL_ERROR',
        'Subscription is missing its line item, price, or billing period.',
      );
    }

    const tierDelta = target.sortOrder - (current.plan?.sortOrder ?? 0);

    // Deferred to period end — paid access continues until phase 2 lands.
    if (tierDelta < 0) {
      const schedule = await this.stripe.subscriptionSchedules.create({
        from_subscription: current.stripeSubscriptionId,
        phases: [
          // stripe@22 moved proration_behavior onto each phase. 'none' on the
          // holding phase suppresses proration when the schedule takes over —
          // the price is unchanged here, so belt-and-suspenders.
          {
            items: [{ price: currentPriceId }],
            proration_behavior: 'none',
            end_date: periodEnd,
          },
          { items: [{ price: priceId }] },
        ],
      });
      await this.db
        .update(subscriptions)
        .set({
          pendingChange: {
            planKey: target.key,
            planName: target.name,
            billingCycle: input.billingCycle,
            effectiveAt: new Date(periodEnd * 1000).toISOString(),
            scheduleId: schedule.id,
          },
        })
        .where(eq(subscriptions.id, current.id));
      return this.getSubscription(input.workspaceId);
    }

    // Mirror the row now so cards/entitlements flip without waiting on webhook
    // delivery.
    await this.stripe.subscriptions.update(current.stripeSubscriptionId, {
      items: [{ id: item.id, price: priceId }],
      proration_behavior: 'always_invoice',
      cancel_at_period_end: false, // clear any prior scheduled cancellation
      metadata: {
        workspaceId: input.workspaceId,
        planKey: target.key,
        billingCycle: input.billingCycle,
      },
    });
    await this.db
      .update(subscriptions)
      .set({
        planId: target.id,
        billingCycle: input.billingCycle,
        cancelAtPeriodEnd: false,
      })
      .where(eq(subscriptions.id, current.id));

    return this.getSubscription(input.workspaceId);
  }

  /** Clear the `pending_change` hint on a subscription row (after a schedule
   *  release or a phase-2 flip). */
  private async clearPendingChange(id: string): Promise<void> {
    await this.db
      .update(subscriptions)
      .set({ pendingChange: null })
      .where(eq(subscriptions.id, id));
  }

  /**
   * Resolve a client-supplied redirect URL to a same-origin absolute URL,
   * else the app default. Prevents open-redirect abuse via success/cancel/
   * return URLs — a cross-origin or malformed value never reaches Stripe.
   */
  private static safeUrl(candidate: string | undefined, fallback: string): string {
    const appUrl = process.env.APP_URL;
    const defaultUrl = appUrl
      ? new URL(fallback, appUrl).toString()
      : `http://localhost:3000${fallback}`;
    if (!candidate) return defaultUrl;
    try {
      const parsed = new URL(candidate);
      // Allow only the app's own origin (cross-origin rejected). http/https only
      // (new URL rejects javascript:/data: schemes, but be explicit).
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return defaultUrl;
      }
      if (appUrl) {
        const app = new URL(appUrl);
        const candidateHost = parsed.hostname.replace(/^www\./, '');
        const appHost = app.hostname.replace(/^www\./, '');
        const matchesDomain =
          candidateHost === appHost ||
          candidateHost.endsWith(`.${appHost}`) ||
          parsed.hostname.endsWith('.vercel.app');
        if (!matchesDomain) return defaultUrl;
      }
      return parsed.toString();
    } catch {
      return defaultUrl;
    }
  }

  /**
   * Ensure a Stripe Customer exists for the workspace, creating + persisting its
   * id on first call. Subsequent calls reuse the stored `stripe_customer_id`.
   */
  private async ensureCustomer(
    workspaceId: string,
    userId: string,
  ): Promise<string> {
    const existing = await this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.workspaceId, workspaceId),
      columns: { id: true, stripeCustomerId: true },
    });
    if (existing?.stripeCustomerId) return existing.stripeCustomerId;

    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { email: true, name: true },
    });
    const customer = await this.stripe.customers.create(
      {
        email: user?.email,
        name: user?.name ?? undefined,
        metadata: { workspaceId },
      },
      { idempotencyKey: `customer:${workspaceId}` },
    );

    if (existing) {
      await this.db
        .update(subscriptions)
        .set({ stripeCustomerId: customer.id })
        .where(eq(subscriptions.id, existing.id));
    }
    return customer.id;
  }

  /** Map a Stripe price id → plan (used by the webhook reconciler). */
  async findPlanByPriceId(
    priceId: string,
  ): Promise<typeof plans.$inferSelect | null> {
    const plan = await this.db.query.plans.findFirst({
      where: or(
        eq(plans.stripePriceIdMonthly, priceId),
        eq(plans.stripePriceIdYearly, priceId),
      ),
    });
    return plan ?? null;
  }
}
