import { eq, sql } from 'drizzle-orm';
import { CleanupService } from '../../src/auth/cleanup.service';
import * as schema from '../../src/db/schema';
import { startTestDb, type TestDb } from './test-db';

const {
  users,
  workspaces,
  workspaceMembers,
  refreshTokens,
  passwordResetTokens,
  emailVerificationTokens,
  workspaceActivityLog,
} = schema;

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const WS_ID = '33333333-3333-4333-8333-333333333333';

jest.setTimeout(30_000);

let testDb: TestDb;
let db: TestDb['db'];
let service: CleanupService;

beforeAll(async () => {
  testDb = await startTestDb();
  db = testDb.db;
  service = new CleanupService(db);
}, 120_000);

afterAll(async () => {
  await testDb?.stop();
  delete process.env.WORKSPACE_LOG_RETENTION_DAYS;
});

beforeEach(async () => {
  await testDb.truncate();
  await db.insert(users).values({ id: OWNER_ID, email: 'owner@example.com', name: 'Owner', passwordHash: 'x' });
  await db.insert(workspaces).values({ id: WS_ID, name: 'Acme', slug: 'acme', createdBy: OWNER_ID });
  await db.insert(workspaceMembers).values({ workspaceId: WS_ID, userId: OWNER_ID, role: 'owner' });
});

async function count(table: string): Promise<number> {
  const rows = await db.execute<{ count: string }>(
    sql.raw(`select count(*)::text as count from auth_svc.${table}`),
  );
  return Number(rows[0].count);
}

const DAY = 86_400_000;

describe('CleanupService.pruneExpiredTokens — real lt(expiresAt, now)', () => {
  it('deletes exactly the expired rows; revoked-but-unexpired refresh tokens survive', async () => {
    await db.insert(refreshTokens).values([
      { tokenHash: 'refresh-expired', userId: OWNER_ID, expiresAt: new Date(Date.now() - DAY) },
      { tokenHash: 'refresh-live', userId: OWNER_ID, expiresAt: new Date(Date.now() + DAY) },
      // Revoked for theft detection, but still inside its TTL — must be KEPT
      // so reuse can be detected (documented behavior).
      {
        tokenHash: 'refresh-revoked-live',
        userId: OWNER_ID,
        expiresAt: new Date(Date.now() + DAY),
        revoked: true,
      },
    ]);
    await db.insert(passwordResetTokens).values([
      { tokenHash: 'reset-expired', userId: OWNER_ID, expiresAt: new Date(Date.now() - DAY) },
      { tokenHash: 'reset-live', userId: OWNER_ID, expiresAt: new Date(Date.now() + DAY) },
    ]);
    await db.insert(emailVerificationTokens).values([
      { tokenHash: 'verify-expired', userId: OWNER_ID, expiresAt: new Date(Date.now() - DAY) },
      { tokenHash: 'verify-live', userId: OWNER_ID, expiresAt: new Date(Date.now() + DAY) },
    ]);

    await service.pruneExpiredTokens();

    expect(await count('refresh_tokens')).toBe(2); // live + revoked-live
    expect(await count('password_reset_tokens')).toBe(1);
    expect(await count('email_verification_tokens')).toBe(1);
    const kept = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, 'refresh-revoked-live'));
    expect(kept).toHaveLength(1);
  });
});

describe('CleanupService.pruneActivityLogs — retention window', () => {
  async function seedLogs() {
    await db.insert(workspaceActivityLog).values([
      { workspaceId: WS_ID, userId: OWNER_ID, action: 'member.add', createdAt: new Date(Date.now() - 31 * DAY) },
      { workspaceId: WS_ID, userId: OWNER_ID, action: 'member.remove', createdAt: new Date(Date.now() - 29 * DAY) },
    ]);
  }

  it('deletes rows older than the retention window, keeps newer ones', async () => {
    await seedLogs();
    process.env.WORKSPACE_LOG_RETENTION_DAYS = '30';

    await service.pruneActivityLogs();

    const rows = await db.select().from(workspaceActivityLog);
    expect(rows.map((r) => r.action)).toEqual(['member.remove']);
  });

  it('default 90-day window applies when the env var is unset', async () => {
    await seedLogs();
    delete process.env.WORKSPACE_LOG_RETENTION_DAYS;

    await service.pruneActivityLogs();

    // Both fixtures (29d and 31d) are inside 90 days.
    expect(await count('workspace_activity_log')).toBe(2);
  });
});
