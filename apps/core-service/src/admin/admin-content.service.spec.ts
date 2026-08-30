import { RpcException } from '@nestjs/microservices';
import { AdminContentService } from './admin-content.service';
import { writeChain, asDb, chainOf, createDbMock } from '../testing/drizzle-mock';

const T0 = new Date('2026-01-15T10:00:00.000Z');

function makeService() {
  const db = createDbMock();
  const cache = { purgeEntry: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminContentService(asDb(db), cache as never);
  return { service, db, cache };
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

function entryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e-1',
    workspaceId: 'ws-1',
    projectId: 'p1',
    contentTypeId: 'ct-1',
    slug: 'hello',
    status: 'draft',
    data: {},
    authorId: 'u1',
    createdBy: 'u1',
    updatedBy: null,
    publishedAt: T0,
    deletedAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

describe('AdminContentService.takedown — moderation force-unpublish', () => {
  it('writes the moderation status AND clears publishedAt (no longer reported published)', async () => {
    const { service, db, cache } = makeService();
    db.update.mockImplementationOnce(() => writeChain([entryRow({ status: 'draft', publishedAt: null })]));
    db.query.contentTypes.findFirst.mockResolvedValue({ apiId: 'post' });

    const row = await service.takedown({ id: 'e-1', dto: { status: 'draft' } });

    expect(chainOf(db.update).set).toHaveBeenCalledWith({
      status: 'draft',
      publishedAt: null,
    });
    expect(cache.purgeEntry).toHaveBeenCalledWith('post', 'e-1'); // CDN stops serving it
    // The takedown view reports the cleared publish state, not a stale date.
    expect(row.status).toBe('draft');
    expect(row.publishedAt).toBeNull();
  });

  it('unknown entry (empty returning) → NOT_FOUND, no purge', async () => {
    const { service, db, cache } = makeService();
    db.update.mockImplementationOnce(() => writeChain([]));

    const err = await rejection(service.takedown({ id: 'nope', dto: { status: 'draft' } }));

    expect(err.code).toBe('NOT_FOUND');
    expect(cache.purgeEntry).not.toHaveBeenCalled();
  });
});
