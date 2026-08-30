import { eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { BillingService } from '../../src/billing/billing.service';
import { StripeWebhookService } from '../../src/billing/stripe-webhook.service';
import * as schema from '../../src/db/schema';
import { startTestDb, type TestDb } from './test-db';

const { users, workspaces, workspaceMembers, plans, subscriptions } = schema;

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const WS_ID = '33333333-3333-4333-8333-333333333333';
const STARTER_PLAN_ID = '66666666-6666-4666-8666-666666666666';

jest.setTimeout(30_000);

let testDb: TestDb;
let db: TestDb['db'];
let service: StripeWebhookService;

function subEvent(overrides: {
  id: string;
  created: number;
  status?: string;
  priceId?: string;
}): Stripe.Event {
  const { id, created, status = 'active', priceId = 'price_starter_monthly' } = overrides;
  return {
    id,
    type: 'customer.subscription.updated',
    created,
    data: {
      object: {
        id: 'sub_test',
        status,
        customer: 'cus_test',
        metadata: { workspaceId: WS_ID },
        cancel_at_period_end: false,
        items: {
          data: [
            {
              id: 'si_test',
              price: { id: priceId, recurring: { interval: 'month' } },
              current_period_start: created,
              current_period_end: created + 30 * 86_400,
            },
          ],
        },
      },
    },
  } as unknown as Stripe.Event;
}

beforeAll(async () => {
  testDb = await startTestDb();
  db = testDb.db;
  const stripe = { subscriptions: { retrieve: jest.fn() } };
  const billing = new BillingService(db, stripe as unknown as Stripe);
  service = new StripeWebhookService(db, stripe as unknown as Stripe, billing);
}, 120_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(async () => {
  await testDb.truncate();
  await db.insert(users).values({ id: OWNER_ID, email: 'owner@example.com', name: 'Owner', passwordHash: 'x' });
  await db.insert(workspaces).values({ id: WS_ID, name: 'Acme', slug: 'acme', createdBy: OWNER_ID });
  await db.insert(workspaceMembers).values({ workspaceId: WS_ID, userId: OWNER_ID, role: 'owner' });
  await db.insert(plans).values({
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
  });
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

async function eventCount() {
  const rows = await db.execute<{ count: string }>(
    sql`select count(*)::text as count from auth_svc.stripe_events`,
  );
  return Number(rows[0].count);
}

describe('StripeWebhookService.handleEvent — real Postgres idempotency', () => {
  it('first delivery applies the event and records it', async () => {
    await seedSubscription({ stripeEventCreatedAt: new Date('2026-01-01T00:00:00Z') });

    await service.handleEvent(subEvent({ id: 'evt_1', created: 1_900_000_000 }));

    const row = await subRow();
    expect(row.status).toBe('active');
    expect(row.stripeEventCreatedAt).toEqual(new Date(1_900_000_000 * 1000));
    expect(row.currentPeriodStart).toEqual(new Date(1_900_000_000 * 1000));
    expect(await eventCount()).toBe(1);
  });

  it('re-delivery of the same event id is a TRUE no-op (real unique index)', async () => {
    await seedSubscription();
    await service.handleEvent(subEvent({ id: 'evt_1', created: 1_900_000_000 }));

    // Simulate any drift between deliveries; a re-application would overwrite it.
    await db.execute(
      sql`update auth_svc.subscriptions set status = 'past_due' where stripe_subscription_id = 'sub_test'`,
    );

    await service.handleEvent(subEvent({ id: 'evt_1', created: 1_900_000_000 }));

    expect((await subRow()).status).toBe('past_due'); // untouched — skipped, not re-applied
    expect(await eventCount()).toBe(1); // still exactly one row
  });

  it('STRICTLY older event: state write skipped, but the event row is still recorded', async () => {
    await seedSubscription({ stripeEventCreatedAt: new Date(1_900_000_100 * 1000) });
    await db.execute(
      sql`update auth_svc.subscriptions set status = 'past_due' where stripe_subscription_id = 'sub_test'`,
    );

    await service.handleEvent(subEvent({ id: 'evt_old', created: 1_900_000_000 }));

    expect((await subRow()).status).toBe('past_due'); // no regression
    expect(await eventCount()).toBe(1); // stale event still deduped on redelivery
    // And its re-delivery changes nothing.
    await service.handleEvent(subEvent({ id: 'evt_old', created: 1_900_000_000 }));
    expect((await subRow()).status).toBe('past_due');
    expect(await eventCount()).toBe(1);
  });

  it('unmapped price → INTERNAL_ERROR and the tx ROLLS BACK (event not marked applied)', async () => {
    await seedSubscription();

    await expect(
      service.handleEvent(
        subEvent({ id: 'evt_bad', created: 1_900_000_000, priceId: 'price_unknown' }),
      ),
    ).rejects.toThrow(/no plan maps to price/);

    // Rollback proof: the idempotency insert was undone, so Stripe's retry
    // after a price-id backfill will apply cleanly.
    expect(await eventCount()).toBe(0);
    const row = await subRow();
    expect(row.planId).toBe(STARTER_PLAN_ID);
  });

  it('same-second event applies (strictly-older guard, not <=)', async () => {
    await seedSubscription({ stripeEventCreatedAt: new Date(1_900_000_000 * 1000) });

    await service.handleEvent(subEvent({ id: 'evt_same', created: 1_900_000_000, status: 'past_due' }));

    const row = await subRow();
    expect(row.status).toBe('past_due'); // equal timestamp did NOT skip the write
    expect(row.stripeEventCreatedAt).toEqual(new Date(1_900_000_000 * 1000));
  });
});
