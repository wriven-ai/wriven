import { ERROR_CODES, PlanLimits } from '@wriven/contracts';
import { EntitlementsService } from './entitlements.service';
import { chain, asDb, chainOf, createDbMock } from '../testing/drizzle-mock';
import { setEnv } from '../testing/env';
import { planRow, subRow } from '../testing/fixtures';

const PRO_LIMITS: PlanLimits = { projects: 10, members: 10 };
const FREE_LIMITS: PlanLimits = { projects: 2, members: 3 };

function makeService() {
  const db = createDbMock();
  const service = new EntitlementsService(asDb(db));
  return { service, db, tx: db.__tx };
}

/** Wire resolveLimits inputs: the subscription row (with plan) + the free plan. */
function wirePlans(
  db: ReturnType<typeof createDbMock>,
  opts: {
    sub?: Record<string, unknown> | null;
    free?: Record<string, unknown> | null;
  },
) {
  db.query.subscriptions.findFirst.mockResolvedValue(opts.sub ?? null);
  db.query.plans.findFirst.mockResolvedValue(opts.free ?? null);
}

const DAY = 86_400_000;

describe('EntitlementsService.resolveLimits', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('merges plan limits with the subscription overrides', async () => {
    const { service, db } = makeService();
    wirePlans(db, {
      sub: {
        ...subRow(),
        status: 'active',
        overrides: { projects: 5 },
        plan: planRow({ limits: PRO_LIMITS }),
      },
      free: null,
    });

    const result = await service.resolveLimits('ws-1');

    expect(result).toEqual({
      planKey: 'pro',
      limits: { projects: 5, members: 10 },
    });
  });

  it('no subscription → the free plan', async () => {
    const { service, db } = makeService();
    wirePlans(db, {
      sub: null,
      free: planRow({ key: 'free', limits: FREE_LIMITS }),
    });

    const result = await service.resolveLimits('ws-1');
    expect(result.planKey).toBe('free');
    expect(result.limits.projects).toBe(2);
  });

  it('plan with empty limits falls through to the free plan', async () => {
    const { service, db } = makeService();
    wirePlans(db, {
      sub: { ...subRow(), plan: planRow({ limits: {} }) },
      free: planRow({ key: 'free', limits: FREE_LIMITS }),
    });

    const result = await service.resolveLimits('ws-1');
    expect(result.planKey).toBe('free');
    expect(result.limits.projects).toBe(2);
  });

  it('fail-closed: even the free plan missing → baked-in FREE_FALLBACK', async () => {
    const { service, db } = makeService();
    wirePlans(db, { sub: null, free: null });

    const result = await service.resolveLimits('ws-1');

    expect(result.planKey).toBe('free');
    expect(result.limits).toEqual({
      projects: 2,
      members: 3,
      environments: 1,
      contentTypes: 10,
      entries: 1000,
      locales: 1,
      storageMb: 100,
      assetBandwidthGb: 10,
      apiRequestsPerMonth: 100_000,
      apiKeys: 3,
      webhooks: 2,
    });
  });

  it('canceled subscription collapses to the free plan', async () => {
    const { service, db } = makeService();
    wirePlans(db, {
      sub: {
        ...subRow(),
        status: 'canceled',
        overrides: null,
        plan: planRow({ limits: PRO_LIMITS }),
      },
      free: planRow({ key: 'free', limits: FREE_LIMITS }),
    });

    const result = await service.resolveLimits('ws-1');
    expect(result.planKey).toBe('free');
    expect(result.limits.projects).toBe(2);
  });

  it('past_due within the grace window keeps paid limits', async () => {
    const { service, db } = makeService();
    jest.useFakeTimers().setSystemTime(new Date('2026-01-15T00:00:00Z'));
    wirePlans(db, {
      sub: {
        ...subRow(),
        status: 'past_due',
        overrides: null,
        currentPeriodEnd: new Date(Date.now() + 3 * DAY), // grace default: 7d
        plan: planRow({ limits: PRO_LIMITS }),
      },
      free: null,
    });

    const result = await service.resolveLimits('ws-1');
    expect(result.planKey).toBe('pro');
    expect(result.limits.projects).toBe(10);
  });

  it('past_due past the grace window collapses to free (boundary)', async () => {
    const { service, db } = makeService();
    jest.useFakeTimers().setSystemTime(new Date('2026-01-15T00:00:00Z'));
    wirePlans(db, {
      sub: {
        ...subRow(),
        status: 'past_due',
        overrides: null,
        currentPeriodEnd: new Date(Date.now() - 8 * DAY),
        plan: planRow({ limits: PRO_LIMITS }),
      },
      free: planRow({ key: 'free', limits: FREE_LIMITS }),
    });

    const result = await service.resolveLimits('ws-1');
    expect(result.planKey).toBe('free');
    expect(result.limits.projects).toBe(2);
  });

  it('past_due with a null currentPeriodEnd keeps paid limits', async () => {
    const { service, db } = makeService();
    wirePlans(db, {
      sub: {
        ...subRow(),
        status: 'past_due',
        overrides: null,
        currentPeriodEnd: null,
        plan: planRow({ limits: PRO_LIMITS }),
      },
      free: null,
    });

    const result = await service.resolveLimits('ws-1');
    expect(result.planKey).toBe('pro');
  });

  it('BILLING_GRACE_DAYS env override widens the window', async () => {
    const restore = setEnv({ BILLING_GRACE_DAYS: '30' });
    const { service, db } = makeService();
    jest.useFakeTimers().setSystemTime(new Date('2026-01-15T00:00:00Z'));
    wirePlans(db, {
      sub: {
        ...subRow(),
        status: 'incomplete',
        overrides: null,
        currentPeriodEnd: new Date(Date.now() - 8 * DAY), // inside 30d
        plan: planRow({ limits: PRO_LIMITS }),
      },
      free: null,
    });

    const result = await service.resolveLimits('ws-1');
    restore();

    expect(result.planKey).toBe('pro');
  });

  it('overrides still apply on top of the collapsed free limits', async () => {
    const { service, db } = makeService();
    wirePlans(db, {
      sub: {
        ...subRow(),
        status: 'canceled',
        overrides: { projects: 99 },
        plan: planRow({ limits: PRO_LIMITS }),
      },
      free: planRow({ key: 'free', limits: FREE_LIMITS }),
    });

    const result = await service.resolveLimits('ws-1');
    expect(result.planKey).toBe('free');
    expect(result.limits.projects).toBe(99); // admin bump survives the collapse
    expect(result.limits.members).toBe(3);
  });
});

