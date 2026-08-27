import { Logger } from '@nestjs/common';
import type Stripe from 'stripe';
import { StripeWebhookService } from './stripe-webhook.service';
import type { BillingService } from './billing.service';
import { chain, writeChain, asDb, chainOf, createDbMock } from '../testing/drizzle-mock';
import { setEnv } from '../testing/env';
import { asStripe, createStripeMock } from '../testing/stripe-mock';
import { planRow, stripeSub } from '../testing/fixtures';
import * as schema from '../db/schema';

const { stripeEvents, subscriptions } = schema;

beforeAll(() => {
  Logger.overrideLogger([]);
});

const EVT_CREATED = 1767225600; // 2026-01-01T00:00:00Z (second resolution)

function stripeEvent(
  type: string,
  object: unknown,
  created = EVT_CREATED,
  id = 'evt_1',
): Stripe.Event {
  return { id, type, created, data: { object } } as unknown as Stripe.Event;
}

function makeService() {
  const db = createDbMock();
  const stripe = createStripeMock();
  const billing = {
    findPlanByPriceId: jest.fn().mockResolvedValue(planRow({ key: 'pro' })),
  };
  const service = new StripeWebhookService(
    asDb(db),
    asStripe(stripe),
    billing as unknown as BillingService,
  );
  return { service, db, tx: db.__tx, stripe, billing };
}

/** First tx.insert (stripeEvents) returns a fresh row → event is new. */
function freshEvent(tx: ReturnType<typeof createDbMock>['__tx']) {
  tx.insert.mockImplementationOnce(() => writeChain([{ id: 'se-1' }]));
}

