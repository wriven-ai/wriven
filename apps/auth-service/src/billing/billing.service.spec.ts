import { SubscriptionView } from '@wriven/contracts';
import { BillingService } from './billing.service';
import { asDb, chainOf, createDbMock } from '../testing/drizzle-mock';
import { setEnv } from '../testing/env';
import { asStripe, createStripeMock } from '../testing/stripe-mock';
import { planRow, stripeSub, subRow } from '../testing/fixtures';

function makeService() {
  const db = createDbMock();
  const stripe = createStripeMock();
  const service = new BillingService(asDb(db), asStripe(stripe));
  return { service, db, stripe };
}

/** safeUrl is private static — reach it through a typed cast. */
const safeUrl = (
  candidate: string | undefined,
  fallback: string,
): string =>
  (BillingService as unknown as {
    safeUrl: (c: string | undefined, f: string) => string;
  }).safeUrl(candidate, fallback);

describe('BillingService.safeUrl (open-redirect guard)', () => {
  let restore: () => void;

  afterEach(() => restore());

  it('no APP_URL → localhost fallback with the path joined', () => {
    restore = setEnv({ APP_URL: undefined });
    expect(safeUrl(undefined, '/billing?x=1')).toBe(
      'http://localhost:3000/billing?x=1',
    );
  });

  it('undefined candidate → app default', () => {
    restore = setEnv({ APP_URL: 'https://app.test' });
    expect(safeUrl(undefined, '/billing?checkout=success')).toBe(
      'https://app.test/billing?checkout=success',
    );
  });

  it('same-origin candidate passes', () => {
    restore = setEnv({ APP_URL: 'https://app.test' });
    expect(safeUrl('https://app.test/billing?ok=1', '/billing')).toBe(
      'https://app.test/billing?ok=1',
    );
  });

  it('subdomain of the app origin passes', () => {
    restore = setEnv({ APP_URL: 'https://app.test' });
    expect(safeUrl('https://dash.app.test/x', '/billing')).toBe(
      'https://dash.app.test/x',
    );
  });

  it('www. is normalized on both sides', () => {
    restore = setEnv({ APP_URL: 'https://www.app.test' });
    expect(safeUrl('https://app.test/x', '/billing')).toBe(
      'https://app.test/x',
    );
  });

  it('any *.vercel.app preview passes', () => {
    restore = setEnv({ APP_URL: 'https://app.test' });
    expect(safeUrl('https://wriven-preview.vercel.app/x', '/billing')).toBe(
      'https://wriven-preview.vercel.app/x',
    );
  });

  it('cross-origin candidate → default', () => {
    restore = setEnv({ APP_URL: 'https://app.test' });
    expect(safeUrl('https://evil.example/steal', '/billing')).toBe(
      'https://app.test/billing',
    );
  });

  it('javascript: scheme → default', () => {
    restore = setEnv({ APP_URL: 'https://app.test' });
    expect(safeUrl('javascript:alert(1)', '/billing')).toBe(
      'https://app.test/billing',
    );
  });

  it('unparseable garbage → default', () => {
    restore = setEnv({ APP_URL: 'https://app.test' });
    expect(safeUrl('not a url at all', '/billing')).toBe(
      'https://app.test/billing',
    );
  });
});

// ── swapPlan ─────────────────────────────────────────────────────────────────

