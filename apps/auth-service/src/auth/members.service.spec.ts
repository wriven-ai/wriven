import { RpcException } from '@nestjs/microservices';
import { Permission } from '@wriven/contracts';
import { MembersService } from './members.service';
import type { AuthorizationService } from './authorization.service';
import type { EntitlementsService } from './entitlements.service';
import * as schema from '../db/schema';
import { asDb, chain, chainOf, createDbMock } from '../testing/drizzle-mock';
import { userRow } from '../testing/fixtures';

const { workspaceMembers } = schema;

const USER_ID = '11111111-1111-4111-8111-111111111111';
const T0 = new Date('2026-01-01T00:00:00.000Z');

function memberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem-1',
    workspaceId: 'ws-1',
    userId: 'u-2',
    role: 'member',
    createdAt: T0,
    ...overrides,
  };
}

function makeService() {
  const db = createDbMock();
  const authz = { authorize: jest.fn().mockResolvedValue({}) };
  const entitlements = { assertMemberQuotaTx: jest.fn().mockResolvedValue(undefined) };
  const service = new MembersService(
    asDb(db),
    entitlements as unknown as EntitlementsService,
    authz as unknown as AuthorizationService,
  );
  return { service, db, authz, entitlements };
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

describe('MembersService.addWorkspaceMember', () => {
  it('unknown email → NOT_FOUND before any write', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue(undefined);

    const err = await rejection(
      service.addWorkspaceMember({
        callerUserId: USER_ID,
        workspaceId: 'ws-1',
        dto: { email: 'ghost@example.com', role: 'member' },
      }),
    );
    expect(err.code).toBe('NOT_FOUND');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('existing member → CONFLICT, no seat insert', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue(userRow({ id: 'u-2' }));
    db.query.workspaceMembers.findFirst.mockResolvedValue(memberRow());

    const err = await rejection(
      service.addWorkspaceMember({
        callerUserId: USER_ID,
        workspaceId: 'ws-1',
        dto: { email: 'user@example.com', role: 'member' },
      }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(db.__tx.insert).not.toHaveBeenCalled();
  });

  it('happy path: quota asserted inside the tx, then the seat insert', async () => {
    const { service, db, entitlements } = makeService();
    db.query.users.findFirst.mockResolvedValue(userRow({ id: 'u-2' }));
    db.__tx.insert.mockImplementationOnce(() => chain([memberRow({ role: 'admin' })]));

    const view = await service.addWorkspaceMember({
      callerUserId: USER_ID,
      workspaceId: 'ws-1',
      dto: { email: 'user@example.com', role: 'admin' },
    });

    expect(entitlements.assertMemberQuotaTx).toHaveBeenCalledWith(db.__tx, 'ws-1');
    expect(db.__tx.insert).toHaveBeenCalledWith(workspaceMembers);
    expect(chainOf(db.__tx.insert).values).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      userId: 'u-2',
      role: 'admin',
    });
    expect(view.user.email).toBe('user@example.com');
    expect(view.role).toBe('admin');
  });
});

describe('MembersService.updateWorkspaceMember — owner-role guard', () => {
  function setup(targetRole: string) {
    const ctx = makeService();
    ctx.db.query.workspaceMembers.findFirst.mockResolvedValue(memberRow({ role: targetRole }));
    return ctx;
  }

  it('target is not a member → NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.query.workspaceMembers.findFirst.mockResolvedValue(undefined);
    const err = await rejection(
      service.updateWorkspaceMember({
        callerUserId: USER_ID,
        workspaceId: 'ws-1',
        targetUserId: 'u-2',
        dto: { role: 'member' },
      }),
    );
    expect(err.code).toBe('NOT_FOUND');
  });

  it('granting owner requires the owner-only WORKSPACE_ROLE_ASSIGN on top of MANAGE', async () => {
    const { service, db, authz } = setup('member');
    db.update.mockImplementationOnce(() => chain([memberRow({ role: 'owner' })]));
    db.query.users.findFirst.mockResolvedValue(userRow({ id: 'u-2' }));

    await service.updateWorkspaceMember({
      callerUserId: USER_ID,
      workspaceId: 'ws-1',
      targetUserId: 'u-2',
      dto: { role: 'owner' },
    });

    expect(authz.authorize).toHaveBeenCalledTimes(2);
    expect(authz.authorize.mock.calls[1][0]).toMatchObject({
      permission: Permission.WORKSPACE_ROLE_ASSIGN,
      workspaceId: 'ws-1',
    });
  });

  it('demoting the last owner → CONFLICT, role untouched', async () => {
    const { service, db } = setup('owner');
    db.$count.mockResolvedValue(1);

    const err = await rejection(
      service.updateWorkspaceMember({
        callerUserId: USER_ID,
        workspaceId: 'ws-1',
        targetUserId: 'u-2',
        dto: { role: 'member' },
      }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toContain('at least one owner');
    expect(db.update).not.toHaveBeenCalled();
  });

  it('demoting an owner with a co-owner present → allowed', async () => {
    const { service, db } = setup('owner');
    db.$count.mockResolvedValue(2);
    db.update.mockImplementationOnce(() => chain([memberRow({ role: 'member' })]));
    db.query.users.findFirst.mockResolvedValue(userRow({ id: 'u-2' }));

    const view = await service.updateWorkspaceMember({
      callerUserId: USER_ID,
      workspaceId: 'ws-1',
      targetUserId: 'u-2',
      dto: { role: 'member' },
    });

    expect(chainOf(db.update).set).toHaveBeenCalledWith({ role: 'member' });
    expect(view.role).toBe('member');
  });
});

describe('MembersService.removeWorkspaceMember', () => {
  it('removing the last owner → CONFLICT, no delete', async () => {
    const { service, db } = makeService();
    db.query.workspaceMembers.findFirst.mockResolvedValue(memberRow({ role: 'owner' }));
    db.$count.mockResolvedValue(1);

    const err = await rejection(
      service.removeWorkspaceMember({
        callerUserId: USER_ID,
        workspaceId: 'ws-1',
        targetUserId: 'u-2',
      }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('owner removal with co-owner (or plain member) → delete issued', async () => {
    const { service, db } = makeService();
    db.query.workspaceMembers.findFirst.mockResolvedValue(memberRow({ role: 'member' }));

    await expect(
      service.removeWorkspaceMember({
        callerUserId: USER_ID,
        workspaceId: 'ws-1',
        targetUserId: 'u-2',
      }),
    ).resolves.toEqual({ success: true });
    expect(db.delete).toHaveBeenCalledWith(workspaceMembers);
  });
});

describe('MembersService.listWorkspaceMembers', () => {
  it('authorizes with WORKSPACE_MEMBERS_VIEW and maps user into the view', async () => {
    const { service, db, authz } = makeService();
    db.query.workspaceMembers.findMany.mockResolvedValue([
      { ...memberRow(), user: userRow({ id: 'u-2' }) },
    ]);

    const views = await service.listWorkspaceMembers({
      callerUserId: USER_ID,
      workspaceId: 'ws-1',
    });

    expect(authz.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: Permission.WORKSPACE_MEMBERS_VIEW,
        workspaceId: 'ws-1',
      }),
    );
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      userId: 'u-2',
      role: 'member',
      user: { email: 'user@example.com', name: 'Test User' },
    });
  });
});

describe('MembersService.findUserByEmail / requireWorkspaceMembership', () => {
  it('missing user → NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue(undefined);
    const err = await rejection(service.findUserByEmail('ghost@example.com'));
    expect(err.code).toBe('NOT_FOUND');
    expect(db.query.users.findFirst).toHaveBeenCalled();
  });

  it('non-member in requireWorkspaceMembership → NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.query.workspaceMembers.findFirst.mockResolvedValue(undefined);
    const err = await rejection(service.requireWorkspaceMembership('ws-1', 'u-2'));
    expect(err.message).toContain('not a member');
  });
});
