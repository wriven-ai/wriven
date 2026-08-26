import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { RpcException } from '@nestjs/microservices';
import { InvitationsService } from '../../src/auth/invitations.service';
import { AuthorizationService } from '../../src/auth/authorization.service';
import { EntitlementsService } from '../../src/auth/entitlements.service';
import { MembersService } from '../../src/auth/members.service';
import { ProjectsService } from '../../src/auth/projects.service';
import type { MailService } from '../../src/auth/mail.service';
import * as schema from '../../src/db/schema';
import { startTestDb, type TestDb } from './test-db';

const { users, workspaces, workspaceMembers, projects, projectMembers, invitations, plans, subscriptions } =
  schema;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const INVITEE_ID = '22222222-2222-4222-8222-222222222222';
const WS_ID = '33333333-3333-4333-8333-333333333333';
const PROJECT_ID = '44444444-4444-4444-8444-444444444444';

let testDb: TestDb;
let service: InvitationsService;
let db: TestDb['db'];

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
    { sendInvitation: jest.fn().mockResolvedValue(undefined) } as unknown as MailService,
    { get: () => 'https://app.wriven.tech' } as never,
    entitlements,
  );
}, 120_000);

afterAll(async () => {
  await testDb?.stop();
});

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    if (err instanceof RpcException) {
      return err.getError() as { code: string; message: string };
    }
    throw err;
  }
  throw new Error('expected rejection');
}

/** Users + workspace + the owner seat. Idempotent — safe to call from every seeder. */
async function seedBase() {
  await db
    .insert(users)
    .values({ id: OWNER_ID, email: 'owner@example.com', name: 'Owner', passwordHash: 'x' })
    .onConflictDoNothing();
  await db
    .insert(users)
    .values({ id: INVITEE_ID, email: 'invitee@example.com', name: 'Invitee', passwordHash: 'x' })
    .onConflictDoNothing();
  await db
    .insert(workspaces)
    .values({ id: WS_ID, name: 'Acme', slug: 'acme', createdBy: OWNER_ID })
    .onConflictDoNothing();
  await db
    .insert(workspaceMembers)
    .values({ workspaceId: WS_ID, userId: OWNER_ID, role: 'owner' })
    .onConflictDoNothing();
}

/** A pending invitation for the invitee (seeds the base rows first); returns the raw token. */
async function seedWorkspaceInvitation(overrides: Record<string, unknown> = {}) {
  await seedBase();
  const token = randomBytes(16).toString('hex');
  await db.insert(invitations).values({
    email: 'invitee@example.com',
    scope: 'workspace',
    workspaceId: WS_ID,
    projectId: null,
    role: 'admin',
    tokenHash: sha256(token),
    invitedBy: OWNER_ID,
    expiresAt: new Date(Date.now() + 86_400_000),
    ...overrides,
  });
  return token;
}

async function memberRole(userId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId));
  return row?.role;
}

async function invitationStatus(): Promise<string | undefined> {
  const [row] = await db.select({ status: invitations.status }).from(invitations);
  return row?.status;
}

/** The project a project-scoped invitation targets (needs seedBase first). */
async function seedProject() {
  await db.insert(projects).values({
    id: PROJECT_ID,
    workspaceId: WS_ID,
    name: 'Blog',
    slug: 'blog',
    createdBy: OWNER_ID,
  });
}

beforeEach(async () => {
  await testDb.truncate();
});