describe('BillingService.swapPlan', () => {
  const pro = planRow({ key: 'pro', name: 'Pro', sortOrder: 10 });
  const starter = planRow({
    key: 'starter',
    name: 'Starter',
    sortOrder: 5,
    stripePriceIdMonthly: 'price_starter_monthly',
  });

  /** Current sub row (swapPlan's first query) + the row getSubscription re-reads. */
  function wireCurrent(
    db: ReturnType<typeof createDbMock>,
    overrides: Record<string, unknown> = {},
  ) {
    const current = {
      id: 'sub-row-1',
      status: 'active',
      stripeSubscriptionId: 'sub_mock',
      cancelAtPeriodEnd: false,
      pendingChange: null,
      billingCycle: 'monthly',
      plan: { key: 'pro', sortOrder: 10 },
      ...overrides,
    };
    db.query.subscriptions.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce({ ...subRow(), plan: pro }); // getSubscription re-read
    return current;
  }

  it('no Stripe subscription on the row → SUBSCRIPTION_NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.query.subscriptions.findFirst.mockResolvedValue({
      id: 'sub-row-1',
      status: 'active',
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      pendingChange: null,
      billingCycle: null,
      plan: { key: 'free', sortOrder: 0 },
    });

    await expect(
      service.swapPlan({ workspaceId: 'ws-1', planKey: 'pro', billingCycle: 'monthly' }),
    ).rejects.toThrow('no active subscription');
  });

  it('canceled row → SUBSCRIPTION_NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.query.subscriptions.findFirst.mockResolvedValue({
      id: 'sub-row-1',
      status: 'canceled',
      stripeSubscriptionId: 'sub_mock',
      cancelAtPeriodEnd: false,
      pendingChange: null,
      billingCycle: 'monthly',
      plan: { key: 'pro', sortOrder: 10 },
    });

    await expect(
      service.swapPlan({ workspaceId: 'ws-1', planKey: 'pro', billingCycle: 'monthly' }),
    ).rejects.toThrow('no active subscription');
  });

  it.each([
    ['missing', undefined],
    ['inactive', planRow({ key: 'starter', active: false })],
  ])('%s target plan → NOT_FOUND', async (_label, target) => {
    const { service, db } = makeService();
    wireCurrent(db);
    db.query.plans.findFirst.mockResolvedValue(target);

    await expect(
      service.swapPlan({ workspaceId: 'ws-1', planKey: 'starter', billingCycle: 'monthly' }),
    ).rejects.toThrow('not found');
  });

  it('reactivation with a pending schedule: release + clear, no price change', async () => {
    const { service, db, stripe } = makeService();
    wireCurrent(db, { pendingChange: { scheduleId: 'sched_1' } });
    db.query.plans.findFirst.mockResolvedValue(pro); // target lookup precedes the branch

    const result = await service.swapPlan({
      workspaceId: 'ws-1',
      planKey: 'pro',
      billingCycle: 'monthly',
    });

    expect(stripe.subscriptionSchedules.release).toHaveBeenCalledWith('sched_1');
    expect(stripe.subscriptions.update).not.toHaveBeenCalled(); // no cancel flag set
    expect(chainOf(db.update).set).toHaveBeenCalledWith({ pendingChange: null });
    expect(result.planKey).toBe('pro');
  });

  it('reactivation with cancel-at-period-end: Stripe flag cleared + row mirrored', async () => {
    const { service, db, stripe } = makeService();
    wireCurrent(db, { cancelAtPeriodEnd: true });
    db.query.plans.findFirst.mockResolvedValue(pro);

    await service.swapPlan({
      workspaceId: 'ws-1',
      planKey: 'pro',
      billingCycle: 'monthly',
    });

    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_mock', {
      cancel_at_period_end: false,
    });
    expect(chainOf(db.update).set).toHaveBeenCalledWith({
      cancelAtPeriodEnd: false,
    });
  });

  it('clean reactivation: zero Stripe calls, zero writes', async () => {
    const { service, db, stripe } = makeService();
    wireCurrent(db);
    db.query.plans.findFirst.mockResolvedValue(pro);

    const result = await service.swapPlan({
      workspaceId: 'ws-1',
      planKey: 'pro',
      billingCycle: 'monthly',
    });

    expect(stripe.subscriptionSchedules.release).not.toHaveBeenCalled();
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(result.planKey).toBe('pro');
  });

  it('a pending schedule is released before ANY other change', async () => {
    const { service, db, stripe } = makeService();
    wireCurrent(db, { pendingChange: { scheduleId: 'sched_1' } });
    db.query.plans.findFirst.mockResolvedValue(planRow({ key: 'free' }));

    await service.swapPlan({
      workspaceId: 'ws-1',
      planKey: 'free',
      billingCycle: 'monthly',
    });

    expect(stripe.subscriptionSchedules.release).toHaveBeenCalledWith('sched_1');
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_mock', {
      cancel_at_period_end: true,
    });
  });

  it('downgrade to free: cancel at period end + row mirror', async () => {
    const { service, db, stripe } = makeService();
    wireCurrent(db);
    db.query.plans.findFirst.mockResolvedValue(planRow({ key: 'free' }));

    await service.swapPlan({
      workspaceId: 'ws-1',
      planKey: 'free',
      billingCycle: 'monthly',
    });

    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_mock', {
      cancel_at_period_end: true,
    });
    expect(chainOf(db.update).set).toHaveBeenCalledWith({
      cancelAtPeriodEnd: true,
    });
    expect(stripe.subscriptionSchedules.create).not.toHaveBeenCalled();
  });

  it('tier downgrade: 2-phase schedule + pendingChange on the row', async () => {
    const { service, db, stripe } = makeService();
    wireCurrent(db);
    db.query.plans.findFirst.mockResolvedValue(starter);
    stripe.subscriptions.retrieve.mockResolvedValue(stripeSub());
    stripe.subscriptionSchedules.create.mockResolvedValue({ id: 'sched_new' });

    await service.swapPlan({
      workspaceId: 'ws-1',
      planKey: 'starter',
      billingCycle: 'monthly',
    });

    expect(stripe.subscriptionSchedules.create).toHaveBeenCalledWith({
      from_subscription: 'sub_mock',
      phases: [
        {
          items: [{ price: 'price_monthly_mock' }],
          proration_behavior: 'none',
          end_date: 1769904000,
        },
        { items: [{ price: 'price_starter_monthly' }] },
      ],
    });
    expect(chainOf(db.update).set).toHaveBeenCalledWith({
      pendingChange: {
        planKey: 'starter',
        planName: 'Starter',
        billingCycle: 'monthly',
        effectiveAt: '2026-02-01T00:00:00.000Z',
        scheduleId: 'sched_new',
      },
    });
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it('tier upgrade: immediate prorated update + row mirror', async () => {
    const { service, db, stripe } = makeService();
    const teamPlan = planRow({ key: 'team', name: 'Team', sortOrder: 20 });
    wireCurrent(db);
    db.query.plans.findFirst.mockResolvedValue(teamPlan);
    stripe.subscriptions.retrieve.mockResolvedValue(stripeSub());

    await service.swapPlan({
      workspaceId: 'ws-1',
      planKey: 'team',
      billingCycle: 'monthly',
    });

    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_mock', {
      items: [{ id: 'si_1', price: 'price_monthly_mock' }],
      proration_behavior: 'always_invoice',
      cancel_at_period_end: false,
      metadata: {
        workspaceId: 'ws-1',
        planKey: 'team',
        billingCycle: 'monthly',
      },
    });
    expect(chainOf(db.update).set).toHaveBeenCalledWith({
      planId: teamPlan.id,
      billingCycle: 'monthly',
      cancelAtPeriodEnd: false,
    });
  });

  it('same plan, different cycle: NOT a reactivation — prorated switch', async () => {
    const { service, db, stripe } = makeService();
    wireCurrent(db, { billingCycle: 'monthly' });
    db.query.plans.findFirst.mockResolvedValue(
      planRow({ key: 'pro', sortOrder: 10, stripePriceIdYearly: 'price_yearly_mock' }),
    );
    stripe.subscriptions.retrieve.mockResolvedValue(stripeSub());

    await service.swapPlan({
      workspaceId: 'ws-1',
      planKey: 'pro',
      billingCycle: 'yearly',
    });

    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      'sub_mock',
      expect.objectContaining({
        items: [{ id: 'si_1', price: 'price_yearly_mock' }],
      }),
    );
  });

  it('Stripe subscription missing its item/price/period → INTERNAL_ERROR', async () => {
    const { service, db, stripe } = makeService();
    wireCurrent(db);
    db.query.plans.findFirst.mockResolvedValue(starter);
    stripe.subscriptions.retrieve.mockResolvedValue(
      stripeSub({ items: { data: [] } }),
    );

    await expect(
      service.swapPlan({
        workspaceId: 'ws-1',
        planKey: 'starter',
        billingCycle: 'monthly',
      }),
    ).rejects.toThrow('missing its line item');
  });
});