describe('StripeWebhookService.handleEvent — idempotency + dispatch', () => {
  it('duplicate event id (conflict on insert) → no sync, still ok', async () => {
    const { service, tx } = makeService();
    // Default chain resolves [] → onConflictDoNothing returned nothing.

    const result = await service.handleEvent(
      stripeEvent('customer.subscription.updated', stripeSub()),
    );

    expect(result).toEqual({ ok: true });
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).toHaveBeenCalledTimes(1); // only the stripeEvents insert
  });

  it('irrelevant event type → no Stripe fetch, event still recorded', async () => {
    const { service, tx, stripe } = makeService();
    freshEvent(tx);

    const result = await service.handleEvent(
      stripeEvent('payment_intent.succeeded', { id: 'pi_1' }),
    );

    expect(result).toEqual({ ok: true });
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('checkout.session.completed retrieves the subscription by id', async () => {
    const { service, tx, stripe } = makeService();
    freshEvent(tx);
    stripe.subscriptions.retrieve.mockResolvedValue(stripeSub());

    await service.handleEvent(
      stripeEvent('checkout.session.completed', { subscription: 'sub_mock' }),
    );

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_mock');
    expect(tx.update).toHaveBeenCalledWith(subscriptions);
  });

  it('invoice events read parent.subscription_details.subscription (stripe@22)', async () => {
    const { service, tx, stripe } = makeService();
    freshEvent(tx);
    stripe.subscriptions.retrieve.mockResolvedValue(stripeSub());

    await service.handleEvent(
      stripeEvent('invoice.payment_failed', {
        parent: { subscription_details: { subscription: 'sub_mock' } },
      }),
    );

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_mock');
  });

  it('customer.subscription.* uses the embedded object — no network fetch', async () => {
    const { service, tx, stripe } = makeService();
    freshEvent(tx);

    await service.handleEvent(
      stripeEvent('customer.subscription.created', stripeSub()),
    );

    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalledWith(subscriptions);
  });
});

describe('StripeWebhookService — syncSubscription', () => {
  it('no workspaceId anywhere → silent skip after recording the event', async () => {
    const { service, tx } = makeService();
    freshEvent(tx);

    await service.handleEvent(
      stripeEvent(
        'customer.subscription.updated',
        stripeSub({ metadata: {} }),
      ),
    );

    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).toHaveBeenCalledTimes(1);
  });

  it('stale event (older than the applied one) → state write skipped', async () => {
    const { service, tx } = makeService();
    freshEvent(tx);
    tx.query.subscriptions.findFirst.mockResolvedValue({
      workspaceId: 'ws-1',
      stripeEventCreatedAt: new Date((EVT_CREATED + 1) * 1000),
      pendingChange: null,
    });

    await service.handleEvent(
      stripeEvent('customer.subscription.updated', stripeSub()),
    );

    expect(tx.update).not.toHaveBeenCalled();
  });

  it('same-second event is NOT stale (strictly-older guard regression)', async () => {
    const { service, tx } = makeService();
    freshEvent(tx);
    tx.query.subscriptions.findFirst.mockResolvedValue({
      workspaceId: 'ws-1',
      stripeEventCreatedAt: new Date(EVT_CREATED * 1000),
      pendingChange: null,
    });
    tx.update.mockImplementationOnce(() => writeChain([{ id: 'sub-row' }]));

    await service.handleEvent(
      stripeEvent('customer.subscription.updated', stripeSub()),
    );

    expect(tx.update).toHaveBeenCalledWith(subscriptions);
  });

  it('unmapped price id → INTERNAL_ERROR out of handleEvent (tx rollback → Stripe retry)', async () => {
    const { service, tx, billing } = makeService();
    freshEvent(tx);
    billing.findPlanByPriceId.mockResolvedValue(null);

    await expect(
      service.handleEvent(
        stripeEvent('customer.subscription.updated', stripeSub()),
      ),
    ).rejects.toThrow('no plan maps to price');
  });

  it.each([
    ['unpaid', 'canceled'],
    ['incomplete_expired', 'canceled'],
    ['garbage_status', 'incomplete'],
    ['active', 'active'],
    ['trialing', 'trialing'],
    ['past_due', 'past_due'],
  ])('maps Stripe status %s → %s', async (stripe, expected) => {
    const { service, tx } = makeService();
    freshEvent(tx);
    tx.update.mockImplementationOnce(() => writeChain([{ id: 'sub-row' }]));

    await service.handleEvent(
      stripeEvent(
        'customer.subscription.updated',
        stripeSub({ status: stripe }),
      ),
    );

    expect(chainOf(tx.update).set).toHaveBeenCalledWith(
      expect.objectContaining({ status: expected }),
    );
  });

  it('yearly interval + item-level period dates land on the row', async () => {
    const { service, tx } = makeService();
    freshEvent(tx);
    tx.update.mockImplementationOnce(() => writeChain([{ id: 'sub-row' }]));

    await service.handleEvent(
      stripeEvent(
        'customer.subscription.updated',
        stripeSub({
          items: {
            data: [
              {
                id: 'si_1',
                price: {
                  id: 'price_yearly_mock',
                  recurring: { interval: 'year' },
                },
                current_period_start: 1767225600,
                current_period_end: 1798761600,
              },
            ],
          },
        }),
      ),
    );

    expect(chainOf(tx.update).set).toHaveBeenCalledWith(
      expect.objectContaining({
        billingCycle: 'yearly',
        currentPeriodStart: new Date('2026-01-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2027-01-01T00:00:00.000Z'),
      }),
    );
  });

  it('pendingChange cleared only when its planKey matches the landed plan', async () => {
    const { service, tx } = makeService();
    freshEvent(tx);
    tx.query.subscriptions.findFirst.mockResolvedValue({
      workspaceId: 'ws-1',
      stripeEventCreatedAt: new Date(0),
      pendingChange: { planKey: 'pro' }, // matches the stub plan below
    });
    tx.update.mockImplementationOnce(() => writeChain([{ id: 'sub-row' }]));

    await service.handleEvent(
      stripeEvent('customer.subscription.updated', stripeSub()),
    );

    expect(chainOf(tx.update).set).toHaveBeenCalledWith(
      expect.objectContaining({ pendingChange: null }),
    );
  });

  it('pendingChange kept when a different plan landed', async () => {
    const { service, tx, billing } = makeService();
    freshEvent(tx);
    billing.findPlanByPriceId.mockResolvedValue(planRow({ key: 'starter' }));
    tx.query.subscriptions.findFirst.mockResolvedValue({
      workspaceId: 'ws-1',
      stripeEventCreatedAt: new Date(0),
      pendingChange: { planKey: 'pro' },
    });
    tx.update.mockImplementationOnce(() => writeChain([{ id: 'sub-row' }]));

    await service.handleEvent(
      stripeEvent('customer.subscription.updated', stripeSub()),
    );

    const setArgs = chainOf(tx.update).set.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(setArgs).not.toHaveProperty('pendingChange');
  });

  it('guarded update matches nothing → self-heal insert keyed by workspace', async () => {
    const { service, tx } = makeService();
    freshEvent(tx);
    // tx.update default chain resolves [] → row missing or owned by newer sub.

    await service.handleEvent(
      stripeEvent('customer.subscription.updated', stripeSub()),
    );

    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(tx.insert).toHaveBeenLastCalledWith(subscriptions);
    expect(chainOf(tx.insert, 1).values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        stripeSubscriptionId: 'sub_mock',
      }),
    );
  });

  it('self-heal insert also conflicts (newer sub owns the row) → warn no-op, ok', async () => {
    const { service, tx } = makeService();
    freshEvent(tx);
    tx.insert.mockImplementationOnce(() => writeChain([{ id: 'se-1' }]))
      .mockImplementationOnce(() => chain([]));

    const result = await service.handleEvent(
      stripeEvent('customer.subscription.updated', stripeSub()),
    );

    expect(result).toEqual({ ok: true });
    expect(tx.insert).toHaveBeenCalledTimes(2);
  });
});

