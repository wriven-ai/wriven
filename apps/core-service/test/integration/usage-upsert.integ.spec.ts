import { eq } from 'drizzle-orm';
import { UsageService } from '../../src/usage/usage.service';
import type { CoreEntitlementsService } from '../../src/entitlements/core-entitlements.service';
import * as schema from '../../src/db/schema';
import { startTestDb, type TestDb } from './test-db';

jest.setTimeout(30_000);

let testDb: TestDb;
let service: UsageService;

const bucket = (overrides: Record<string, unknown> = {}) => ({
  workspaceId: '11111111-1111-4111-8111-111111111111',
  periodStart: '2026-08-01T00:00:00.000Z',
  periodEnd: '2026-09-01T00:00:00.000Z',
  requestCount: 3,
  ...overrides,
});

beforeAll(async () => {
  testDb = await startTestDb();
  const entitlements = { effectiveLimits: jest.fn().mockResolvedValue({}) };
  service = new UsageService(testDb.db, entitlements as unknown as CoreEntitlementsService);
});

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(async () => {
  await testDb.truncate();
});

const WS = '11111111-1111-4111-8111-111111111111';
const WS_OTHER = '22222222-2222-4222-8222-222222222222';

describe('UsageService.record — real upsert against Postgres', () => {
  it('repeat flushes ACCUMULATE on the unique (workspace, period) row — never overwrite', async () => {
    await service.record({ buckets: [bucket()] });
    await service.record({ buckets: [bucket({ requestCount: 4 })] });
    await service.record({ buckets: [bucket({ requestCount: 5 })] });

    const rows = await testDb.db
      .select()
      .from(schema.usageBuckets)
      .where(eq(schema.usageBuckets.workspaceId, WS));

    expect(rows).toHaveLength(1); // the unique index collapsed the flushes
    expect(rows[0].requestCount).toBe(12); // 3 + 4 + 5, not 5
  });

  it('a different period lands in its own row; a different workspace is fully isolated', async () => {
    await service.record({
      buckets: [
        bucket(),
        bucket({ periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2026-10-01T00:00:00.000Z' }),
        bucket({ workspaceId: WS_OTHER, requestCount: 7 }),
      ],
    });

    const rows = await testDb.db.select().from(schema.usageBuckets);
    expect(rows).toHaveLength(3);

    const aug = rows.find((r) => r.periodStart.toISOString() === '2026-08-01T00:00:00.000Z');
    expect(aug?.workspaceId).toBe(WS);
    expect(aug?.requestCount).toBe(3);
    const other = rows.find((r) => r.workspaceId === WS_OTHER);
    expect(other?.requestCount).toBe(7);
  });
});

describe('UsageService.read — composes the real rows', () => {
  it('sums the current-period bucket into the usage view', async () => {
    const now = new Date();
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    await service.record({
      buckets: [
        {
          workspaceId: WS,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          requestCount: 9,
        },
      ],
    });

    const view = await service.read({ workspaceId: WS });

    expect(view.requests.used).toBe(9);
    expect(view.period.start).toBe(periodStart.toISOString());
  });
});
