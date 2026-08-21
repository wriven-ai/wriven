/**
 * Billing & subscriptions (Stripe) — view + status types shared between
 * auth-service (billing module) and api-gateway (billing controller). Backed
 * by `auth_svc.subscriptions` (one row per workspace).
 */

import type { PlanLimits } from './admin.types';

/**
 * Stock resource dimensions checked before a plan downgrade. Blocked when the
 * workspace's current usage exceeds the target plan's limit; order is the
 * client dialog's display order. Flow dimensions (requests, bandwidth, AI) are
 * excluded — they reset each period and can't be "deleted" to comply.
 * environments/locales too — no counter exists in `WorkspaceStatsView` yet.
 */
export type DowngradeDimension =
  | 'projects'
  | 'members'
  | 'contentTypes'
  | 'entries'
  | 'apiKeys'
  | 'webhooks'
  | 'storageMb';

/**
 * One over-limit dimension surfaced in a `DOWNGRADE_BLOCKED` error. `used` is
 * the workspace's current count (or MB for storage); `limit` is the target
 * plan's cap on that dimension.
 */
export interface DowngradeBlock {
  dimension: DowngradeDimension;
  label: string; // human label, e.g. "Content types"
  used: number;
  limit: number;
}

/**
 * Each checked dimension's `PlanLimits` cap field. `null`/absent = unlimited →
 * never blocks. The client mirrors this table by hand (it can't import the
 * contracts bundle — apps/client/src/lib/downgrade.ts).
 */
export const DOWNGRADE_DIMENSIONS: readonly {
  dimension: DowngradeDimension;
  label: string;
  limitKey: keyof PlanLimits;
}[] = [
  { dimension: 'projects', label: 'Projects', limitKey: 'projects' },
  { dimension: 'members', label: 'Members', limitKey: 'members' },
  { dimension: 'contentTypes', label: 'Content types', limitKey: 'contentTypes' },
  { dimension: 'entries', label: 'Entries', limitKey: 'entries' },
  { dimension: 'apiKeys', label: 'API keys', limitKey: 'apiKeys' },
  { dimension: 'webhooks', label: 'Webhooks', limitKey: 'webhooks' },
  { dimension: 'storageMb', label: 'Storage (MB)', limitKey: 'storageMb' },
];

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
 * A deferred downgrade scheduled via a Stripe Subscription Schedule. Populated
 * until the lower-price phase lands; cleared by the webhook reconciler at
 * period end. `effectiveAt` = when the downgrade applies.
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
