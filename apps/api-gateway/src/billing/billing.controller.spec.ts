import { of } from 'rxjs';
import * as contracts from '@wriven/contracts';
import { BillingController } from './billing.controller';
import { computeDowngradeBlocks } from './downgrade.guard';

/**
 * assertDowngradeAllowed orchestration — the gateway is the SOLE downgrade
 * gate (auth-service's swapPlan checks no limits), so its ranking, passthrough,
 * and stats-composition branches must fail tests when they regress. The pure
 * half (computeDowngradeBlocks) is covered in downgrade.guard.spec.ts.
 */

function plan(key: string, sortOrder: number, limits: contracts.PlanLimits) {
  return {
    key,
    sortOrder,
    limits,
    isPublic: true,
  } as contracts.PlanView;
}

const FREE = plan('free', 0, { projects: 1, members: 2 } as contracts.PlanLimits);
const STARTER = plan('starter', 1, { projects: 3, members: 5 } as contracts.PlanLimits);
const PRO = plan('pro', 2, { projects: 10, members: 10 } as contracts.PlanLimits);

function sub(planKey: string) {
  return { planKey } as contracts.SubscriptionView;
}

function stats(over: Partial<contracts.WorkspaceStatsView>) {
  return over as contracts.WorkspaceStatsView;
}

function makeController(opts: {
  plans?: contracts.PlanView[];
  subscription?: contracts.SubscriptionView;
  stats?: contracts.WorkspaceStatsView;
} = {}) {
  const send = jest.fn((pattern: unknown) => {
    if (pattern === contracts.BILLING_PATTERNS.LIST_PLANS) {
      return of(opts.plans ?? [FREE, STARTER, PRO]);
    }
    if (pattern === contracts.BILLING_PATTERNS.GET_SUBSCRIPTION) {
      return of(opts.subscription ?? sub('pro'));
    }
    if (pattern === contracts.BILLING_PATTERNS.SWAP_PLAN) {
      return of({
        planName: 'Starter',
        billingCycle: 'monthly',
      } as contracts.SubscriptionView);
    }
    throw new Error(`unexpected pattern ${String(pattern)}`);
  });
  const auth = { send } as never;
  const usage = {
    compose: jest.fn().mockResolvedValue(
      opts.stats ?? stats({ projects: 2, members: 3 }),
    ),
  };
  const controller = new BillingController(auth, usage as never);
  return { controller, send, usage };
}

const user = { userId: 'u1' } as contracts.AuthUser;
const swap = { planKey: 'starter', billingCycle: 'monthly' } as contracts.SwapPlanDto;

describe('BillingController.swapPlan — the downgrade gate', () => {
  it('over-limit downgrade → DOWNGRADE_BLOCKED naming the excess, SWAP never sent', async () => {
    const { controller, send, usage } = makeController({
      subscription: sub('pro'),
      stats: stats({ projects: 20, members: 3 }), // starter allows 3
    });

    await expect(controller.swapPlan(user, 'ws-1', swap, {} as never)).rejects.toMatchObject(
      {
        code: contracts.ERROR_CODES.DOWNGRADE_BLOCKED.code,
      },
    );
    expect(usage.compose).toHaveBeenCalledWith('ws-1');
    expect(
      send.mock.calls.some((c) => c[0] === contracts.BILLING_PATTERNS.SWAP_PLAN),
    ).toBe(false); // never reached auth — no half-applied swap
  });

  it('within-limit downgrade → passes through to SWAP_PLAN with logMeta', async () => {
    const { controller, send, usage } = makeController({
      subscription: sub('pro'),
      stats: stats({ projects: 2, members: 3 }),
    });
    const req: { logMeta?: unknown } = {};

    await controller.swapPlan(user, 'ws-1', swap, req as never);

    expect(usage.compose).toHaveBeenCalledTimes(1);
    const swapCall = send.mock.calls.find(
      (c) => c[0] === contracts.BILLING_PATTERNS.SWAP_PLAN,
    ) as unknown[][];
    expect((swapCall?.[1] as unknown as { workspaceId: string }).workspaceId).toBe('ws-1');
    expect(req.logMeta).toEqual({ plan: 'Starter', cycle: 'monthly' });
  });

  it('upgrade (higher sortOrder) → gate skipped, no stats composition', async () => {
    const { controller, usage } = makeController({ subscription: sub('starter') });

    await controller.swapPlan(user, 'ws-1', { planKey: 'pro' } as never, {} as never);

    expect(usage.compose).not.toHaveBeenCalled();
  });

  it('same-tier / cycle-switch → gate skipped', async () => {
    const { controller, usage } = makeController({ subscription: sub('starter') });

    await controller.swapPlan(
      user,
      'ws-1',
      { planKey: 'starter', billingCycle: 'yearly' } as never,
      {} as never,
    );

    expect(usage.compose).not.toHaveBeenCalled();
  });

  it('unknown plan key → passes through (auth-service decides)', async () => {
    const { controller, usage } = makeController({ subscription: sub('pro') });

    await controller.swapPlan(user, 'ws-1', { planKey: 'mystery' } as never, {} as never);

    expect(usage.compose).not.toHaveBeenCalled();
  });

  it('current plan not in the catalog → passes through, cannot rank tiers', async () => {
    const { controller, usage } = makeController({
      subscription: sub('legacy-plan'),
    });

    await controller.swapPlan(user, 'ws-1', { planKey: 'free' } as never, {} as never);

    expect(usage.compose).not.toHaveBeenCalled();
  });

  it('exactly-at-limit downgrade is allowed (the boundary is >, not >=)', async () => {
    const { controller, usage } = makeController({
      subscription: sub('pro'),
      stats: stats({ projects: 3, members: 5 }), // exactly starter's caps
    });

    await controller.swapPlan(user, 'ws-1', swap, {} as never);

    expect(usage.compose).toHaveBeenCalledTimes(1); // gate ran, found nothing to block
  });
});

describe('gate consistency — the pure half agrees with the orchestration', () => {
  it('computeDowngradeBlocks blocks exactly what the controller throws on', () => {
    const limits = STARTER.limits;
    const over = stats({ projects: 4, members: 5 });
    expect(computeDowngradeBlocks(over, limits).length).toBeGreaterThan(0);
    const atCap = stats({ projects: 3, members: 5 });
    expect(computeDowngradeBlocks(atCap, limits)).toEqual([]);
  });
});
