import { AdminContentTypesService } from './admin-content-types.service';
import {
  asDb,
  createDbMock,
  serializeFragment,
} from '../testing/drizzle-mock';

const T0 = new Date('2026-01-15T10:00:00.000Z');
const T1 = new Date('2026-03-02T16:45:00.000Z');

function makeService() {
  const db = createDbMock();
  const service = new AdminContentTypesService(asDb(db));
  return { service, db };
}

function typeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ct-1',
    workspaceId: 'ws-1',
    projectId: 'p-1',
    name: 'Blog Post',
    apiId: 'post',
    fields: [{ id: 'title', type: 'text' }],
    deletedAt: null,
    createdAt: T0,
    updatedAt: T1,
    ...overrides,
  };
}

describe('AdminContentTypesService.list', () => {
  it('excludes soft-deleted types, paginates, serializes dates', async () => {
    const { service, db } = makeService();
    db.query.contentTypes.findMany.mockResolvedValue([typeRow()]);
    db.$count.mockResolvedValue(7);

    const page = await service.list({ page: 2, limit: 5 });

    expect(db.query.contentTypes.findMany.mock.calls[0][0]).toMatchObject({
      limit: 5,
      offset: 5,
    });
    expect(page).toMatchObject({ page: 2, limit: 5, total: 7 });
    expect(page.items[0]).toMatchObject({
      apiId: 'post',
      createdAt: T0.toISOString(),
      updatedAt: T1.toISOString(),
    });
  });

  it('workspace/project filters shared by items and total count', async () => {
    const { service, db } = makeService();
    db.query.contentTypes.findMany.mockResolvedValue([]);

    await service.list({ workspaceId: 'ws-9' });

    const findWhere = serializeFragment(
      db.query.contentTypes.findMany.mock.calls[0][0].where,
    );
    const countWhere = serializeFragment(db.$count.mock.calls[0][1]);
    for (const where of [findWhere, countWhere]) {
      expect(where).toContain('ws-9');
      expect(where).toContain('deleted'); // soft-delete exclusion everywhere
    }
  });
});
