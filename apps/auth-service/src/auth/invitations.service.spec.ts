import { Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Permission } from '@wriven/contracts';
import { createHash } from 'node:crypto';
import { InvitationsService } from './invitations.service';
import type { AuthorizationService } from './authorization.service';
import type { EntitlementsService } from './entitlements.service';
import type { ProjectsService } from './projects.service';
import type { MailService } from './mail.service';
import * as schema from '../db/schema';
import { writeChain, asDb, chainOf, createDbMock, serializeFragment, type DbMock } from '../testing/drizzle-mock';
import { configStub } from '../testing/config-stub';
import { userRow } from '../testing/fixtures';

const { invitations, workspaceMembers, projectMembers } = schema;

const USER_ID = '11111111-1111-4111-8111-111111111111';
const T0 = new Date('2026-01-01T00:00:00.000Z');
// Relative to the real clock (service compares against Date.now) — a fixed
// far-future date would rot in 2030.
const FUTURE = new Date(Date.now() + 7 * 86_400_000);

beforeAll(() => {
  Logger.overrideLogger([]);
});

function invitationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    email: 'invitee@example.com',
    scope: 'workspace',
    workspaceId: 'ws-1',
    projectId: null,
    role: 'member',
    tokenHash: 'a'.repeat(64),
    status: 'pending',
    invitedBy: USER_ID,
    acceptedAt: null,
    acceptedBy: null,
    expiresAt: FUTURE,
    createdAt: T0,
    ...overrides,
  };
}

/**
 * users.findFirst is called for two purposes with distinguishable `columns`:
 * by-email probes select {id}, name lookups select {name}. Route on that.
 */
function routeUsers(db: DbMock, byEmail: unknown, byIdName: unknown) {
  db.query.users.findFirst.mockImplementation(
    async (args?: { columns?: Record<string, boolean> }) => {
      const cols = args?.columns ?? {};
      if ('name' in cols) return byIdName;
      return byEmail;
    },
  );
}

function makeService() {
  const db = createDbMock();
  const authz = { authorize: jest.fn().mockResolvedValue({}) };
  const projects = { ensureWorkspaceMember: jest.fn().mockResolvedValue(undefined) };
  const mail = { sendInvitation: jest.fn().mockResolvedValue(undefined) };
  const entitlements = { assertMemberQuotaTx: jest.fn().mockResolvedValue(undefined) };
  const service = new InvitationsService(
    asDb(db),
    authz as unknown as AuthorizationService,
    projects as unknown as ProjectsService,
    mail as unknown as MailService,
    configStub({ CLIENT_ORIGIN: 'https://app.wriven.tech' }),
    entitlements as unknown as EntitlementsService,
  );
  return { service, db, authz, projects, mail, entitlements };
}

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

const serializeWhere = serializeFragment;

