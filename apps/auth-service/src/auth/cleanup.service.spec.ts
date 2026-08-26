import { CleanupService } from './cleanup.service';
import * as schema from '../db/schema';
import { writeChain, asDb, chainOf, createDbMock, serializeFragment } from '../testing/drizzle-mock';import { setEnv } from '../testing/env';

const { refreshTokens, passwordResetTokens, emailVerificationTokens, workspaceActivityLog } =
  schema;

const NOW = new Date('2026-01-01T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function makeService() {
  const db = createDbMock();
  const service = new CleanupService(asDb(db));
  return { service, db };
}

/** Serialized where-fragment of the first delete chain — bound params assertable. */
function whereSerialized(deleteMock: jest.Mock): string {
  return serializeFragment(chainOf(deleteMock).where.mock.calls[0][0]);
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env.WORKSPACE_LOG_RETENTION_DAYS;
});

describe('CleanupService.pruneExpiredTokens', () => {
  it('deletes expired rows from all three token tables', async () => {
    const { service, db } = makeService();
    db.delete.mockImplementation(() => writeChain([{ id: 'x' }]));

    await service.pruneExpiredTokens();

    expect(db.delete.mock.calls.map((c) => c[0])).toEqual([
      refreshTokens,
      passwordResetTokens,
      emailVerificationTokens,
    ]);
    expect(db.delete).toHaveBeenCalledTimes(3);
  });
});

describe('CleanupService.pruneActivityLogs', () => {
  it('cuts off at exactly now − retention days', async () => {
    const { service, db } = makeService();
    db.delete.mockImplementation(() => writeChain([]));
    setEnv({ WORKSPACE_LOG_RETENTION_DAYS: '30' });

    await service.pruneActivityLogs();

    expect(db.delete).toHaveBeenCalledWith(workspaceActivityLog);
    const expected = new Date(NOW.getTime() - 30 * DAY).toISOString();
    expect(whereSerialized(db.delete)).toContain(expected);
  });

  it('garbage retention env falls back to 90 days', async () => {
    const { service, db } = makeService();
    db.delete.mockImplementation(() => writeChain([]));
    setEnv({ WORKSPACE_LOG_RETENTION_DAYS: 'not-a-number' });

    await service.pruneActivityLogs();

    const expected = new Date(NOW.getTime() - 90 * DAY).toISOString();
    expect(whereSerialized(db.delete)).toContain(expected);
  });

  it('zero/negative retention also falls back to 90 days', async () => {
    const { service, db } = makeService();
    db.delete.mockImplementation(() => writeChain([]));
    setEnv({ WORKSPACE_LOG_RETENTION_DAYS: '-5' });

    await service.pruneActivityLogs();

    const expected = new Date(NOW.getTime() - 90 * DAY).toISOString();
    expect(whereSerialized(db.delete)).toContain(expected);
  });
});
