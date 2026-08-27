import { AdminPlansService } from './admin-plans.service';
import { chain, writeChain, asDb, chainOf, createDbMock } from '../testing/drizzle-mock';
import { asStripe, createStripeMock } from '../testing/stripe-mock';
import { planRow } from '../testing/fixtures';
import * as schema from '../db/schema';

const { subscriptions } = schema;

function makeService() {
  const db = createDbMock();
  const stripe = createStripeMock();
  const service = new AdminPlansService(asDb(db), asStripe(stripe));
  return { service, db, stripe };
}

/** Happy-path wiring: key is free (no duplicate), insert returns the row. */
function wireHappy(
  db: ReturnType<typeof createDbMock>,
  row = planRow({ key: 'pro' }),
) {
  db.insert.mockImplementationOnce(() => writeChain([row]));
  return row;
}

describe('AdminPlansService.create — validation matrix', () => {
  it('duplicate key → CONFLICT', async () => {
    const { service, db } = makeService();
    db.query.plans.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(
      service.create({ key: 'pro', name: 'Pro' } as never),
    ).rejects.toThrow('already exists');
  });

  it('paid plan with no price at all → VALIDATION_ERROR', async () => {
    const { service } = makeService();

    await expect(
      service.create({ key: 'pro', name: 'Pro' } as never),
    ).rejects.toThrow('needs at least one price');
  });

  it('yearly discount without a monthly price → VALIDATION_ERROR', async () => {
    const { service } = makeService();

    await expect(
      service.create({
        key: 'pro',
        name: 'Pro',
        yearlyDiscountPercent: 20,
      } as never),
    ).rejects.toThrow('requires a monthly price');
  });

  it('discount AND an explicit yearly price → VALIDATION_ERROR (mutually exclusive)', async () => {
    const { service } = makeService();

    await expect(
      service.create({
        key: 'pro',
        name: 'Pro',
        priceMonthly: 29.99,
        priceYearly: 199,
        yearlyDiscountPercent: 20,
      } as never),
    ).rejects.toThrow('not both');
  });
});

