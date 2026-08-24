import type Stripe from 'stripe';
import type * as schema from '../db/schema';

type UserRow = typeof schema.users.$inferSelect;
type PlanRow = typeof schema.plans.$inferSelect;
type SubscriptionRow = typeof schema.subscriptions.$inferSelect;

const T0 = new Date('2026-01-01T00:00:00.000Z');

export function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'user@example.com',
    name: 'Test User',
    avatar: null,
    provider: 'local',
    providerId: null,
    passwordHash: 'hashed-password',
    emailVerified: false,
    suspendedAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function planRow(overrides: Partial<PlanRow> = {}): PlanRow {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    key: 'pro',
    name: 'Pro',
    description: null,
    sortOrder: 10,
    isPublic: true,
    active: true,
    priceMonthly: 2900,
    priceYearly: 29000,
    yearlyDiscountPercent: null,
    yearlyDiscountAmount: null,
    currency: 'usd',
    stripeProductId: 'prod_mock',
    stripePriceIdMonthly: 'price_monthly_mock',
    stripePriceIdYearly: 'price_yearly_mock',
    trialDays: 0,
    limits: { projects: 10, members: 10 },
    features: {},
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function subRow(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    workspaceId: 'ws-1',
    planId: '22222222-2222-4222-8222-222222222222',
    status: 'active',
    billingCycle: 'monthly',
    stripeCustomerId: 'cus_mock',
    stripeSubscriptionId: 'sub_mock',
    stripeEventCreatedAt: T0,
    currentPeriodStart: T0,
    currentPeriodEnd: new Date('2026-02-01T00:00:00.000Z'),
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    pendingChange: null,
    overrides: null,
    updatedBy: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

/**
 * Minimal Stripe.Subscription shape as auth-service reads it: top-level
 * metadata + `items.data[0]` price/period (stripe@22 keeps the period dates
 * on the SubscriptionItem).
 */
export function stripeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_mock',
    status: 'active',
    metadata: { workspaceId: 'ws-1' },
    cancel_at_period_end: false,
    items: {
      data: [
        {
          price: { id: 'price_monthly_mock', recurring: { interval: 'month' } },
          current_period_start: 1767225600, // 2026-01-01T00:00:00Z
          current_period_end: 1769904000, // 2026-02-01T00:00:00Z
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}
