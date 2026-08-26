import { sql } from 'drizzle-orm';
import * as schema from '../../src/db/schema';
import { startTestDb, type TestDb } from './test-db';

const { users } = schema;

/**
 * Infra smoke: proves the container boots, the REAL migrations apply, and
 * truncate() wipes between tests. Everything else in this tree builds on this.
 */
jest.setTimeout(30_000);

describe('integration test-db infrastructure', () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 120_000);

  afterAll(async () => {
    await testDb?.stop();
  });

  it('migrations created the auth_svc schema with its journal', async () => {
    const journal = await testDb.db.execute<{ count: string }>(
      sql`select count(*)::text as count from drizzle.__drizzle_migrations_auth`,
    );
    expect(Number(journal[0].count)).toBeGreaterThanOrEqual(5);
  });

  it('writes and truncates real rows', async () => {
    await testDb.db.insert(users).values({
      email: 'smoke@example.com',
      name: 'Smoke',
      passwordHash: 'x',
    });
    const before = await testDb.db.execute<{ count: string }>(
      sql`select count(*)::text as count from auth_svc.users`,
    );
    expect(Number(before[0].count)).toBe(1);

    await testDb.truncate();

    const after = await testDb.db.execute<{ count: string }>(
      sql`select count(*)::text as count from auth_svc.users`,
    );
    expect(Number(after[0].count)).toBe(0);
  });
});
