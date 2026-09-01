import { RpcException } from '@nestjs/microservices';
import { Permission } from '@wriven/contracts';
import { ProjectsService } from './projects.service';
import type { AuthorizationService } from './authorization.service';
import type { EntitlementsService } from './entitlements.service';
import type { MembersService } from './members.service';
import * as schema from '../db/schema';
import { chain, writeChain, asDb, chainOf, createDbMock } from '../testing/drizzle-mock';
import { serializeFragment } from '../testing/drizzle-mock';
import { userRow } from '../testing/fixtures';

const { projects, projectMembers, workspaceMembers } = schema;

const USER_ID = '11111111-1111-4111-8111-111111111111';
const T0 = new Date('2026-01-01T00:00:00.000Z');

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    workspaceId: 'ws-1',
    name: 'Blog',
    slug: 'blog',
    createdBy: USER_ID,
    createdAt: T0,
    updatedAt: T0,
    deletedAt: null,
    ...overrides,
  };
}

function makeService() {
  const db = createDbMock();
  const authz = {
    authorize: jest.fn().mockResolvedValue({ wsRole: 'admin', projRole: null }),
    resolveRoles: jest.fn().mockResolvedValue({ wsRole: 'member', projRole: null }),
  };
  const entitlements = {
    assertProjectQuotaTx: jest.fn().mockResolvedValue(undefined),
    assertMemberQuotaTx: jest.fn().mockResolvedValue(undefined),
  };
  const members = { findUserByEmail: jest.fn().mockResolvedValue(userRow({ id: 'u-2' })) };
  const service = new ProjectsService(
    asDb(db),
    members as unknown as MembersService,
    entitlements as unknown as EntitlementsService,
    authz as unknown as AuthorizationService,
  );
  return { service, db, authz, entitlements, members };
}

/** Cast the mock tx surface into the drizzle PgTransaction type the method takes. */
function asTx(tx: ReturnType<typeof createDbMock>['__tx']) {
  return tx as unknown as Parameters<ProjectsService['ensureWorkspaceMember']>[0];
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

describe('ProjectsService.create', () => {
  it('creates inside a tx: quota assert, project row, creator as project admin', async () => {
    const { service, db, entitlements } = makeService();
    db.__tx.insert.mockImplementationOnce(() => writeChain([projectRow()]))
      .mockImplementationOnce(() => chain([]));

    const view = await service.create({
      callerUserId: USER_ID,
      workspaceId: 'ws-1',
      dto: { name: 'Blog' },
    });

    expect(entitlements.assertProjectQuotaTx).toHaveBeenCalledWith(db.__tx, 'ws-1');
    expect(db.__tx.insert).toHaveBeenNthCalledWith(1, projects);
    expect(db.__tx.insert).toHaveBeenNthCalledWith(2, projectMembers);
    expect(chainOf(db.__tx.insert).values).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      name: 'Blog',
      slug: expect.stringMatching(/^blog/), // uniqueSlug appends a suffix when taken
      createdBy: USER_ID,
    });
    expect(chainOf(db.__tx.insert, 1).values).toHaveBeenCalledWith({
      projectId: 'p1',
      userId: USER_ID,
      role: 'admin',
    });
    expect(view.role).toBe('admin');
  });

  it('slug unique-violation (23505) → friendly CONFLICT', async () => {
    const { service, db } = makeService();
    db.__tx.insert.mockImplementationOnce(() => {
      throw Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'projects_ws_slug_uq',
      });
    });

    const err = await rejection(
      service.create({ callerUserId: USER_ID, workspaceId: 'ws-1', dto: { name: 'Blog' } }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toContain('slug');
  });

  it('non-slug unique violation rethrown raw', async () => {
    const { service, db } = makeService();
    const dup = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'projects_created_by_uq',
    });
    db.__tx.insert.mockImplementationOnce(() => {
      throw dup;
    });

    await expect(
      service.create({ callerUserId: USER_ID, workspaceId: 'ws-1', dto: { name: 'Blog' } }),
    ).rejects.toBe(dup);
  });
});

