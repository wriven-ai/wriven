import { Logger } from '@nestjs/common';
import { UsageService } from './usage.service';
import type { CoreEntitlementsService } from '../entitlements/core-entitlements.service';
import { writeChain, asDb, chain, chainOf, createDbMock, serializeFragment } from '../testing/drizzle-mock';

beforeAll(() => {
  Logger.overrideLogger([]);
});

function makeService(limits: Record<string, number | null> = {}) {
  const db = createDbMock();
  const entitlements = {
    effectiveLimits: jest.fn().mockResolvedValue(limits),
  };
  const service = new UsageService(asDb(db), entitlements as unknown as CoreEntitlementsService);
  return { service, db, entitlements };
}

function bucket(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: 'ws-1',
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-09-01T00:00:00.000Z',
    requestCount: 3,
    ...overrides,
  };
}

describe('UsageService.record — batched upsert', () => {
  it('upserts each bucket on the (workspace, period) conflict with an increment', async () => {
    const { service, db } = makeService();
    db.insert.mockImplementation(() => writeChain([]));

    await service.record({ buckets: [bucket(), bucket({ workspaceId: 'ws-2' })] });

    expect(db.insert.mock.calls).toHaveLength(2);
    const values = chainOf(db.insert).values.mock.calls[0][0] as Record<string, unknown>;
    expect(values).toMatchObject({ workspaceId: 'ws-1', requestCount: 3 });
    // The upsert set is a SQL increment (request_count + n), never an
    // overwrite — an overwrite silently switches Delivery-API metering to
    // last-flush-wins and undercounts usage that feeds plan-limit views.
    const upsert = chainOf(db.insert).onConflictDoUpdate.mock.calls[0][0] as {
      target: unknown[];
      set: unknown;
    };
    const setFragment = serializeFragment(upsert.set);
    expect(setFragment).toContain('requestCount');
    expect(setFragment).toContain(' + ');
    expect(setFragment).toContain('3'); // the bound increment param
    // Conflict target: the (workspace, period) bucket identity.
    expect(upsert.target).toHaveLength(2);
  });

  it('one failed bucket never drops the rest (per-bucket isolation)', async () => {
    const { service, db } = makeService();
    db.insert
      .mockImplementationOnce(() => {
        throw new Error('constraint');
      })
      .mockImplementationOnce(() => writeChain([]));

    const result = await service.record({ buckets: [bucket(), bucket({ workspaceId: 'ws-2' })] });

    expect(result).toEqual({ success: true }); // resolves despite the failure
    expect(db.insert).toHaveBeenCalledTimes(2);
  });
});

describe('UsageService.read — period composition', () => {
  it('defaults to 0 requests when no bucket exists, storage summed to MB, limits merged', async () => {
    const { service, db } = makeService({
      apiRequestsPerMonth: 50_000,
      storageMb: 100,
      aiTextRequestsPerMonth: 250,
    });
    // Promise.all order: bucket query (query map), storageSum select, aiUsage select.
    db.select
      .mockImplementationOnce(() => chain([{ total: String(1.5 * 1024 * 1024) }])) // storage
      .mockImplementationOnce(() =>
        chain([
          {
            used: 3,
            prompt: '100',
            completion: '50',
            total: '150',
            cost: '2500',
            unpriced: 0,
          },
        ]),
      );

    const view = await service.read({ workspaceId: 'ws-1' });

    expect(view.requests).toEqual({ used: 0, limit: 50_000 }); // no bucket row
    expect(view.storage).toEqual({ usedMb: 2, limitMb: 100 }); // 1.5MB rounds up
    expect(view.ai.requests).toEqual({ used: 3, limit: 250 }); // limit merged from plan
    expect(view.ai.tokens).toEqual({ prompt: 100, completion: 50, total: 150 });
    expect(view.ai.cost).toEqual({ microusd: 2500, complete: true, unpricedGenerations: 0 });
    expect(view.period.start).toMatch(/^2026-0[89]-01T00:00:00/); // real current period
  });

  it('unpriced generations flag the period cost as incomplete', async () => {
    const { service, db } = makeService();
    db.select
      .mockImplementationOnce(() => chain([{ total: '0' }]))
      .mockImplementationOnce(() =>
        chain([{ used: 1, prompt: '0', completion: '0', total: '10', cost: '0', unpriced: 2 }]),
      );

    const view = await service.read({ workspaceId: 'ws-1' });

    expect(view.ai.cost).toEqual({ microusd: 0, complete: false, unpricedGenerations: 2 });
  });

  it('unresolvable limits (fail-open) read as unlimited', async () => {
    const { service, db } = makeService(null as never); // effectiveLimits → null
    db.select
      .mockImplementationOnce(() => chain([{ total: '0' }]))
      .mockImplementationOnce(() =>
        chain([{ used: 0, prompt: '0', completion: '0', total: '0', cost: '0', unpriced: 0 }]),
      );

    const view = await service.read({ workspaceId: 'ws-1' });

    expect(view.requests.limit).toBeNull();
    expect(view.storage.limitMb).toBeNull();
    expect(view.ai.requests.limit).toBeNull();
  });
});
