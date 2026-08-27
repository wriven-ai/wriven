import { createHash, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { InvitationsService } from '../../src/auth/invitations.service';
import { AuthorizationService } from '../../src/auth/authorization.service';
import { EntitlementsService } from '../../src/auth/entitlements.service';
import { MembersService } from '../../src/auth/members.service';
import { ProjectsService } from '../../src/auth/projects.service';
import type { MailService } from '../../src/auth/mail.service';
import * as schema from '../../src/db/schema';
import { startTestDb, type TestDb } from './test-db';

const { users, workspaces, workspaceMembers, invitations, plans, subscriptions } = schema;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const WS_ID = '33333333-3333-4333-8333-333333333333';
const SEAT_A = '22222222-2222-4222-8222-222222222222';
const SEAT_B = '99999999-9999-4999-8999-999999999999';

jest.setTimeout(30_000);

let testDb: TestDb;
let db: TestDb['db'];
let service: InvitationsService;
let tokenA: string;
let tokenB: string;

beforeAll(async () => {
  testDb = await startTestDb();
  db = testDb.db;
  const entitlements = new EntitlementsService(db);
  const authz = new AuthorizationService(db);
  const members = new MembersService(db, entitlements, authz);
  const projects = new ProjectsService(db, members, entitlements, authz);
  service = new InvitationsService(
    db,
    authz,
    projects,
    { sendInvitation: jest.fn() } as unknown as MailService,
    { get: () => 'https://app.wriven.tech' } as never,
    entitlements,
  );
}, 120_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(async () => {
  await testDb.truncate();

  await db.insert(users).values([
    { id: OWNER_ID, email: 'owner@example.com', name: 'Owner', passwordHash: 'x' },
    { id: SEAT_A, email: 'a@example.com', name: 'A', passwordHash: 'x' },
    { id: SEAT_B, email: 'b@example.com', name: 'B', passwordHash: 'x' },
  ]);
  await db.insert(workspaces).values({ id: WS_ID, name: 'Acme', slug: 'acme', createdBy: OWNER_ID });
  await db.insert(workspaceMembers).values({ workspaceId: WS_ID, userId: OWNER_ID, role: 'owner' });
  // Solo plan: exactly ONE seat, already occupied by the owner.
  const [plan] = await db
    .insert(plans)
    .values({
      key: 'solo',
      name: 'Solo',
      sortOrder: 1,
      isPublic: true,
      active: true,
      currency: 'usd',
      limits: { members: 1 },
      features: {},
    })
    .returning();
  await db.insert(subscriptions).values({ workspaceId: WS_ID, planId: plan.id });

  tokenA = randomBytes(16).toString('hex');
  tokenB = randomBytes(16).toString('hex');
  await db.insert(invitations).values([
    {
      email: 'a@example.com',
      scope: 'workspace',
      workspaceId: WS_ID,
      projectId: null,
      role: 'member',
      tokenHash: sha256(tokenA),
      invitedBy: OWNER_ID,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
    {
      email: 'b@example.com',
      scope: 'workspace',
      workspaceId: WS_ID,
      projectId: null,
      role: 'member',
      tokenHash: sha256(tokenB),
      invitedBy: OWNER_ID,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  ]);
});

describe('seat-quota advisory lock — concurrent claims against real Postgres', () => {
  it('sequential baseline: with a free seat the first accept passes, the second is counted out', async () => {
    // Widen to 2 seats so A fills the plan exactly.
    await db.execute(
      sql`update auth_svc.plans set limits = jsonb_set(limits, '{members}', '2') where key = 'solo'`,
    );

    await service.accept({ token: tokenA, userId: SEAT_A });
    const second = await service.accept({ token: tokenB, userId: SEAT_B }).catch((e) => e);

    expect((second as { getError?: () => { code: string } }).getError?.()?.code).toBe(
      'PLAN_LIMIT_REACHED',
    );
    const seats = await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, WS_ID));
    expect(seats).toHaveLength(2); // owner + A
  });

  it('PARALLEL claims on the last seat: exactly one wins (the advisory lock serializes)', async () => {
    // Widen to 2 seats: the owner holds one, exactly ONE is free.
    await db.execute(
      sql`update auth_svc.plans set limits = jsonb_set(limits, '{members}', '2') where key = 'solo'`,
    );

    // Without the pg_advisory_xact_lock both claims would read count=1 before
    // either commits and both insert — this assertion fails (intermittently) then.
    const results = await Promise.allSettled([
      service.accept({ token: tokenA, userId: SEAT_A }),
      service.accept({ token: tokenB, userId: SEAT_B }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const code = (rejected[0].reason as { getError: () => { code: string } }).getError()?.code;
    expect(code).toBe('PLAN_LIMIT_REACHED');

    // Exactly ONE new seat exists alongside the owner, regardless of who won.
    const seats = await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, WS_ID));
    expect(seats).toHaveLength(2);
    // The loser's invitation rolled back to pending.
    const stillPending = await db.select().from(invitations).where(eq(invitations.status, 'pending'));
    expect(stillPending).toHaveLength(1);
  });
});
