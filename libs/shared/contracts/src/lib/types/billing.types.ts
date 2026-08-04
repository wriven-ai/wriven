/**
 * Billing & subscriptions (Stripe) — view + status types shared between
 * auth-service (billing module) and api-gateway (billing controller). Backed by
 * `auth_svc.subscriptions` (one row per workspace). See specs/08.
 */

/**
 * Subscription lifecycle status. Mirrors Stripe's `subscription.status` and is
 * stored on `auth_svc.subscriptions.status` (CHECK-constrained to these values).
 * Surfaced via `SubscriptionView`; reused by `AssignPlanDto.status`.
 */
export const SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'canceled',
  'paused',
  'incomplete',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Billing cycle. `null` for the free plan (no Stripe subscription). */
export type BillingCycle = 'monthly' | 'yearly';

/**
 * A deferred plan downgrade scheduled via a Stripe Subscription Schedule
 * (specs/16). Populated while the lower-price phase hasn't landed yet; cleared
 * by the webhook reconciler at period end. `effectiveAt` = the period end when
 * the downgrade applies.
 */
export interface PendingDowngrade {
  planKey: string;
  planName: string;
  billingCycle: BillingCycle;
  effectiveAt: string; // ISO
}

/**
 * A workspace's subscription — tenant-facing (`GET /billing/subscription`).
 * Timestamps are ISO strings (nullable until a paid subscription exists).
 */
export interface SubscriptionView {
  planKey: string;
  planName: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  /** A downgrade scheduled for period end, or null when none is pending. */
  pendingDowngrade: PendingDowngrade | null;
  hasPaymentMethod: boolean;
}

/** Stripe Checkout Session — `{ url }` the client redirects to. */
export interface CheckoutSessionView {
  url: string;
  sessionId: string;
}

/** Stripe Billing Portal session — `{ url }` the client redirects to. */
export interface PortalSessionView {
  url: string;
}

/** Stripe invoice lifecycle status (mirrors `Invoice.Status`). */
export type InvoiceStatus =
  | 'draft'
  | 'open'
  | 'paid'
  | 'uncollectible'
  | 'void';

/**
 * A Stripe invoice for the workspace's customer — tenant-facing
 * (`GET /billing/invoices`). Link-out only: `url` is Stripe's hosted invoice
 * (downloadable PDF); nothing invoice-related is stored locally.
 */
export interface InvoiceView {
  id: string;
  number: string | null;
  amountPaid: number; // cents
  currency: string;
  status: InvoiceStatus;
  createdAt: string; // ISO
  description: string | null;
  url: string | null; // hosted_invoice_url (Stripe-hosted PDF)
}
