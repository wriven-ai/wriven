import { AdminProjectUsageService } from './admin-project-usage.service';
import { chain, asDb, createDbMock, serializeFragment } from '../testing/drizzle-mock';

function makeService() {
  const db = createDbMock();
  const service = new AdminProjectUsageService(asDb(db));
  return { service, db };
}

describe('AdminProjectUsageService.get — project detail screen', () => {
  it('assembles the nested usage view from 13 parallel queries (numeric coercion)', async () => {
    const { service, db } = makeService();
    // $count call order: types, entries total, published, draft, archived,
    // apiKeys total, apiKeys active, webhooks total, webhooks active,
    // ai succeeded, ai failed.
    [
      3, // content types
      40, // entries total
      25, // published
      10, // draft
      5, // archived
      4, // api keys total
      3, // api keys active
      2, // webhooks total
      1, // webhooks active
      7, // ai succeeded
      2, // ai failed
    ].forEach((n) => db.$count.mockResolvedValueOnce(n));
    // select call order: media aggregate, ai aggregate.
    db.select
      .mockImplementationOnce(() => chain([{ assets: '12', bytes: '999999' }]))
      .mockImplementationOnce(() => chain([{ generations: '9', tokens: '42000', cost: '1375' }]));

    const usage = await service.get({ projectId: 'p-1' });

    expect(usage).toEqual({
      projectId: 'p-1',
      contentTypes: 3,
      entries: { total: 40, published: 25, draft: 10, archived: 5 },
      media: { assetCount: 12, totalBytes: 999999 },
      apiKeys: { total: 4, active: 3 },
      webhooks: { total: 2, active: 1 },
      ai: {
        generations: 9,
        succeeded: 7,
        failed: 2,
        totalTokens: 42000,
        costMicrousd: 1375,
      },
    });
    expect(db.$count).toHaveBeenCalledTimes(11);
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('null AI cost passes through as null (no generations billed yet)', async () => {
    const { service, db } = makeService();
    db.$count.mockResolvedValue(0);
    db.select
      .mockImplementationOnce(() => chain([{ assets: '0', bytes: '0' }]))
      .mockImplementationOnce(() => chain([{ generations: '0', tokens: '0', cost: null }]));

    const usage = await service.get({ projectId: 'p-1' });

    expect(usage.ai.costMicrousd).toBeNull();
    expect(usage.media.assetCount).toBe(0);
  });

  it('every count predicate is scoped to the requested project', async () => {
    const { service, db } = makeService();
    db.$count.mockResolvedValue(0);
    db.select
      .mockImplementationOnce(() => chain([]))
      .mockImplementationOnce(() => chain([]));

    await service.get({ projectId: 'p-42' });

    // A missing projectId in ANY predicate would cross-count projects.
    for (const call of db.$count.mock.calls) {
      const where = serializeFragment(call[1]);
      expect(where).toContain('p-42');
    }
  });
});
