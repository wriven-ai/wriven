import { AdminMetricsService } from './admin-metrics.service';
import { chain, asDb, createDbMock } from '../testing/drizzle-mock';
import { planRow } from '../testing/fixtures';

function makeService() {
  const db = createDbMock();
  const service = new AdminMetricsService(asDb(db));
  return { service, db };
}

describe('AdminMetricsService.auth — platform counts', () => {
  it('aggregates user/workspace/project counts and the plan breakdown', async () => {
    const { service, db } = makeService();
    db.$count
      .mockImplementationOnce(() => Promise.resolve(100)) // users total
      .mockImplementationOnce(() => Promise.resolve(80)) // users verified
      .mockImplementationOnce(() => Promise.resolve(10)) // workspaces
      .mockImplementationOnce(() => Promise.resolve(7)); // active projects
    db.query.plans.findMany.mockResolvedValue([
      planRow({ id: 'plan-pro', key: 'pro', name: 'Pro' }),
      planRow({ id: 'plan-free', key: 'free', name: 'Free' }),
    ]);
    db.select.mockImplementationOnce(() => chain([{ planId: 'plan-pro', c: 3 }]));

    const metrics = await service.auth();

    expect(metrics).toEqual({
      users: { total: 100, verified: 80 },
      workspaces: { total: 10 },
      projects: { total: 7 },
      plans: [
        { key: 'pro', name: 'Pro', count: 3 },
        // 7 workspaces with no subscription row default to free.
        { key: 'free', name: 'Free', count: 7 },
      ],
    });
  });

  it('fully-assigned workspaces add nothing to the free bucket', async () => {
    const { service, db } = makeService();
    db.$count
      .mockImplementationOnce(() => Promise.resolve(50))
      .mockImplementationOnce(() => Promise.resolve(50))
      .mockImplementationOnce(() => Promise.resolve(4))
      .mockImplementationOnce(() => Promise.resolve(2));
    db.query.plans.findMany.mockResolvedValue([
      planRow({ id: 'plan-pro', key: 'pro', name: 'Pro' }),
      planRow({ id: 'plan-free', key: 'free', name: 'Free' }),
    ]);
    db.select.mockImplementationOnce(() => chain([{ planId: 'plan-pro', c: 4 }]));

    const metrics = await service.auth();

    expect(metrics.plans).toEqual([
      { key: 'pro', name: 'Pro', count: 4 },
      { key: 'free', name: 'Free', count: 0 },
    ]);
  });
});
