import { RpcException } from '@nestjs/microservices';
import { Permission } from '@wriven/contracts';
import { WorkspacesService } from './workspaces.service';
import type { AuthorizationService } from './authorization.service';
import * as schema from '../db/schema';
import { asDb, chain, chainOf, createDbMock } from '../testing/drizzle-mock';
import { workspaceRow } from '../testing/fixtures';

const { workspaces, workspaceMembers, projects, projectMembers, subscriptions } = schema;

const USER_ID = '11111111-1111-4111-8111-111111111111';

function makeService() {
  const db = createDbMock();
  const authz = { authorize: jest.fn().mockResolvedValue({}) };
  const service = new WorkspacesService(
    asDb(db),
    authz as unknown as AuthorizationService,
  );
  return { service, db, authz };
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

describe('WorkspacesService.create — full bootstrap tx', () => {
  it('workspace + owner seat + default project + project-admin + free sub', async () => {
    const { service, db } = makeService();
    db.__tx.insert
      .mockImplementationOnce(() => chain([workspaceRow()])) // workspaces
      .mockImplementationOnce(() => chain([])) // workspaceMembers (owner)
      .mockImplementationOnce(() => chain([{ id: 'p-default' }])) // projects
      .mockImplementationOnce(() => chain([])) // projectMembers (admin)
      .mockImplementationOnce(() => chain([])); // subscriptions
    db.__tx.query.plans.findFirst.mockResolvedValue({ id: 'plan-free' });

    const result = await service.create({ userId: USER_ID, dto: { name: 'Acme' } });

    expect(db.__tx.insert.mock.calls.map((c) => c[0])).toEqual([
      workspaces,
      workspaceMembers,
      projects,
      projectMembers,
      subscriptions,
    ]);
    expect(chainOf(db.__tx.insert, 1).values).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      userId: USER_ID,
      role: 'owner',
    });
    expect(chainOf(db.__tx.insert, 2).values).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Default Project',
        slug: 'default',
        createdBy: USER_ID,
      }),
    );
    expect(chainOf(db.__tx.insert, 3).values).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin' }),
    );
    expect(chainOf(db.__tx.insert, 4).values).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      planId: 'plan-free',
    });
    expect(result.workspace.role).toBe('owner');
    expect(result.project).toEqual({ id: 'p-default' });
  });

  it('no free plan seeded → skips the subscription insert (4 inserts)', async () => {
    const { service, db } = makeService();
    db.__tx.insert
      .mockImplementationOnce(() => chain([workspaceRow()]))
      .mockImplementationOnce(() => chain([]))
      .mockImplementationOnce(() => chain([{ id: 'p-default' }]))
      .mockImplementationOnce(() => chain([]));
    db.__tx.query.plans.findFirst.mockResolvedValue(undefined);

    await service.create({ userId: USER_ID, dto: { name: 'Acme' } });

    expect(db.__tx.insert).toHaveBeenCalledTimes(4);
    expect(
      db.__tx.insert.mock.calls.some((c) => c[0] === subscriptions),
    ).toBe(false);
  });

  it('slug unique-violation → CONFLICT', async () => {
    const { service, db } = makeService();
    db.__tx.insert.mockImplementationOnce(() => {
      throw Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'workspaces_slug_uq',
      });
    });

    const err = await rejection(
      service.create({ userId: USER_ID, dto: { name: 'Acme' } }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toContain('slug');
  });
});

describe('WorkspacesService.stats', () => {
  it('counts active projects and members', async () => {
    const { service, db } = makeService();
    db.$count
      .mockImplementationOnce(() => Promise.resolve(5))
      .mockImplementationOnce(() => Promise.resolve(3));

    await expect(service.stats({ workspaceId: 'ws-1' })).resolves.toEqual({
      projects: 5,
      members: 3,
    });
  });
});

describe('WorkspacesService.list / get', () => {
  it('list maps each membership row to a view with its role', async () => {
    const { service, db } = makeService();
    db.query.workspaceMembers.findMany.mockResolvedValue([
      { role: 'owner', workspace: workspaceRow() },
      { role: 'member', workspace: workspaceRow({ id: 'ws-2', name: 'Other' }) },
    ]);

    const views = await service.list({ userId: USER_ID });

    expect(views.map((v) => [v.id, v.role])).toEqual([
      ['ws-1', 'owner'],
      ['ws-2', 'member'],
    ]);
  });

  it('get: unknown workspace → NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.query.workspaces.findFirst.mockResolvedValue(undefined);

    const err = await rejection(
      service.get({ callerUserId: USER_ID, workspaceId: 'nope' }),
    );
    expect(err.code).toBe('NOT_FOUND');
  });

  it('get returns the view with the caller role', async () => {
    const { service, db, authz } = makeService();
    db.query.workspaces.findFirst.mockResolvedValue(workspaceRow());
    db.query.workspaceMembers.findFirst.mockResolvedValue({ role: 'owner' });

    const view = await service.get({ callerUserId: USER_ID, workspaceId: 'ws-1' });

    expect(authz.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: Permission.WORKSPACE_VIEW,
        workspaceId: 'ws-1',
      }),
    );
    expect(view).toMatchObject({ id: 'ws-1', role: 'owner' });
  });
});

describe('WorkspacesService.update', () => {
  it('only provided fields written; slug normalized', async () => {
    const { service, db } = makeService();
    db.update.mockImplementationOnce(() =>
      chain([workspaceRow({ name: 'New', slug: 'new-name' })]),
    );
    db.query.workspaceMembers.findFirst.mockResolvedValue({ role: 'owner' });

    const view = await service.update({
      callerUserId: USER_ID,
      workspaceId: 'ws-1',
      dto: { name: 'New', slug: 'New Name!' },
    });

    expect(chainOf(db.update).set).toHaveBeenCalledWith({ name: 'New', slug: 'new-name' });
    expect(view.slug).toBe('new-name');
  });

  it('slug unique-violation → CONFLICT', async () => {
    const { service, db } = makeService();
    db.update.mockImplementationOnce(() => {
      throw Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'workspaces_slug_uq',
      });
    });

    const err = await rejection(
      service.update({ callerUserId: USER_ID, workspaceId: 'ws-1', dto: { slug: 'taken' } }),
    );
    expect(err.code).toBe('CONFLICT');
  });
});

describe('WorkspacesService.remove', () => {
  it('owner-only WORKSPACE_DELETE, then a hard delete', async () => {
    const { service, db, authz } = makeService();

    await expect(
      service.remove({ callerUserId: USER_ID, workspaceId: 'ws-1' }),
    ).resolves.toEqual({ success: true });

    expect(authz.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: Permission.WORKSPACE_DELETE,
        workspaceId: 'ws-1',
      }),
    );
    expect(db.delete).toHaveBeenCalledWith(workspaces);
  });
});
