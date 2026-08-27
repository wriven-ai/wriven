import { RpcException } from '@nestjs/microservices';
import { AdminTenancyService } from './admin-tenancy.service';
import * as schema from '../db/schema';
import { chain, writeChain, asDb, chainOf, createDbMock } from '../testing/drizzle-mock';
import { serializeFragment } from '../testing/drizzle-mock';
import { userRow, workspaceRow } from '../testing/fixtures';

const { refreshTokens, projects } = schema;

const USER_ID = '11111111-1111-4111-8111-111111111111';
const T0 = new Date('2026-01-01T00:00:00.000Z');

function makeService() {
  const db = createDbMock();
  const service = new AdminTenancyService(asDb(db));
  return { service, db };
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

describe('AdminTenancyService.listUsers', () => {
  it('enriches rows with workspace counts and the suspended flag', async () => {
    const { service, db } = makeService();
    db.query.users.findMany.mockResolvedValue([
      userRow(),
      userRow({ id: 'u-2', email: 'banned@example.com', suspendedAt: T0 }),
    ]);
    db.$count.mockResolvedValue(2);
    // workspaceCounts() aggregation
    db.select.mockImplementationOnce(() => chain([{ id: USER_ID, c: 3 }]));

    const page = await service.listUsers({});

    expect(page.total).toBe(2);
    expect(page.items[0]).toMatchObject({
      email: 'user@example.com',
      suspended: false,
      workspaceCount: 3,
    });
    expect(page.items[1]).toMatchObject({ suspended: true, workspaceCount: 0 });
  });
});

describe('AdminTenancyService.getUser', () => {
  it('unknown → NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue(undefined);
    const err = await rejection(service.getUser({ id: 'nope' }));
    expect(err.code).toBe('NOT_FOUND');
  });

  it('returns workspaces + projects with the user roles', async () => {
    const { service, db } = makeService();
    db.query.users.findFirst.mockResolvedValue(userRow());
    db.query.workspaceMembers.findMany.mockResolvedValue([
      { role: 'owner', workspace: { id: 'ws-1', name: 'Acme', slug: 'acme' } },
    ]);
    db.query.projectMembers.findMany.mockResolvedValue([
      { role: 'admin', project: { id: 'p1', name: 'Blog', workspaceId: 'ws-1' } },
    ]);

    const detail = await service.getUser({ id: USER_ID });

    expect(detail.workspaces).toEqual([
      { id: 'ws-1', name: 'Acme', slug: 'acme', role: 'owner' },
    ]);
    expect(detail.projects).toEqual([
      { id: 'p1', name: 'Blog', workspaceId: 'ws-1', role: 'admin' },
    ]);
  });
});

describe('AdminTenancyService.updateUser', () => {
  it('suspending stamps suspendedAt AND revokes every refresh token', async () => {
    const { service, db } = makeService();
    db.update.mockImplementationOnce(() => writeChain([userRow({ suspendedAt: T0 })])) // users
      .mockImplementationOnce(() => chain([])); // refreshTokens
    db.select.mockImplementationOnce(() => chain([{ id: USER_ID, c: 1 }]));

    const row = await service.updateUser({ id: USER_ID, dto: { suspended: true } });

    expect(chainOf(db.update).set).toHaveBeenCalledWith({
      suspendedAt: expect.any(Date),
    });
    expect(db.update).toHaveBeenNthCalledWith(2, refreshTokens);
    expect(chainOf(db.update, 1).set).toHaveBeenCalledWith({ revoked: true });
    const where = serializeFragment(chainOf(db.update, 1).where.mock.calls[0][0]);
    expect(where).toContain(USER_ID);
    expect(row.suspended).toBe(true);
  });

  it('unsuspending clears suspendedAt and leaves sessions alone', async () => {
    const { service, db } = makeService();
    db.update.mockImplementationOnce(() => writeChain([userRow()]));
    db.select.mockImplementationOnce(() => chain([{ id: USER_ID, c: 1 }]));

    await service.updateUser({ id: USER_ID, dto: { suspended: false } });

    expect(chainOf(db.update).set).toHaveBeenCalledWith({ suspendedAt: null });
    expect(db.update).toHaveBeenCalledTimes(1); // no refreshTokens write
  });

  it('update matching no row → NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.update.mockImplementationOnce(() => writeChain([]));

    const err = await rejection(
      service.updateUser({ id: 'nope', dto: { emailVerified: true } }),
    );
    expect(err.code).toBe('NOT_FOUND');
  });
});

describe('AdminTenancyService.deleteUser', () => {
  it('missing row → NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.delete.mockImplementationOnce(() => writeChain([]));

    const err = await rejection(service.deleteUser({ id: 'nope' }));
    expect(err.code).toBe('NOT_FOUND');
  });

  it('FK restrict from owned workspaces/projects → friendly CONFLICT', async () => {
    const { service, db } = makeService();
    db.delete.mockImplementationOnce(() => {
      throw Object.assign(new Error('restrict'), { code: '23503' });
    });

    const err = await rejection(service.deleteUser({ id: USER_ID }));
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toContain('Transfer or delete');
  });
});