describe('InvitationsService.create', () => {
  it('workspace scope: authorizes, stores only the sha256 of a 32-byte token, mails the raw link', async () => {
    const { service, db, mail } = makeService();
    routeUsers(db, undefined, userRow({ name: 'Inviter' })); // no invitee account yet
    db.insert.mockImplementationOnce(() => writeChain([invitationRow()]));
    db.query.workspaces.findFirst.mockResolvedValue({ name: 'Acme' });

    const view = await service.create({
      callerUserId: USER_ID,
      scope: 'workspace',
      workspaceId: 'ws-1',
      email: 'invitee@example.com',
      role: 'member',
    });

    expect(chainOf(db.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'invitee@example.com',
        workspaceId: 'ws-1',
        role: 'member',
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/), // sha256, never the raw token
        expiresAt: expect.any(Date),
      }),
    );
    const [to, link] = mail.sendInvitation.mock.calls[0];
    expect(to).toBe('invitee@example.com');
    expect(link).toMatch(/^https:\/\/app\.wriven\.tech\/invite\/[A-Za-z0-9_-]{43}$/);
    expect(view.invitedByName).toBe('Inviter');
    expect(view.status).toBe('pending');
  });

  it('project scope: resolves the workspace from the project and authorizes at project level', async () => {
    const { service, db, authz } = makeService();
    routeUsers(db, undefined, null);
    db.query.projects.findFirst.mockImplementation(
      async (args?: { columns?: Record<string, boolean> }) => {
        const cols = args?.columns ?? {};
        if ('workspaceId' in cols) return { id: 'p1', workspaceId: 'ws-1' };
        return { name: 'Blog' };
      },
    );
    db.insert.mockImplementationOnce(() => writeChain([invitationRow({ scope: 'project', projectId: 'p1' })]));

    await service.create({
      callerUserId: USER_ID,
      scope: 'project',
      projectId: 'p1',
      email: 'invitee@example.com',
      role: 'editor',
    });

    expect(authz.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: Permission.PROJECT_MEMBERS_MANAGE,
        projectId: 'p1',
      }),
    );
    expect(chainOf(db.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1', projectId: 'p1' }),
    );
  });

  it('project scope with unknown project → NOT_FOUND before authorize', async () => {
    const { service, db, authz } = makeService();
    db.query.projects.findFirst.mockResolvedValue(undefined);

    const err = await rejection(
      service.create({
        callerUserId: USER_ID,
        scope: 'project',
        projectId: 'nope',
        email: 'invitee@example.com',
        role: 'editor',
      }),
    );
    expect(err.code).toBe('NOT_FOUND');
    expect(authz.authorize).not.toHaveBeenCalled();
  });

  it('revokes any older pending invite for the same email before inserting', async () => {
    const { service, db } = makeService();
    routeUsers(db, undefined, null);
    db.insert.mockImplementationOnce(() => writeChain([invitationRow()]));

    await service.create({
      callerUserId: USER_ID,
      scope: 'workspace',
      workspaceId: 'ws-1',
      email: 'invitee@example.com',
      role: 'member',
    });

    expect(db.update).toHaveBeenCalledWith(invitations);
    expect(chainOf(db.update).set).toHaveBeenCalledWith({ status: 'revoked' });
  });

  it('a real workspace member cannot be re-invited → CONFLICT', async () => {
    const { service, db } = makeService();
    routeUsers(db, userRow({ id: 'u-2' }), null);
    db.query.workspaceMembers.findFirst.mockResolvedValue({ role: 'member' });

    const err = await rejection(
      service.create({
        callerUserId: USER_ID,
        scope: 'workspace',
        workspaceId: 'ws-1',
        email: 'invitee@example.com',
        role: 'member',
      }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('a guest (auto-added via project invite) CAN be invited — role upgrade path', async () => {
    const { service, db } = makeService();
    routeUsers(db, userRow({ id: 'u-2' }), null);
    db.query.workspaceMembers.findFirst.mockResolvedValue({ role: 'guest' });
    db.insert.mockImplementationOnce(() => writeChain([invitationRow()]));

    await expect(
      service.create({
        callerUserId: USER_ID,
        scope: 'workspace',
        workspaceId: 'ws-1',
        email: 'invitee@example.com',
        role: 'member',
      }),
    ).resolves.toBeTruthy();
    expect(db.insert).toHaveBeenCalled();
  });
});

describe('InvitationsService.accept', () => {
  it('happy path (workspace): email matches, seat quota enforced for NEW members', async () => {
    const { service, db, entitlements } = makeService();
    db.query.invitations.findFirst.mockResolvedValue(invitationRow());
    routeUsers(db, userRow({ id: 'u-2', email: 'invitee@example.com' }), null);
    db.__tx.query.workspaceMembers.findFirst.mockResolvedValue(undefined);
    db.__tx.insert.mockImplementationOnce(() => writeChain([]));
    db.__tx.update.mockImplementationOnce(() => writeChain([]));
    db.query.workspaces.findFirst.mockResolvedValue({ slug: 'acme' });

    const result = await service.accept({ token: 'raw-token', userId: 'u-2' });

    expect(entitlements.assertMemberQuotaTx).toHaveBeenCalledWith(db.__tx, 'ws-1');
    expect(db.__tx.insert).toHaveBeenCalledWith(workspaceMembers);
    expect(chainOf(db.__tx.update).set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'accepted', acceptedBy: 'u-2' }),
    );
    expect(result).toEqual({ scope: 'workspace', workspaceSlug: 'acme', projectSlug: null });
  });

  it('re-accepting as an existing member consumes no new seat (no quota call)', async () => {
    const { service, db, entitlements } = makeService();
    db.query.invitations.findFirst.mockResolvedValue(invitationRow());
    routeUsers(db, userRow({ id: 'u-2', email: 'invitee@example.com' }), null);
    db.__tx.query.workspaceMembers.findFirst.mockResolvedValue({ id: 'mem-1' });

    await service.accept({ token: 'raw-token', userId: 'u-2' });

    expect(entitlements.assertMemberQuotaTx).not.toHaveBeenCalled();
  });

  it('wrong logged-in email → FORBIDDEN, no membership write', async () => {
    const { service, db } = makeService();
    db.query.invitations.findFirst.mockResolvedValue(invitationRow());
    routeUsers(db, userRow({ id: 'u-2', email: 'someone-else@example.com' }), null);

    const err = await rejection(service.accept({ token: 'raw-token', userId: 'u-2' }));
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toContain('invitee@example.com');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('project scope: baseline workspace membership ensured, project member upserted', async () => {
    const { service, db, projects } = makeService();
    db.query.invitations.findFirst.mockResolvedValue(
      invitationRow({ scope: 'project', projectId: 'p1', role: 'editor' }),
    );
    routeUsers(db, userRow({ id: 'u-2', email: 'invitee@example.com' }), null);
    db.__tx.insert.mockImplementationOnce(() => writeChain([]));
    db.__tx.update.mockImplementationOnce(() => writeChain([]));
    db.query.workspaces.findFirst.mockResolvedValue({ slug: 'acme' });
    db.query.projects.findFirst.mockResolvedValue({ slug: 'blog' });

    const result = await service.accept({ token: 'raw-token', userId: 'u-2' });

    expect(projects.ensureWorkspaceMember).toHaveBeenCalledWith(db.__tx, 'ws-1', 'u-2');
    expect(db.__tx.insert).toHaveBeenCalledWith(projectMembers);
    expect(chainOf(db.__tx.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', role: 'editor' }),
    );
    expect(result).toEqual({ scope: 'project', workspaceSlug: 'acme', projectSlug: 'blog' });
  });
});

describe('InvitationsService token validation (findValidByToken)', () => {
  it('unknown token → NOT_FOUND invalid', async () => {
    const { service, db } = makeService();
    db.query.invitations.findFirst.mockResolvedValue(undefined);

    const err = await rejection(service.preview({ token: 'bogus' }));
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toContain('invalid');
  });

  it('non-pending status → CONFLICT, no longer active', async () => {
    const { service, db } = makeService();
    db.query.invitations.findFirst.mockResolvedValue(invitationRow({ status: 'revoked' }));

    const err = await rejection(service.preview({ token: 'raw-token' }));
    expect(err.code).toBe('CONFLICT');
  });

  it('expired token → row flipped to expired + CONFLICT', async () => {
    const { service, db } = makeService();
    db.query.invitations.findFirst.mockResolvedValue(
      invitationRow({ expiresAt: new Date('2025-12-01T00:00:00.000Z') }),
    );

    const err = await rejection(service.preview({ token: 'raw-token' }));
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toContain('expired');
    expect(chainOf(db.update).set).toHaveBeenCalledWith({ status: 'expired' });
  });

  it('looks the token up by its sha256, never the raw value', async () => {
    const { service, db } = makeService();
    db.query.invitations.findFirst.mockResolvedValue(invitationRow());
    routeUsers(db, undefined, userRow({ name: 'Inviter' }));
    db.query.workspaces.findFirst.mockResolvedValue({ name: 'Acme' });

    await service.preview({ token: 'raw-token' });

    const hash = createHash('sha256').update('raw-token').digest('hex');
    // The drizzle where-fragment serializes its bound params — the hashed
    // value must be in there, the raw token must not.
    const serialized = serializeWhere(db.query.invitations.findFirst.mock.calls[0][0]);
    expect(serialized).toContain(hash);
    expect(serialized).not.toContain('raw-token');
  });
});

describe('InvitationsService.preview', () => {
  it('requiresSignup reflects whether an account exists for the invited email', async () => {
    const { service, db } = makeService();
    db.query.invitations.findFirst.mockResolvedValue(invitationRow());
    routeUsers(db, undefined, userRow({ name: 'Inviter' }));
    db.query.workspaces.findFirst.mockResolvedValue({ name: 'Acme' });

    const view = await service.preview({ token: 'raw-token' });
    expect(view).toMatchObject({
      email: 'invitee@example.com',
      requiresSignup: true,
      workspaceName: 'Acme',
      inviterName: 'Inviter',
    });
  });

  it('existing account → requiresSignup false', async () => {
    const { service, db } = makeService();
    db.query.invitations.findFirst.mockResolvedValue(invitationRow());
    routeUsers(db, { id: 'u-2' }, userRow({ name: 'Inviter' }));
    db.query.workspaces.findFirst.mockResolvedValue({ name: 'Acme' });

    const view = await service.preview({ token: 'raw-token' });
    expect(view.requiresSignup).toBe(false);
  });
});

describe('InvitationsService.revoke / resend', () => {
  it('revoke: authorizes at the invite scope and returns the workspaceId', async () => {
    const { service, db, authz } = makeService();
    db.query.invitations.findFirst.mockResolvedValue(invitationRow());
    db.update.mockImplementationOnce(() => writeChain([invitationRow({ status: 'revoked' })]));

    const result = await service.revoke({ callerUserId: USER_ID, id: 'inv-1' });

    expect(authz.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: Permission.WORKSPACE_MEMBERS_MANAGE,
        workspaceId: 'ws-1',
      }),
    );
    expect(chainOf(db.update).set).toHaveBeenCalledWith({ status: 'revoked' });
    // Pin the WHERE scope: exactly this invitation, never a blanket update.
    expect(serializeWhere(chainOf(db.update).where.mock.calls[0][0])).toContain('inv-1');
    expect(result).toEqual({ success: true, workspaceId: 'ws-1' });
  });

  it('resend a non-pending invite → CONFLICT', async () => {
    const { service, db } = makeService();
    db.query.invitations.findFirst.mockResolvedValue(invitationRow({ status: 'accepted' }));

    const err = await rejection(service.resend({ callerUserId: USER_ID, id: 'inv-1' }));
    expect(err.code).toBe('CONFLICT');
    expect(db.update).not.toHaveBeenCalled();
  });

  it('resend: rotates the token hash and resets the TTL, re-mails', async () => {
    const { service, db, mail } = makeService();
    db.query.invitations.findFirst.mockResolvedValue(invitationRow({ tokenHash: 'old' }));
    db.update.mockImplementationOnce(() => writeChain([invitationRow()]));
    routeUsers(db, undefined, userRow({ name: 'Inviter' }));
    db.query.workspaces.findFirst.mockResolvedValue({ name: 'Acme' });

    await service.resend({ callerUserId: USER_ID, id: 'inv-1' });

    const set = chainOf(db.update).set.mock.calls[0][0] as { tokenHash: string; expiresAt: Date };
    expect(set.tokenHash).not.toBe('old');
    expect(set.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(set.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    expect(mail.sendInvitation).toHaveBeenCalledTimes(1);
  });
});

describe('InvitationsService.claimPending — signup auto-claim', () => {
  it('claims unexpired pending invites and skips expired ones', async () => {
    const { service, db } = makeService();
    db.query.invitations.findMany.mockResolvedValue([
      invitationRow({ id: 'inv-live' }),
      invitationRow({ id: 'inv-dead', expiresAt: new Date('2025-12-01T00:00:00.000Z') }),
    ]);

    await service.claimPending('u-2', 'invitee@example.com');

    expect(db.transaction).toHaveBeenCalledTimes(1); // expired row never applied
    expect(db.query.invitations.findMany).toHaveBeenCalledTimes(1);
  });

  it('one invite failing must not break the rest (best-effort)', async () => {
    const { service, db } = makeService();
    db.query.invitations.findMany.mockResolvedValue([
      invitationRow({ id: 'inv-a' }),
      invitationRow({ id: 'inv-b' }),
    ]);
    db.transaction
      .mockRejectedValueOnce(new Error('quota exceeded'))
      .mockResolvedValueOnce(undefined);

    await expect(service.claimPending('u-2', 'invitee@example.com')).resolves.toBeUndefined();
    expect(db.transaction).toHaveBeenCalledTimes(2);
  });
});
