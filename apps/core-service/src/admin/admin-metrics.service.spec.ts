import { AdminMetricsService } from './admin-metrics.service';
import { chain, asDb, createDbMock, serializeFragment } from '../testing/drizzle-mock';
import * as schema from '../db/schema';

const { contentEntries } = schema;

function makeService() {
  const db = createDbMock();
  const service = new AdminMetricsService(asDb(db));
  return { service, db };
}

describe('AdminMetricsService.content — platform totals', () => {
  it('merges entry counts, published subset, and media bytes (numeric coercion)', async () => {
    const { service, db } = makeService();
    // Promise.all order: total entries, published, media sum.
    db.$count.mockResolvedValueOnce(120).mockResolvedValueOnce(84);
    db.select.mockImplementationOnce(() => chain([{ total: '5368709120' }]));

    const metrics = await service.content();

    expect(metrics).toEqual({ entries: 120, published: 84, mediaBytes: 5368709120 });
    expect(typeof metrics.mediaBytes).toBe('number'); // '5368709120' the string would break the dashboard
  });

  it('empty media table → 0 bytes, not a crash', async () => {
    const { service, db } = makeService();
    db.$count.mockResolvedValue(0);
    db.select.mockImplementationOnce(() => chain([])); // no aggregate row

    const metrics = await service.content();
    expect(metrics.mediaBytes).toBe(0);
  });

  it('published count is scoped to non-deleted published entries', async () => {
    const { service, db } = makeService();
    db.$count.mockResolvedValue(0);
    db.select.mockImplementationOnce(() => chain([]));

    await service.content();

    expect(db.$count).toHaveBeenCalledWith(contentEntries, expect.anything());
    const publishedWhere = serializeFragment(db.$count.mock.calls[1][1]);
    expect(publishedWhere).toContain('published');
    expect(publishedWhere).toContain('deleted');
  });
});