describe('AdminTenancyService.listWorkspaces', () => {
  it('merges counts + plan; unassigned workspaces read as free', async () => {
    const { service, db } = makeService();
    db.query.workspaces.findMany.mockResolvedValue([
      { ...workspaceRow(), creator: { email: 'user@example.com' } },
    ]);
    db.$count.mockResolvedValue(1);
    db.select
      .mockImplementationOnce(() => chain([{ id: 'ws-1', c: 4 }])) // memberCounts
      .mockImplementationOnce(() => chain([{ id: 'ws-1', c: 2 }])); // activeProjectCounts
    db.query.subscriptions.findMany.mockResolvedValue([
      { workspaceId: 'ws-1', status: 'active', plan: { key: 'pro', name: 'Pro' } },
    ]);

    const page = await service.listWorkspaces({});

    expect(page.items[0]).toMatchObject({
      id: 'ws-1',
      ownerEmail: 'user@example.com',
      memberCount: 4,
      projectCount: 2,
      planKey: 'pro',
      planName: 'Pro',
      subscriptionStatus: 'active',
    });
  });

  it('workspace without a subscription defaults to free', async () => {
    const { service, db } = makeService();
    db.query.workspaces.findMany.mockResolvedValue([{ ...workspaceRow(), creator: null }]);
    db.$count.mockResolvedValue(1);
    db.select
      .mockImplementationOnce(() => chain([]))
      .mockImplementationOnce(() => chain([]));
    db.query.subscriptions.findMany.mockResolvedValue([]);

    const page = await service.listWorkspaces({});

    expect(page.items[0]).toMatchObject({
      planKey: 'free',
      planName: 'Free',
      subscriptionStatus: null,
      ownerEmail: null,
    });
  });
});

describe('AdminTenancyService.getWorkspace / workspaceExists / deleteProject', () => {
  it('getWorkspace counts only ACTIVE projects and lists members', async () => {
    const { service, db } = makeService();
    db.query.workspaces.findFirst.mockResolvedValue({
      ...workspaceRow(),
      creator: { email: 'user@example.com' },
    });
    db.query.workspaceMembers.findMany.mockResolvedValue([
      { role: 'owner', user: { id: USER_ID, email: 'user@example.com', name: 'Test User' } },
    ]);
    db.query.projects.findMany.mockResolvedValue([
      { id: 'p1', name: 'Live', slug: 'live', deletedAt: null },
      { id: 'p2', name: 'Dead', slug: 'dead', deletedAt: T0 },
    ]);
    db.query.subscriptions.findMany.mockResolvedValue([]);

    const detail = await service.getWorkspace({ id: 'ws-1' });

    expect(detail.projectCount).toBe(1);
    expect(detail.projects).toEqual([{ id: 'p1', name: 'Live', slug: 'live' }]);
    expect(detail.members).toEqual([
      { userId: USER_ID, email: 'user@example.com', name: 'Test User', role: 'owner' },
    ]);
  });

  it('workspaceExists is a boolean probe', async () => {
    const { service, db } = makeService();
    db.query.workspaces.findFirst.mockResolvedValueOnce({ id: 'ws-1' });
    db.query.workspaces.findFirst.mockResolvedValueOnce(undefined);

    expect(await service.workspaceExists('ws-1')).toBe(true);
    expect(await service.workspaceExists('nope')).toBe(false);
  });

  it('deleteProject soft-deletes; missing → NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.update.mockImplementationOnce(() => writeChain([{ id: 'p1' }]));
    await expect(service.deleteProject({ id: 'p1' })).resolves.toEqual({ success: true });
    expect(chainOf(db.update).set).toHaveBeenCalledWith({ deletedAt: expect.any(Date) });
    expect(db.update).toHaveBeenCalledWith(projects);

    db.update.mockImplementationOnce(() => writeChain([]));
    const err = await rejection(service.deleteProject({ id: 'nope' }));
    expect(err.code).toBe('NOT_FOUND');
  });
});

describe('AdminTenancyService.listProjects / getProject', () => {
  it('rows carry the workspace name and the deleted flag', async () => {
    const { service, db } = makeService();
    db.query.projects.findMany.mockResolvedValue([
      {
        id: 'p1',
        name: 'Blog',
        slug: 'blog',
        workspaceId: 'ws-1',
        createdBy: USER_ID,
        deletedAt: null,
        createdAt: T0,
        workspace: { name: 'Acme' },
      },
    ]);
    db.$count.mockResolvedValue(1);

    const page = await service.listProjects({ workspaceId: 'ws-1' });

    expect(page.items[0]).toMatchObject({
      id: 'p1',
      workspaceName: 'Acme',
      deleted: false,
    });
  });

  it('getProject: unknown → NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.query.projects.findFirst.mockResolvedValue(undefined);
    const err = await rejection(service.getProject({ id: 'nope' }));
    expect(err.code).toBe('NOT_FOUND');
  });
});