describe('AdminPlansService.create — pricing math', () => {
  it('dollars → cents exactly once; yearly computed server-side from the percent', async () => {
    const { service, db, stripe } = makeService();
    wireHappy(db);
    db.select.mockImplementationOnce(() => chain([{ max: 9 }]));

    await service.create({
      key: 'pro',
      name: 'Pro',
      priceMonthly: 29.99,
      yearlyDiscountPercent: 20,
    } as never);

    // 29.99 → 2999 cents; fullYear 35988 − 20% = 28790 (saved 7198).
    expect(chainOf(db.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({
        priceMonthly: 2999,
        priceYearly: 28790,
        yearlyDiscountPercent: 20,
        yearlyDiscountAmount: 7198,
        sortOrder: 10, // max(9) + 1
      }),
    );
    expect(stripe.products.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Pro', metadata: { planKey: 'pro' } }),
    );
    expect(stripe.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        product: 'prod_mock',
        unit_amount: 2999,
        recurring: { interval: 'month', usage_type: 'licensed' },
      }),
    );
    expect(stripe.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        unit_amount: 28790,
        metadata: expect.objectContaining({ yearlyDiscountPercent: '20' }),
      }),
    );
    expect(chainOf(db.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeProductId: 'prod_mock',
        stripePriceIdMonthly: 'price_mock',
        stripePriceIdYearly: 'price_mock',
      }),
    );
  });

  it('explicit yearly price is preserved verbatim (no discount fields)', async () => {
    const { service, db } = makeService();
    wireHappy(db);
    db.select.mockImplementationOnce(() => chain([{ max: 0 }]));

    await service.create({
      key: 'pro',
      name: 'Pro',
      priceMonthly: 29.99,
      priceYearly: 199,
    } as never);

    expect(chainOf(db.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({
        priceMonthly: 2999,
        priceYearly: 19900,
        yearlyDiscountPercent: null,
        yearlyDiscountAmount: null,
      }),
    );
  });

  it('explicit sortOrder wins — no max() lookup', async () => {
    const { service, db } = makeService();
    wireHappy(db);

    await service.create({
      key: 'pro',
      name: 'Pro',
      priceMonthly: 10,
      sortOrder: 5,
    } as never);

    expect(db.select).not.toHaveBeenCalled();
    expect(chainOf(db.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 5 }),
    );
  });

  it('the free plan never touches Stripe', async () => {
    const { service, db, stripe } = makeService();
    wireHappy(db, planRow({ key: 'free', name: 'Free' }));
    db.select.mockImplementationOnce(() => chain([{ max: 0 }]));

    await service.create({ key: 'free', name: 'Free' } as never);

    expect(stripe.products.create).not.toHaveBeenCalled();
    expect(stripe.prices.create).not.toHaveBeenCalled();
    expect(chainOf(db.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeProductId: null,
        stripePriceIdMonthly: null,
        stripePriceIdYearly: null,
      }),
    );
  });

  it('Stripe failure → STRIPE_SYNC_FAILED and NO db insert (Stripe-first)', async () => {
    const { service, db, stripe } = makeService();
    stripe.products.create.mockRejectedValue(new Error('stripe down'));

    await expect(
      service.create({
        key: 'pro',
        name: 'Pro',
        priceMonthly: 10,
      } as never),
    ).rejects.toThrow('Failed to create the Stripe product');
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('AdminPlansService.update — retire path', () => {
  it('archives on Stripe FIRST; failure leaves the DB untouched', async () => {
    const { service, db, stripe } = makeService();
    db.query.plans.findFirst.mockResolvedValue({
      stripeProductId: 'prod_mock',
      stripePriceIdMonthly: 'price_monthly_mock',
      stripePriceIdYearly: 'price_yearly_mock',
    });
    stripe.products.update.mockRejectedValue(new Error('stripe down'));

    await expect(
      service.update({ id: 'plan-1', dto: { active: false } as never }),
    ).rejects.toThrow('Failed to archive');
    expect(db.update).not.toHaveBeenCalled();
  });

  it('retire archives product + both prices, then patches the row', async () => {
    const { service, db, stripe } = makeService();
    db.query.plans.findFirst.mockResolvedValue({
      stripeProductId: 'prod_mock',
      stripePriceIdMonthly: 'price_monthly_mock',
      stripePriceIdYearly: 'price_yearly_mock',
    });
    db.update.mockImplementationOnce(() => writeChain([planRow({ active: false })]));

    const result = await service.update({
      id: 'plan-1',
      dto: { active: false } as never,
    });

    expect(stripe.products.update).toHaveBeenCalledWith('prod_mock', {
      active: false,
    });
    expect(stripe.prices.update).toHaveBeenCalledWith('price_monthly_mock', {
      active: false,
    });
    expect(stripe.prices.update).toHaveBeenCalledWith('price_yearly_mock', {
      active: false,
    });
    expect(chainOf(db.update).set).toHaveBeenCalledWith({ active: false });
    expect(result.active).toBe(false);
  });

  it('a plan without Stripe linkage patches the row directly', async () => {
    const { service, db, stripe } = makeService();
    db.query.plans.findFirst.mockResolvedValue({
      stripeProductId: null,
      stripePriceIdMonthly: null,
      stripePriceIdYearly: null,
    });
    db.update.mockImplementationOnce(() => writeChain([planRow()]));

    await service.update({ id: 'plan-1', dto: { name: 'Renamed' } as never });

    expect(stripe.products.update).not.toHaveBeenCalled();
    expect(chainOf(db.update).set).toHaveBeenCalledWith({ name: 'Renamed' });
  });
});

describe('AdminPlansService.assign', () => {
  it('upserts the subscription row keyed by workspace', async () => {
    const { service, db } = makeService();
    db.query.plans.findFirst.mockResolvedValue({ id: 'plan-pro', key: 'pro' });
    db.query.workspaces.findFirst.mockResolvedValue({ id: 'ws-1' });

    const result = await service.assign({
      workspaceId: 'ws-1',
      dto: { planKey: 'pro', overrides: { projects: 99 } } as never,
      adminUserId: 'admin-1',
    });

    expect(result).toEqual({ success: true, planKey: 'pro', status: 'active' });
    expect(db.insert).toHaveBeenCalledWith(subscriptions);
    expect(chainOf(db.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        planId: 'plan-pro',
        updatedBy: 'admin-1',
        overrides: { projects: 99 },
      }),
    );
  });

  it('unknown plan → NOT_FOUND before any write', async () => {
    const { service, db } = makeService();
    db.query.plans.findFirst.mockResolvedValue(undefined);

    await expect(
      service.assign({
        workspaceId: 'ws-1',
        dto: { planKey: 'nope' } as never,
        adminUserId: 'admin-1',
      }),
    ).rejects.toThrow('Plan not found');
    expect(db.insert).not.toHaveBeenCalled();
  });
});