// ── createCheckout ───────────────────────────────────────────────────────────

describe('BillingService.createCheckout', () => {
  const input = {
    workspaceId: 'ws-1',
    userId: '11111111-1111-4111-8111-111111111111',
    planKey: 'pro',
    billingCycle: 'monthly' as const,
  };

  it('missing or inactive plan → NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.query.plans.findFirst.mockResolvedValue(undefined);

    await expect(service.createCheckout(input)).rejects.toThrow('not found');
  });

  it('plan not linked to a Stripe price for the cycle → INTERNAL_ERROR', async () => {
    const { service, db } = makeService();
    db.query.plans.findFirst.mockResolvedValue(
      planRow({ stripePriceIdMonthly: null }),
    );

    await expect(service.createCheckout(input)).rejects.toThrow(
      'not linked to a Stripe price',
    );
  });

  it('live Stripe subscription on the row → SUBSCRIPTION_EXISTS', async () => {
    const { service, db } = makeService();
    db.query.plans.findFirst.mockResolvedValue(planRow());
    db.query.subscriptions.findFirst.mockResolvedValue({
      status: 'active',
      stripeSubscriptionId: 'sub_live',
    });

    await expect(service.createCheckout(input)).rejects.toThrow(
      'already has an active subscription',
    );
  });

  it('canceled subscription id: Checkout allowed (free → paid restart)', async () => {
    const { service, db, stripe } = makeService();
    db.query.plans.findFirst.mockResolvedValue(planRow());
    db.query.subscriptions.findFirst
      .mockResolvedValueOnce({ status: 'canceled', stripeSubscriptionId: 'sub_old' })
      .mockResolvedValueOnce({ id: 'sub-row-1', stripeCustomerId: 'cus_stored' });

    const result = await service.createCheckout(input);

    expect(result).toEqual({
      url: 'https://checkout.example/url',
      sessionId: 'cs_mock',
    });
    expect(stripe.checkout.sessions.create).toHaveBeenCalled();
  });

  it('reuses a stored Stripe customer — no customers.create', async () => {
    const { service, db, stripe } = makeService();
    db.query.plans.findFirst.mockResolvedValue(planRow());
    db.query.subscriptions.findFirst
      .mockResolvedValueOnce({ status: 'active', stripeSubscriptionId: null })
      .mockResolvedValueOnce({ id: 'sub-row-1', stripeCustomerId: 'cus_stored' });

    await service.createCheckout(input);

    expect(stripe.customers.create).not.toHaveBeenCalled();
    const [params] = stripe.checkout.sessions.create.mock.calls[0];
    expect(params.customer).toBe('cus_stored');
  });

  it('creates + persists a Stripe customer on first checkout', async () => {
    const { service, db, stripe } = makeService();
    db.query.plans.findFirst.mockResolvedValue(planRow());
    db.query.subscriptions.findFirst
      .mockResolvedValueOnce({ status: 'active', stripeSubscriptionId: null })
      .mockResolvedValueOnce({ id: 'sub-row-1', stripeCustomerId: null });
    db.query.users.findFirst.mockResolvedValue({
      email: 'user@example.com',
      name: 'Test User',
    });

    await service.createCheckout(input);

    expect(stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        metadata: { workspaceId: 'ws-1' },
      }),
      { idempotencyKey: 'customer:ws-1' },
    );
    expect(chainOf(db.update).set).toHaveBeenCalledWith({
      stripeCustomerId: 'cus_mock',
    });
    const [params] = stripe.checkout.sessions.create.mock.calls[0];
    expect(params.customer).toBe('cus_mock');
  });

  it('per-day idempotency key includes workspace, customer, plan, cycle', async () => {
    const { service, db, stripe } = makeService();
    db.query.plans.findFirst.mockResolvedValue(planRow());
    db.query.subscriptions.findFirst
      .mockResolvedValueOnce({ status: 'active', stripeSubscriptionId: null })
      .mockResolvedValueOnce({ id: 'sub-row-1', stripeCustomerId: 'cus_stored' });
    jest.useFakeTimers().setSystemTime(new Date('2026-01-15T12:00:00Z'));

    await service.createCheckout(input);
    jest.useRealTimers();

    const [, options] = stripe.checkout.sessions.create.mock.calls[0];
    expect(options).toEqual({
      idempotencyKey:
        'checkout:ws-1:cus_stored:pro:monthly:2026-01-15',
    });
  });

  it('classic Checkout by default; managed_payments only when opted in', async () => {
    const restore = setEnv({
      STRIPE_MANAGED_PAYMENTS: undefined,
      APP_URL: 'https://app.test',
    });
    const { service, db, stripe } = makeService();
    db.query.plans.findFirst.mockResolvedValue(planRow());
    db.query.subscriptions.findFirst
      .mockResolvedValueOnce({ status: 'active', stripeSubscriptionId: null })
      .mockResolvedValueOnce({ id: 'sub-row-1', stripeCustomerId: 'cus_stored' });

    await service.createCheckout(input);

    expect(stripe.checkout.sessions.create.mock.calls[0][0]).toMatchObject({
      managed_payments: { enabled: false },
    });
    restore();
  });

  it('STRIPE_MANAGED_PAYMENTS=true omits the managed_payments override', async () => {
    const restore = setEnv({
      STRIPE_MANAGED_PAYMENTS: 'true',
      APP_URL: 'https://app.test',
    });
    const { service, db, stripe } = makeService();
    db.query.plans.findFirst.mockResolvedValue(planRow());
    db.query.subscriptions.findFirst
      .mockResolvedValueOnce({ status: 'active', stripeSubscriptionId: null })
      .mockResolvedValueOnce({ id: 'sub-row-1', stripeCustomerId: 'cus_stored' });

    await service.createCheckout(input);

    expect(stripe.checkout.sessions.create.mock.calls[0][0]).not.toHaveProperty(
      'managed_payments',
    );
    restore();
  });

  it('safeUrl applies to success/cancel URLs (cross-origin rejected)', async () => {
    const restore = setEnv({ APP_URL: 'https://app.test' });
    const { service, db, stripe } = makeService();
    db.query.plans.findFirst.mockResolvedValue(planRow());
    db.query.subscriptions.findFirst
      .mockResolvedValueOnce({ status: 'active', stripeSubscriptionId: null })
      .mockResolvedValueOnce({ id: 'sub-row-1', stripeCustomerId: 'cus_stored' });

    await service.createCheckout({
      ...input,
      successUrl: 'https://evil.example/steal',
      cancelUrl: 'https://app.test/billing',
    });

    const [params] = stripe.checkout.sessions.create.mock.calls[0];
    expect(params.success_url).toBe('https://app.test/billing?checkout=success');
    expect(params.cancel_url).toBe('https://app.test/billing');
    restore();
  });
});

