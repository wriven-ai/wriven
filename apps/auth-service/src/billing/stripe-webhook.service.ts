import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@wriven/database';
import type Stripe from 'stripe';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';
import { BillingService } from './billing.service';
import { STRIPE_CLIENT } from './stripe-client.provider';

const { stripeEvents, subscriptions } = schema;

/** A Drizzle transaction handle (same shape `db.transaction` callbacks receive). */
type Tx = Parameters<Parameters<DrizzleDB<typeof schema>['transaction']>[0]>[0];

/** Our `subscriptions.status` CHECK constraint allows only these values. */
const ALLOWED_STATUS = new Set([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'paused',
  'incomplete',
]);

/** Map a Stripe subscription status onto one our DB CHECK allows. */
function mapStatus(s: Stripe.Subscription.Status): string {
  if (s === 'incomplete_expired' || s === 'unpaid') return 'canceled';
  return ALLOWED_STATUS.has(s) ? s : 'incomplete';
}

/**
 * Verifies + reconciles Stripe events into the local `subscriptions` row — the
 * source of truth that {@link ../auth/entitlements.service} reads for quota
 * enforcement.
 *
 * v2 contract (see plans/02 v2): the idempotency insert and the state write are
 * ONE atomic transaction. If the write fails, the insert rolls back too, so
 * Stripe's retry (gateway returns 5xx on downstream failure) genuinely
 * reprocesses instead of silently dropping a half-applied event. State is
 * derived from each event's own payload and ordered by `event.created`, so
 * out-of-order delivery can't stomp newer state. See specs/08.
 */
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    private readonly billing: BillingService,
  ) {}

  /** Verify the Stripe signature (raw body + header) then reconcile. Throws
   *  STRIPE_WEBHOOK_INVALID on a bad signature (→ 400) or INTERNAL_ERROR on a
   *  downstream failure (→ 500, so Stripe retries). */
  async verifyAndHandle(
    payload: string,
    signature: string,
  ): Promise<{ ok: true }> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw rpcError('INTERNAL_ERROR', 'STRIPE_WEBHOOK_SECRET is not set');
    }
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        Buffer.from(payload),
        signature,
        secret,
      );
    } catch {
      throw rpcError('STRIPE_WEBHOOK_INVALID', 'Invalid Stripe signature');
    }
    try {
      return await this.handleEvent(event);
    } catch (err) {
      this.logger.error(
        `webhook processing failed for ${event.id} (${event.type}): ${(err as Error).message}`,
      );
      // tx rolled back the idempotency insert → Stripe's retry will reprocess.
      throw rpcError('INTERNAL_ERROR', 'Webhook processing failed');
    }
  }

  /** Handle a verified Stripe event. Idempotent + out-of-order safe. Any failure
   *  inside the transaction propagates (caller maps to 5xx for Stripe retry). */
  async handleEvent(event: Stripe.Event): Promise<{ ok: true }> {
    // Pre-fetch any Stripe object over the network BEFORE opening the tx.
    const subToSync = await this.resolveSubscription(event);

    await this.db.transaction(async (tx) => {
      // Idempotency: dedupe by Stripe event id, INSIDE the tx. A conflict means
      // the event was already fully applied — a true no-op (rollback-safe).
      const inserted = await tx
        .insert(stripeEvents)
        .values({
          eventId: event.id,
          eventType: event.type,
          eventCreatedAt: new Date(event.created * 1000),
          payload: event as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing({ target: stripeEvents.eventId })
        .returning({ id: stripeEvents.id });
      if (inserted.length === 0) return; // already applied — skip

      if (subToSync) await this.syncSubscription(tx, subToSync, event.created);
    });
    return { ok: true };
  }

  /** Extract the subscription object to sync. Checkout sessions + invoices only
   *  carry the subscription id, so those are retrieved; the `customer.subscription.*`
   *  events carry the full object. Returns null for events with no subscription. */
  private async resolveSubscription(
    event: Stripe.Event,
  ): Promise<Stripe.Subscription | null> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const subId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
        return subId ? await this.stripe.subscriptions.retrieve(subId) : null;
      }
      // Invoice events: reconcile from the subscription that generated the
      // invoice so a past_due / payment-failure flip lands even if
      // customer.subscription.updated lags or is missed. In stripe@22 the sub id
      // moved off `invoice.subscription` to `invoice.parent.subscription_details`.
      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = invoice.parent?.subscription_details?.subscription;
        const subId = typeof subRef === 'string' ? subRef : subRef?.id;
        return subId ? await this.stripe.subscriptions.retrieve(subId) : null;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        return event.data.object as Stripe.Subscription;
      default:
        return null;
    }
  }

  /** Reconcile a Stripe Subscription into the local `subscriptions` row, inside
   *  the caller's transaction. State is payload-derived + ordered by event time. */
  private async syncSubscription(
    tx: Tx,
    sub: Stripe.Subscription,
    eventCreated: number,
  ): Promise<void> {
    const existing = await tx.query.subscriptions.findFirst({
      where: eq(subscriptions.stripeSubscriptionId, sub.id),
      columns: {
        workspaceId: true,
        stripeEventCreatedAt: true,
        pendingChange: true,
      },
    });
    const workspaceId =
      (sub.metadata?.workspaceId as string | undefined) ??
      existing?.workspaceId ??
      null;
    if (!workspaceId) {
      this.logger.warn(
        `subscription ${sub.id} has no workspaceId mapping — skipped`,
      );
      return;
    }

    // Serialize per-workspace: READ COMMITTED doesn't serialize the
    // read-modify-write, so two concurrently-delivered events for this workspace
    // could otherwise both pass the staleness guard and last-commit-win.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${workspaceId}, 0))`,
    );

    // Ordering guard: skip only STRICTLY older events. '<=' (the old code)
    // dropped same-second state — Stripe's event.created is second-resolution and
    // subscription.created → .updated for one sub routinely fire inside the same
    // second, so the incomplete→active transition was never written.
    const incoming = new Date(eventCreated * 1000);
    if (
      existing?.stripeEventCreatedAt &&
      incoming < existing.stripeEventCreatedAt
    ) {
      this.logger.warn(
        `stale event for sub ${sub.id} (${incoming.toISOString()} < ${existing.stripeEventCreatedAt.toISOString()}) — state write skipped`,
      );
      return;
    }

    const item = sub.items.data[0];
    const price = item?.price;
    const priceId = price?.id ?? null;
    const plan = priceId ? await this.billing.findPlanByPriceId(priceId) : null;
    if (!plan) {
      // Retryable config error (price-id backfill missing/wrong). Fail the tx so
      // it rolls back the idempotency insert AND Stripe retries after the fix —
      // never silently record this as applied. Alert-worthy: monitor for it.
      throw rpcError(
        'INTERNAL_ERROR',
        `no plan maps to price ${priceId} (subscription ${sub.id}) — check plans.stripe_price_id_* backfill`,
      );
    }

    const billingCycle =
      price?.recurring?.interval === 'year' ? 'yearly' : 'monthly';

    // If this event lands a deferred downgrade (phase 2 of a Subscription
    // Schedule), clear the `pending_change` hint — match on the target plan key
    // stored there so a unrelated price change never clears a real pending one.
    const pendingHint = (existing?.pendingChange ?? null) as {
      planKey?: string;
    } | null;
    const clearPending =
      pendingHint?.planKey === plan.key ? { pendingChange: null } : {};

    // Guard the write on the subscription id, not just the workspace. A delayed
    // event for an OLD subscription must not stomp a NEWER one that now owns the
    // workspace row — the by-sub-id lookup above can miss that case once the row
    // has moved on to a different stripe_subscription_id.
    const rowValues = {
      planId: plan.id,
      status: mapStatus(sub.status),
      billingCycle,
      stripeCustomerId:
        typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      stripeSubscriptionId: sub.id,
      // current_period_start/end live on SubscriptionItem in stripe@22, not on
      // Subscription. The past_due/incomplete grace (shouldRestrictToFree) and
      // the tenant-facing period display both depend on these being written.
      currentPeriodStart: item?.current_period_start
        ? new Date(item.current_period_start * 1000)
        : null,
      currentPeriodEnd: item?.current_period_end
        ? new Date(item.current_period_end * 1000)
        : null,
      trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      stripeEventCreatedAt: incoming,
      updatedBy: null,
      ...clearPending,
    };
    const updated = await tx
      .update(subscriptions)
      .set(rowValues)
      .where(
        and(
          eq(subscriptions.workspaceId, workspaceId),
          or(
            isNull(subscriptions.stripeSubscriptionId),
            eq(subscriptions.stripeSubscriptionId, sub.id),
          ),
        ),
      )
      .returning({ id: subscriptions.id });
    if (updated.length > 0) return;

    // Update matched nothing → either the workspace has no subscriptions row at
    // all (the "always exists, defaults to free" invariant can be broken for
    // workspaces created before the seeding landed — the event metadata is the
    // trusted mapping), or the row is owned by a NEWER subscription. The insert
    // self-heals the missing-row case; onConflictDoNothing on the workspace
    // unique index makes the owned-by-newer-sub case a safe no-op.
    const insertedRow = await tx
      .insert(subscriptions)
      .values({ workspaceId, ...rowValues })
      .onConflictDoNothing({ target: subscriptions.workspaceId })
      .returning({ id: subscriptions.id });
    if (insertedRow.length > 0) {
      this.logger.log(
        `created missing subscriptions row for workspace ${workspaceId} (self-healed from event)`,
      );
      return;
    }
    this.logger.warn(
      `sub ${sub.id} sync skipped — workspace ${workspaceId} row holds a different stripe_subscription_id (a newer subscription likely owns it)`,
    );
  }
}
