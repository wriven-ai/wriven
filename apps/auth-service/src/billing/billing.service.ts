import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@wriven/database';
import type Stripe from 'stripe';
import type {
  BillingCycle,
  CheckoutSessionView,
  InvoiceStatus,
  InvoiceView,
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
    currency: p.currency,
    trialDays: p.trialDays,
    limits: (p.limits ?? {}) as PlanLimits,
    features: (p.features ?? {}) as PlanFeatures,
  };
}

/**
 * Customer-facing billing: plan catalog, current subscription, Checkout +
 * Billing Portal session creation. Reconciliation of Stripe → `subscriptions`
 * happens in {@link StripeWebhookService}; this service only reads/writes the
 * row to create/look up the Stripe Customer and start sessions. See specs/08.
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

    // Reject if a live PAID subscription already exists (active / trialing /
    // past-due within grace) — a second Checkout would create a second Stripe
    // subscription and double-charge. Plan changes go through the Portal. Note the
    // free row always exists with status='active' but a NULL stripe_subscription_id,
    // so the gate is the Stripe sub id, not the row status. A `canceled` paid row
    // (stripe_subscription_id still set) is reusable — syncSubscription's sub-id
    // guard overwrites it on the next checkout.session.completed.
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
        // Managed Payments is Stripe's 2025+ default (merchant-of-record + Stripe Tax).
        // It requires products to carry a tax_code and the Checkout page to init against
        // a fully-configured account — a sandbox without Stripe Tax provisioned fails
        // ("product tax code missing" at create / "apiKey is not set" on the page).
        // Default to classic Checkout (no tax_code needed); flip to Managed Payments via
        // STRIPE_MANAGED_PAYMENTS=true once Stripe Tax + product tax_codes are set up.
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
        // Per workspace+plan+cycle+day: dedupes double-clicks within a day but
        // allows a fresh session tomorrow (a permanent key would return a stale
        // session on legitimate retry).
        idempotencyKey: `checkout:${input.workspaceId}:${plan.key}:${input.billingCycle}:${new Date().toISOString().slice(0, 10)}`,
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
   * Resolve a client-supplied redirect URL to a same-origin absolute URL, falling
   * back to the app default otherwise. Prevents open-redirect abuse via
   * `success_url` / `cancel_url` / portal `return_url`: a cross-origin or
   * malformed value never reaches Stripe. `fallback` is a path resolved against
   * `APP_URL` (or an absolute URL when APP_URL is unset).
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
        if (parsed.origin !== app.origin) return defaultUrl;
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