// ── getSubscription / listInvoices ───────────────────────────────────────────

describe('BillingService.getSubscription', () => {
  it('full view incl. a valid pendingDowngrade (scheduleId stripped)', async () => {
    const { service, db } = makeService();
    db.query.subscriptions.findFirst.mockResolvedValue({
      ...subRow({ pendingChange: null }),
      status: 'active',
      plan: planRow({ key: 'pro', name: 'Pro' }),
      pendingChange: {
        planKey: 'starter',
        planName: 'Starter',
        billingCycle: 'monthly',
        effectiveAt: '2026-02-01T00:00:00.000Z',
        scheduleId: 'sched_1',
      },
    });

    const view: SubscriptionView = await service.getSubscription('ws-1');

    expect(view).toMatchObject({
      planKey: 'pro',
      planName: 'Pro',
      status: 'active',
      cancelAtPeriodEnd: false,
      hasPaymentMethod: true,
    });
    expect(view.pendingDowngrade).toEqual({
      planKey: 'starter',
      planName: 'Starter',
      billingCycle: 'monthly',
      effectiveAt: '2026-02-01T00:00:00.000Z',
    });
  });

  it('malformed pendingChange → pendingDowngrade null, never surfaces', async () => {
    const { service, db } = makeService();
    db.query.subscriptions.findFirst.mockResolvedValue({
      ...subRow(),
      plan: planRow(),
      pendingChange: { planKey: 42, junk: true },
    });

    const view = await service.getSubscription('ws-1');
    expect(view.pendingDowngrade).toBeNull();
  });
});