describe('ProjectsService.list — scope-driven visibility', () => {
  it('real workspace member (owner/admin/member) sees ALL projects', async () => {
    const { service, db, authz } = makeService();
    authz.resolveRoles.mockResolvedValue({ wsRole: 'member', projRole: null });
    db.query.projects.findMany.mockResolvedValue([projectRow(), projectRow({ id: 'p2' })]);
    db.query.projectMembers.findMany.mockResolvedValue([{ projectId: 'p1', role: 'editor' }]);

    const views = await service.list({ callerUserId: USER_ID, workspaceId: 'ws-1' });

    expect(views.map((v) => v.id)).toEqual(['p1', 'p2']);
    expect(views[0].role).toBe('editor'); // from membership
    expect(views[1].role).toBe('viewer'); // fallback
  });

  it('guest sees only ASSIGNED projects', async () => {
    const { service, db, authz } = makeService();
    authz.resolveRoles.mockResolvedValue({ wsRole: 'guest', projRole: null });
    db.query.projects.findMany.mockResolvedValue([projectRow(), projectRow({ id: 'p2' })]);
    db.query.projectMembers.findMany.mockResolvedValue([{ projectId: 'p1', role: 'editor' }]);

    const views = await service.list({ callerUserId: USER_ID, workspaceId: 'ws-1' });
    expect(views.map((v) => v.id)).toEqual(['p1']);
  });

  it('no workspace role → FORBIDDEN before any query', async () => {
    const { service, db, authz } = makeService();
    authz.resolveRoles.mockResolvedValue({ wsRole: null, projRole: null });

    const err = await rejection(
      service.list({ callerUserId: USER_ID, workspaceId: 'ws-1' }),
    );
    expect(err.code).toBe('FORBIDDEN');
    expect(db.query.projects.findMany).not.toHaveBeenCalled();
  });
});

describe('ProjectsService.update', () => {
  it('slug is normalized and only provided fields are written', async () => {
    const { service, db } = makeService();
    db.update.mockImplementationOnce(() => writeChain([projectRow({ name: 'New', slug: 'my-blog' })]));
    db.query.projectMembers.findFirst.mockResolvedValue({ role: 'editor' });

    const view = await service.update({
      callerUserId: USER_ID,
      projectId: 'p1',
      dto: { name: 'New', slug: 'My Blog!' },
    });

    expect(chainOf(db.update).set).toHaveBeenCalledWith({ name: 'New', slug: 'my-blog' });
    expect(view.slug).toBe('my-blog');
    expect(view.role).toBe('editor');
  });

  it('slug unique-violation → CONFLICT', async () => {
    const { service, db } = makeService();
    db.update.mockImplementationOnce(() => {
      throw Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'projects_ws_slug_uq',
      });
    });

    const err = await rejection(
      service.update({ callerUserId: USER_ID, projectId: 'p1', dto: { slug: 'taken' } }),
    );
    expect(err.code).toBe('CONFLICT');
  });
});

describe('ProjectsService.remove — soft delete', () => {
  it('marks deletedAt and returns the owning workspaceId for activity logging', async () => {
    const { service, db, authz } = makeService();
    db.select.mockImplementationOnce(() => chain([{ workspaceId: 'ws-9' }]));
    db.update.mockImplementationOnce(() => writeChain([projectRow()]));

    const result = await service.remove({ callerUserId: USER_ID, projectId: 'p1' });

    expect(authz.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ permission: Permission.PROJECT_DELETE, projectId: 'p1' }),
    );
    expect(chainOf(db.update).set).toHaveBeenCalledWith({
      deletedAt: expect.any(Date),
    });
    expect(result).toEqual({ success: true, workspaceId: 'ws-9' });
  });
});

