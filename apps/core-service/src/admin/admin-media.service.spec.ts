import { RpcException } from '@nestjs/microservices';
import { AdminMediaService } from './admin-media.service';
import {
  chain,
  writeChain,
  asDb,
  chainOf,
  createDbMock,
  serializeFragment,
} from '../testing/drizzle-mock';

const T0 = new Date('2026-01-15T10:00:00.000Z');

function makeService() {
  const db = createDbMock();
  const service = new AdminMediaService(asDb(db));
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

function mediaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    workspaceId: 'ws-1',
    projectId: 'p-1',
    kind: 'image',
    mime: 'image/png',
    sizeBytes: 2048,
    originalFilename: 'logo.png',
    uploadedBy: 'u-1',
    deletedAt: null,
    createdAt: T0,
    ...overrides,
  };
}

describe('AdminMediaService.list', () => {
  it('paginates soft-deleted-excluded assets with Date→ISO rows', async () => {
    const { service, db } = makeService();
    db.query.mediaAssets.findMany.mockResolvedValue([mediaRow()]);
    db.$count.mockResolvedValue(41);

    const page = await service.list({ page: 3, limit: 10 });

    const arg = db.query.mediaAssets.findMany.mock.calls[0][0];
    expect(arg).toMatchObject({ limit: 10, offset: 20 }); // (page-1) × limit
    // Soft-delete filter rides in the same where as any scoping filters.
    expect(db.$count).toHaveBeenCalledTimes(1);
    expect(page).toMatchObject({ page: 3, limit: 10, total: 41 });
    expect(page.items[0]).toMatchObject({
      id: 'm-1',
      createdAt: T0.toISOString(), // serialized, not a raw Date over the wire
    });
  });

  it('workspace/project filters land in the shared where (count sees the same set)', async () => {
    const { service, db } = makeService();
    db.query.mediaAssets.findMany.mockResolvedValue([]);

    await service.list({ workspaceId: 'ws-9', projectId: 'p-9' });

    const findWhere = serializeFragment(db.query.mediaAssets.findMany.mock.calls[0][0].where);
    expect(findWhere).toContain('ws-9');
    expect(findWhere).toContain('p-9');
    // The $count predicate must be the SAME filter — totals can't drift from items.
    const countWhere = serializeFragment(db.$count.mock.calls[0][1]);
    expect(countWhere).toContain('ws-9');
    expect(countWhere).toContain('p-9');
  });
});

describe('AdminMediaService.usage — per-workspace storage', () => {
  it('aggregates per workspace with numeric coercion (driver returns strings)', async () => {
    const { service, db } = makeService();
    db.select.mockImplementationOnce(() =>
      chain([
        { workspaceId: 'ws-1', assetCount: '7', totalBytes: '1048576' },
        { workspaceId: 'ws-2', assetCount: '1', totalBytes: '0' },
      ]),
    );

    const rows = await service.usage();

    expect(rows).toEqual([
      { workspaceId: 'ws-1', assetCount: 7, totalBytes: 1048576 },
      { workspaceId: 'ws-2', assetCount: 1, totalBytes: 0 },
    ]);
    expect(typeof rows[0].totalBytes).toBe('number'); // not '1048576' the string
  });
});

describe('AdminMediaService.purge — moderation soft-delete', () => {
  it('soft-deletes by id and reports success', async () => {
    const { service, db } = makeService();
    db.update.mockImplementationOnce(() => writeChain([{ id: 'm-1' }]));

    const result = await service.purge({ id: 'm-1' });

    expect(db.update).toHaveBeenCalledWith(expect.anything());
    expect(chainOf(db.update).set).toHaveBeenCalledWith({ deletedAt: expect.any(Date) });
    expect(result).toEqual({ success: true });
  });

  it('unknown asset (empty returning) → NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.update.mockImplementationOnce(() => writeChain([]));

    const err = await rejection(service.purge({ id: 'nope' }));
    expect(err.code).toBe('NOT_FOUND');
  });
});