describe('BillingService.listInvoices', () => {
  it('no Stripe customer → empty list without a Stripe call', async () => {
    const { service, db, stripe } = makeService();
    db.query.subscriptions.findFirst.mockResolvedValue({
      stripeCustomerId: null,
    });

    expect(await service.listInvoices('ws-1')).toEqual([]);
    expect(stripe.invoices.list).not.toHaveBeenCalled();
  });

  it('maps Stripe invoice fields onto the view', async () => {
    const { service, db, stripe } = makeService();
    db.query.subscriptions.findFirst.mockResolvedValue({
      stripeCustomerId: 'cus_mock',
    });
    stripe.invoices.list.mockResolvedValue({
      data: [
        {
          id: 'in_1',
          number: 'NR-1',
          amount_paid: 2900,
          currency: 'usd',
          status: 'paid',
          created: 1767225600,
          description: 'Pro monthly',
          hosted_invoice_url: 'https://invoice.example/1',
        },
      ],
    });

    const invoices = await service.listInvoices('ws-1');

    expect(stripe.invoices.list).toHaveBeenCalledWith({
      customer: 'cus_mock',
      limit: 20,
    });
    expect(invoices[0]).toEqual({
      id: 'in_1',
      number: 'NR-1',
      amountPaid: 2900,
      currency: 'usd',
      status: 'paid',
      createdAt: '2026-01-01T00:00:00.000Z',
      description: 'Pro monthly',
      url: 'https://invoice.example/1',
    });
  });
});