describe('ProjectsService.addMember', () => {
  it('baseline workspace membership + project membership in one tx', async () => {
    const { service, db, entitlements } = makeService();
    db.query.projects.findFirst.mockResolvedValue(projectRow());
    db.__tx.insert.mockImplementationOnce(() => writeChain([])) // workspaceMembers (guest seat)
      .mockImplementationOnce(() => writeChain([{ id: 'pm-1', projectId: 'p1', userId: 'u-2', role: 'editor', createdAt: T0 }]));

    const view = await service.addMember({
      callerUserId: USER_ID,
      projectId: 'p1',
      dto: { email: 'user@example.com', role: 'editor' },
    });

    expect(entitlements.assertMemberQuotaTx).toHaveBeenCalledWith(db.__tx, 'ws-1');
    expect(db.__tx.insert).toHaveBeenNthCalledWith(1, workspaceMembers);
    expect(db.__tx.insert).toHaveBeenNthCalledWith(2, projectMembers);
    expect(view).toMatchObject({ projectId: 'p1', userId: 'u-2', role: 'editor' });
  });

  it('already a member → CONFLICT before any write', async () => {
    const { service, db } = makeService();
    db.query.projects.findFirst.mockResolvedValue(projectRow());
    db.query.projectMembers.findFirst.mockResolvedValue({ id: 'pm-1' });

    const err = await rejection(
      service.addMember({
        callerUserId: USER_ID,
        projectId: 'p1',
        dto: { email: 'user@example.com', role: 'editor' },
      }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe('ProjectsService.updateMember / removeMember — last-admin guard', () => {
  it('demoting the only admin → CONFLICT', async () => {
    const { service, db } = makeService();
    db.query.projectMembers.findFirst.mockResolvedValue({ role: 'admin' });
    db.$count.mockResolvedValue(1);

    const err = await rejection(
      service.updateMember({
        callerUserId: USER_ID,
        projectId: 'p1',
        targetUserId: 'u-2',
        dto: { role: 'editor' },
      }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toContain('at least one admin');
    // Admin-count predicate pin (same rationale as the last-owner guard).
    const countWhere = serializeFragment(db.$count.mock.calls[0]?.[1]);
    expect(countWhere).toContain('p1');
    expect(countWhere).toContain('admin');
    expect(db.update).not.toHaveBeenCalled();
  });

  it('removing the only admin → CONFLICT, no delete', async () => {
    const { service, db } = makeService();
    db.query.projectMembers.findFirst.mockResolvedValue({ role: 'admin' });
    db.$count.mockResolvedValue(1);

    const err = await rejection(
      service.removeMember({ callerUserId: USER_ID, projectId: 'p1', targetUserId: 'u-2' }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('removing a non-admin member → delete issued', async () => {
    const { service, db } = makeService();
    db.query.projectMembers.findFirst.mockResolvedValue({ role: 'editor' });

    await expect(
      service.removeMember({ callerUserId: USER_ID, projectId: 'p1', targetUserId: 'u-2' }),
    ).resolves.toEqual({ success: true });
    expect(db.delete).toHaveBeenCalledWith(projectMembers);
  });
});

describe('ProjectsService.ensureWorkspaceMember', () => {
  it('already a member → no new seat (no quota check, no insert)', async () => {
    const { service, db, entitlements } = makeService();
    db.__tx.query.workspaceMembers.findFirst.mockResolvedValue({ id: 'mem-1' });

    await service.ensureWorkspaceMember(asTx(db.__tx), 'ws-1', 'u-2');

    expect(entitlements.assertMemberQuotaTx).not.toHaveBeenCalled();
    expect(db.__tx.insert).not.toHaveBeenCalled();
  });

  it('new seat → quota asserted, guest row inserted with conflict-do-nothing', async () => {
    const { service, db, entitlements } = makeService();
    db.__tx.query.workspaceMembers.findFirst.mockResolvedValue(undefined);
    db.__tx.insert.mockImplementationOnce(() => writeChain([]));

    await service.ensureWorkspaceMember(asTx(db.__tx), 'ws-1', 'u-2');

    expect(entitlements.assertMemberQuotaTx).toHaveBeenCalledWith(db.__tx, 'ws-1');
    expect(chainOf(db.__tx.insert).values).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      userId: 'u-2',
      role: 'guest', // baseline access, not a full member
    });
  });
});
