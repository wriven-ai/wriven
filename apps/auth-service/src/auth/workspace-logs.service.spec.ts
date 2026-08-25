import { WorkspaceLogsService } from './workspace-logs.service';
import * as schema from '../db/schema';
import { asDb, chain, chainOf, createDbMock } from '../testing/drizzle-mock';

const { workspaceActivityLog } = schema;

const T0 = new Date('2026-01-15T10:00:00.000Z');

function makeService() {
  const db = createDbMock();
  const service = new WorkspaceLogsService(asDb(db));
  return { service, db };
}

describe('WorkspaceLogsService.write', () => {
  it('normalizes optional fields to nulls/empty metadata', async () => {
    const { service, db } = makeService();
    db.insert.mockImplementationOnce(() => chain([]));

    await service.write({
      workspaceId: 'ws-1',
      userId: 'u-1',
      action: 'project.create',
    });

    expect(db.insert).toHaveBeenCalledWith(workspaceActivityLog);
    expect(chainOf(db.insert).values).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      userId: 'u-1',
      projectId: null,
      action: 'project.create',
      targetType: null,
      targetId: null,
      metadata: {},
    });
  });
});

describe('WorkspaceLogsService.list', () => {
  function logRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'log-1',
      userId: 'u-1',
      userName: 'Test User',
      userEmail: 'user@example.com',
      action: 'entry.published',
      targetType: 'entry',
      targetId: 'e-1',
      projectId: 'p1',
      metadata: { slug: 'hello' },
      createdAt: T0,
      ...overrides,
    };
  }

  it('paginates and maps rows into views', async () => {
    const { service, db } = makeService();
    db.select.mockImplementationOnce(() => chain([logRow(), logRow({ id: 'log-2' })]));
    db.$count.mockResolvedValue(42);

    const page = await service.list({ workspaceId: 'ws-1', page: 2, limit: 10 });

    expect(page.total).toBe(42);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      id: 'log-1',
      userName: 'Test User',
      action: 'entry.published',
      createdAt: T0.toISOString(),
    });
    const selectChain = chainOf(db.select);
    expect(selectChain.limit).toHaveBeenCalledWith(10);
    expect(selectChain.offset).toHaveBeenCalledWith(10); // (page - 1) * limit
  });

  it('defaults to page 1 / limit 20', async () => {
    const { service, db } = makeService();
    db.select.mockImplementationOnce(() => chain([]));
    db.$count.mockResolvedValue(0);

    const page = await service.list({ workspaceId: 'ws-1' });

    expect(page).toMatchObject({ page: 1, limit: 20, total: 0, items: [] });
    expect(chainOf(db.select).offset).toHaveBeenCalledWith(0);
  });

  it('left-join keeps rows alive when the actor was deleted (null user fields)', async () => {
    const { service, db } = makeService();
    db.select.mockImplementationOnce(() =>
      chain([logRow({ userId: null, userName: null, userEmail: null })]),
    );
    db.$count.mockResolvedValue(1);

    const page = await service.list({ workspaceId: 'ws-1' });

    expect(page.items[0]).toMatchObject({ userId: null, userName: null, userEmail: null });
  });
});