describe('InvitationsService.accept — against real Postgres', () => {
  it('a valid token creates the membership and marks the invitation accepted', async () => {
    const token = await seedWorkspaceInvitation();

    const result = await service.accept({ token, userId: INVITEE_ID });

    expect(result).toEqual({
      scope: 'workspace',
      workspaceSlug: 'acme',
      projectSlug: null,
    });
    expect(await memberRole(INVITEE_ID)).toBe('admin');
    expect(await invitationStatus()).toBe('accepted');
  });

  it('re-accepting the same token → CONFLICT, membership never duplicated', async () => {
    const token = await seedWorkspaceInvitation();
    await service.accept({ token, userId: INVITEE_ID });

    const err = await rejection(service.accept({ token, userId: INVITEE_ID }));

    expect(err.code).toBe('CONFLICT');
    expect(err.message).toContain('no longer active');
    const rows = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, INVITEE_ID));
    expect(rows).toHaveLength(1);
  });

  it('accepting as a guest upgrades the role (real ON CONFLICT DO UPDATE + setWhere)', async () => {
    const token = await seedWorkspaceInvitation({ role: 'admin' });
    // Auto-added via a project invite previously: baseline guest seat.
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: WS_ID, userId: INVITEE_ID, role: 'guest' });

    await service.accept({ token, userId: INVITEE_ID });

    expect(await memberRole(INVITEE_ID)).toBe('admin');
    const rows = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, INVITEE_ID));
    expect(rows).toHaveLength(1); // upgraded in place, not a second row
  });

  it('a higher existing role is NEVER downgraded by a lower invitation', async () => {
    const token = await seedWorkspaceInvitation({ role: 'member' });
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: WS_ID, userId: INVITEE_ID, role: 'admin' });

    await service.accept({ token, userId: INVITEE_ID });

    expect(await memberRole(INVITEE_ID)).toBe('admin'); // untouched
    expect(await invitationStatus()).toBe('accepted');
  });

  it('expired invitation → CONFLICT and the row is flipped to expired', async () => {
    const token = await seedWorkspaceInvitation({
      expiresAt: new Date(Date.now() - 86_400_000),
    });

    const err = await rejection(service.accept({ token, userId: INVITEE_ID }));

    expect(err.code).toBe('CONFLICT');
    expect(err.message).toContain('expired');
    expect(await invitationStatus()).toBe('expired');
    expect(await memberRole(INVITEE_ID)).toBeUndefined();
  });

  it('wrong logged-in email → FORBIDDEN, no membership written', async () => {
    const token = await seedWorkspaceInvitation();
    await db.insert(users).values({
      id: '33333333-3333-4333-8333-333333333333',
      email: 'other@example.com',
      name: 'Other',
      passwordHash: 'x',
    });

    const err = await rejection(
      service.accept({ token, userId: '33333333-3333-4333-8333-333333333333' }),
    );

    expect(err.code).toBe('FORBIDDEN');
    expect(await memberRole('33333333-3333-4333-8333-333333333333')).toBeUndefined();
  });

  it('project scope: baseline guest workspace seat + project membership, idempotent on re-run', async () => {
    await seedBase();
    await seedProject(); // must exist before the invitation references it
    const token = await seedWorkspaceInvitation({
      scope: 'project',
      role: 'editor',
      projectId: PROJECT_ID,
    });

    const result = await service.accept({ token, userId: INVITEE_ID });

    expect(result).toEqual({ scope: 'project', workspaceSlug: 'acme', projectSlug: 'blog' });
    expect(await memberRole(INVITEE_ID)).toBe('guest'); // baseline, not a full member
    const pm = await db.select().from(projectMembers).where(eq(projectMembers.userId, INVITEE_ID));
    expect(pm).toHaveLength(1);
    expect(pm[0].role).toBe('editor');
  });

  it('seat quota exceeded → PLAN_LIMIT_REACHED and the tx ROLLS BACK (invitation stays pending)', async () => {
    // Plan caps members at 1; the owner already occupies the seat.
    await seedWorkspaceInvitation();
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

    // Re-mint a fresh pending invitation (the seeded one is untouched so far).
    const token2 = randomBytes(16).toString('hex');
    await db.insert(invitations).values({
      email: 'invitee@example.com',
      scope: 'workspace',
      workspaceId: WS_ID,
      projectId: null,
      role: 'member',
      tokenHash: sha256(token2),
      invitedBy: OWNER_ID,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const err = await rejection(service.accept({ token: token2, userId: INVITEE_ID }));

    expect(err.code).toBe('PLAN_LIMIT_REACHED');
    expect(await memberRole(INVITEE_ID)).toBeUndefined(); // no seat consumed
    // Rollback proof: the invitation row is exactly as it was.
    const rows = await db.select().from(invitations).where(eq(invitations.tokenHash, sha256(token2)));
    expect(rows[0].status).toBe('pending');
    expect(rows[0].acceptedAt).toBeNull();
  });
});