describe('StripeWebhookService.verifyAndHandle', () => {
  afterEach(() => restoreSecret());

  let restoreSecret: () => void;

  it('missing STRIPE_WEBHOOK_SECRET → INTERNAL_ERROR', async () => {
    restoreSecret = setEnv({ STRIPE_WEBHOOK_SECRET: undefined });
    const { service } = makeService();

    await expect(
      service.verifyAndHandle('{}', 'sig'),
    ).rejects.toThrow('STRIPE_WEBHOOK_SECRET');
  });

  it('bad signature → STRIPE_WEBHOOK_INVALID', async () => {
    restoreSecret = setEnv({ STRIPE_WEBHOOK_SECRET: 'whsec_test' });
    const { service, stripe } = makeService();
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('bad signature');
    });

    await expect(
      service.verifyAndHandle('{}', 'sig'),
    ).rejects.toThrow('Invalid Stripe signature');
  });

  it('downstream handleEvent failure → INTERNAL_ERROR (Stripe retries)', async () => {
    restoreSecret = setEnv({ STRIPE_WEBHOOK_SECRET: 'whsec_test' });
    const { service, tx, stripe, billing } = makeService();
    stripe.webhooks.constructEvent.mockReturnValue(
      stripeEvent('customer.subscription.updated', stripeSub()),
    );
    freshEvent(tx);
    billing.findPlanByPriceId.mockResolvedValue(null); // force the tx to fail

    await expect(service.verifyAndHandle('{}', 'sig')).rejects.toThrow(
      'Webhook processing failed',
    );
    expect(billing.findPlanByPriceId).toHaveBeenCalled();
  });

  it('valid signature + happy path → ok', async () => {
    restoreSecret = setEnv({ STRIPE_WEBHOOK_SECRET: 'whsec_test' });
    const { service, tx, stripe } = makeService();
    stripe.webhooks.constructEvent.mockReturnValue(
      stripeEvent('payment_intent.succeeded', { id: 'pi_1' }),
    );
    freshEvent(tx);

    const result = await service.verifyAndHandle('{}', 'sig');
    expect(result).toEqual({ ok: true });
    expect(tx.insert).toHaveBeenCalledWith(stripeEvents);
  });

  it('the SDK receives (RAW payload buffer, signature header, secret) together', async () => {
    // Signature binding: verification must run over the raw request body — a
    // re-serialization (JSON.parse → stringify) would break the HMAC. Pin all
    // three arguments and the Buffer type.
    restoreSecret = setEnv({ STRIPE_WEBHOOK_SECRET: 'whsec_test' });
    const { service, tx, stripe } = makeService();
    stripe.webhooks.constructEvent.mockReturnValue(
      stripeEvent('payment_intent.succeeded', { id: 'pi_1' }),
    );
    freshEvent(tx);

    const rawBody = '{"raw":"bytes"}';
    await service.verifyAndHandle(rawBody, 't=1,sig=sig-header');

    expect(stripe.webhooks.constructEvent).toHaveBeenCalledTimes(1);
    const [body, sig, secret] = stripe.webhooks.constructEvent.mock.calls[0] as [
      unknown,
      string,
      string,
    ];
    expect(Buffer.isBuffer(body)).toBe(true);
    expect((body as Buffer).toString('utf8')).toBe(rawBody); // exact bytes, not re-serialized
    expect(sig).toBe('t=1,sig=sig-header');
    expect(secret).toBe('whsec_test');
  });
});
