import { eq } from 'drizzle-orm';
import { RpcException } from '@nestjs/microservices';
import type Stripe from 'stripe';
import { BillingService } from '../../src/billing/billing.service';
import * as schema from '../../src/db/schema';
import { startTestDb, type TestDb } from './test-db';

const { users, workspaces, workspaceMembers, plans, subscriptions } = schema;

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const WS_ID = '33333333-3333-4333-8333-333333333333';
const PRO_PLAN_ID = '55555555-5555-4555-8555-555555555555';
const STARTER_PLAN_ID = '66666666-6666-4666-8666-666666666666';

/** Stripe item-level period (stripe@22 keeps it on the SubscriptionItem). */
const PERIOD_END = Math.floor(Date.now() / 1000) + 30 * 86_400;

let testDb: TestDb;
let db: TestDb['db'];
let stripe: {
  subscriptions: { retrieve: jest.Mock; update: jest.Mock };
  subscriptionSchedules: { create: jest.Mock; release: jest.Mock };
};
let service: BillingService;

function stripeSub(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: 'sub_test',
    items: {
      data: [
        {
          id: 'si_test',
          price: { id: 'price_starter_monthly' },
          current_period_end: PERIOD_END,
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

beforeAll(async () => {
  testDb = await startTestDb();
  db = testDb.db;
}, 120_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(async () => {
  await testDb.truncate();
  stripe = {
    subscriptions: {
      retrieve: jest.fn().mockResolvedValue(stripeSub()),
      update: jest.fn().mockResolvedValue(stripeSub()),
    },
    subscriptionSchedules: {
      create: jest.fn().mockResolvedValue({ id: 'sub_sched_1' }),
      release: jest.fn().mockResolvedValue({ id: 'sub_sched_1' }),
    },
  };
  service = new BillingService(db, stripe as unknown as Stripe);

  await db.insert(users).values({ id: OWNER_ID, email: 'owner@example.com', name: 'Owner', passwordHash: 'x' });
  await db.insert(workspaces).values({ id: WS_ID, name: 'Acme', slug: 'acme', createdBy: OWNER_ID });
  await db.insert(workspaceMembers).values({ workspaceId: WS_ID, userId: OWNER_ID, role: 'owner' });
  await db.insert(plans).values([
    {
      id: '77777777-7777-4777-8777-777777777777',
      key: 'free',
      name: 'Free',
      sortOrder: 0,
      isPublic: true,
      active: true,
      currency: 'usd',
      limits: {},
      features: {},
    },
    {
      id: STARTER_PLAN_ID,
      key: 'starter',
      name: 'Starter',
      sortOrder: 10,
      isPublic: true,
      active: true,
      currency: 'usd',
      stripeProductId: 'prod_starter',
      stripePriceIdMonthly: 'price_starter_monthly',
      stripePriceIdYearly: 'price_starter_yearly',
      limits: {},
      features: {},
    },
    {
      id: PRO_PLAN_ID,
      key: 'pro',
      name: 'Pro',
      sortOrder: 20,
      isPublic: true,
      active: true,
      currency: 'usd',
      stripeProductId: 'prod_pro',
      stripePriceIdMonthly: 'price_pro_monthly',
      stripePriceIdYearly: 'price_pro_yearly',
      limits: {},
      features: {},
    },
  ]);
});

async function seedSubscription(overrides: Record<string, unknown> = {}) {
  await db.insert(subscriptions).values({
    workspaceId: WS_ID,
    planId: STARTER_PLAN_ID,
    status: 'active',
    billingCycle: 'monthly',
    stripeCustomerId: 'cus_test',
    stripeSubscriptionId: 'sub_test',
    ...overrides,
  });
}

async function subRow() {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, WS_ID));
  return row;
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    if (err instanceof RpcException) return err.getError() as { code: string; message: string };
    throw err;
  }
  throw new Error('expected rejection');
}

describe('BillingService.swapPlan — against real Postgres', () => {
  it('no subscription → SUBSCRIPTION_NOT_FOUND', async () => {
    const err = await rejection(
      service.swapPlan({ workspaceId: WS_ID, planKey: 'pro', billingCycle: 'monthly' }),
    );
    expect(err.code).toBe('SUBSCRIPTION_NOT_FOUND');
  });

  it('downgrade creates a real pendingChange from the Stripe item period', async () => {
    // pro(20) → starter(10): tier delta < 0 → deferred via schedule.
    await seedSubscription({ planId: PRO_PLAN_ID });

    const view = await service.swapPlan({
      workspaceId: WS_ID,
      planKey: 'starter',
      billingCycle: 'monthly',
    });

    expect(stripe.subscriptionSchedules.create).toHaveBeenCalledTimes(1);
    const row = await subRow();
    // pendingChange jsonb round-trip with the REAL period end from the item.
    expect(row.pendingChange).toMatchObject({
      planKey: 'starter',
      planName: 'Starter',
      billingCycle: 'monthly',
      effectiveAt: new Date(PERIOD_END * 1000).toISOString(),
      scheduleId: 'sub_sched_1',
    });
    // Paid access continues: the row keeps the CURRENT plan until phase 2.
    expect(row.planId).toBe(PRO_PLAN_ID);
    expect(view.pendingDowngrade).toMatchObject({ planKey: 'starter' });
  });

  it('upgrade mirrors the row immediately (planId + cycle, cancellations cleared)', async () => {
    await seedSubscription({ cancelAtPeriodEnd: true });

    const view = await service.swapPlan({
      workspaceId: WS_ID,
      planKey: 'pro',
      billingCycle: 'yearly',
    });

    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      'sub_test',
      expect.objectContaining({
        items: [{ id: 'si_test', price: 'price_pro_yearly' }],
        proration_behavior: 'always_invoice',
        cancel_at_period_end: false,
        metadata: expect.objectContaining({ workspaceId: WS_ID, planKey: 'pro' }),
      }),
    );
    const row = await subRow();
    expect(row.planId).toBe(PRO_PLAN_ID);
    expect(row.billingCycle).toBe('yearly');
    expect(row.cancelAtPeriodEnd).toBe(false);
    expect(row.pendingChange).toBeNull();
    expect(view.planKey).toBe('pro');
  });

  it('Stripe failing mid-swap leaves the DB row untouched (no partial write)', async () => {
    await seedSubscription();
    stripe.subscriptions.update.mockRejectedValueOnce(new Error('stripe down'));

    // Raw Stripe errors propagate (the gateway maps them to 502).
    await expect(
      service.swapPlan({ workspaceId: WS_ID, planKey: 'pro', billingCycle: 'monthly' }),
    ).rejects.toThrow('stripe down');

    const row = await subRow();
    expect(row.planId).toBe(STARTER_PLAN_ID);
    expect(row.billingCycle).toBe('monthly');
    expect(row.cancelAtPeriodEnd).toBe(false);
  });

  it('schedule-create failing on a downgrade leaves no pendingChange', async () => {
    await seedSubscription({ planId: PRO_PLAN_ID });
    stripe.subscriptionSchedules.create.mockRejectedValueOnce(new Error('stripe down'));

    await expect(
      service.swapPlan({ workspaceId: WS_ID, planKey: 'starter', billingCycle: 'monthly' }),
    ).rejects.toThrow('stripe down');

    const row = await subRow();
    expect(row.pendingChange).toBeNull();
    expect(row.planId).toBe(PRO_PLAN_ID);
  });

  it('free swap mirrors cancel_at_period_end on both sides', async () => {
    await seedSubscription();

    await service.swapPlan({ workspaceId: WS_ID, planKey: 'free', billingCycle: 'monthly' });

    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      'sub_test',
      expect.objectContaining({ cancel_at_period_end: true }),
    );
    const row = await subRow();
    expect(row.cancelAtPeriodEnd).toBe(true);
    expect(row.planId).toBe(STARTER_PLAN_ID); // plan flips via webhook on period end
  });

  it('reactivation (same plan+cycle) releases a pending schedule and clears the flags', async () => {
    await seedSubscription({
      planId: PRO_PLAN_ID,
      cancelAtPeriodEnd: true,
      pendingChange: {
        planKey: 'starter',
        planName: 'Starter',
        billingCycle: 'monthly',
        effectiveAt: new Date().toISOString(),
        scheduleId: 'sub_sched_old',
      },
    });

    await service.swapPlan({ workspaceId: WS_ID, planKey: 'pro', billingCycle: 'monthly' });

    expect(stripe.subscriptionSchedules.release).toHaveBeenCalledWith('sub_sched_old');
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      'sub_test',
      expect.objectContaining({ cancel_at_period_end: false }),
    );
    const row = await subRow();
    expect(row.pendingChange).toBeNull();
    expect(row.cancelAtPeriodEnd).toBe(false);
  });
});