describe('EntitlementsService.usage', () => {
  it('counts non-deleted projects and members', async () => {
    const { service, db } = makeService();
    db.$count.mockResolvedValueOnce(3).mockResolvedValueOnce(5);

    expect(await service.usage('ws-1')).toEqual({ projects: 3, members: 5 });
    expect(db.$count).toHaveBeenCalledTimes(2);
  });
});

describe('EntitlementsService.assertProjectQuotaTx', () => {
  const workspaceId = 'ws-1';

  function wireLimit(db: ReturnType<typeof createDbMock>, projects: number | null) {
    db.query.subscriptions.findFirst.mockResolvedValue({
      ...subRow(),
      status: 'active',
      overrides: null,
      plan: planRow({ limits: { projects: projects ?? undefined, members: 10 } }),
    });
  }

  it('null limit = unlimited: no lock, no count, no throw', async () => {
    const { service, db, tx } = makeService();
    wireLimit(db, null);

    await service.assertProjectQuotaTx(tx as never, workspaceId);

    expect(tx.execute).not.toHaveBeenCalled();
    expect(tx.select).not.toHaveBeenCalled();
  });

  it('at the limit → PLAN_LIMIT_REACHED (plural)', async () => {
    const { service, db, tx } = makeService();
    wireLimit(db, 2);
    tx.select.mockImplementationOnce(() => chain([{ value: 2 }]));

    try {
      await service.assertProjectQuotaTx(tx as never, workspaceId);
      throw new Error('expected rejection');
    } catch (e) {
      const payload = (
        e as { getError: () => { code: string; message: string } }
      ).getError();
      expect(payload.code).toBe(ERROR_CODES.PLAN_LIMIT_REACHED.code);
      expect(payload.message).toContain('allows 2 projects');
    }
    expect(tx.execute).toHaveBeenCalledTimes(1); // advisory lock taken
  });

  it('under the limit → passes with the advisory lock held', async () => {
    const { service, db, tx } = makeService();
    wireLimit(db, 2);
    tx.select.mockImplementationOnce(() => chain([{ value: 1 }]));

    await service.assertProjectQuotaTx(tx as never, workspaceId);

    expect(tx.execute).toHaveBeenCalledTimes(1);
  });
});

describe('EntitlementsService.assertMemberQuotaTx', () => {
  it('at the limit → PLAN_LIMIT_REACHED (singular)', async () => {
    const { service, db, tx } = makeService();
    db.query.subscriptions.findFirst.mockResolvedValue({
      ...subRow(),
      status: 'active',
      overrides: null,
      plan: planRow({ limits: { projects: 10, members: 1 } }),
    });
    tx.select.mockImplementationOnce(() => chain([{ value: 1 }]));

    try {
      await service.assertMemberQuotaTx(tx as never, 'ws-1');
      throw new Error('expected rejection');
    } catch (e) {
      const payload = (e as { getError: () => { code: string; message: string } }).getError();
      expect(payload.code).toBe(ERROR_CODES.PLAN_LIMIT_REACHED.code);
      expect(payload.message).toContain('allows 1 member.');
    }
    expect(chainOf(tx.select).from).toHaveBeenCalled();
  });
});
