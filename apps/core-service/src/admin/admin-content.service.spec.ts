import { RpcException } from '@nestjs/microservices';
import { AdminContentService } from './admin-content.service';
import { writeChain, asDb, chainOf, createDbMock } from '../testing/drizzle-mock';

const T0 = new Date('2026-01-15T10:00:00.000Z');

function makeService() {
  const db = createDbMock();
  const cache = { purgeEntry: jest.fn().mockResolvedValue(undefined) };
  const webhooks = { dispatch: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminContentService(asDb(db), cache as never, webhooks as never);
  return { service, db, cache, webhooks };
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
    const { service, db, cache, webhooks } = makeService();
    db.query.contentEntries.findFirst.mockResolvedValue({ id: 'e-1', status: 'published' });
    db.update.mockImplementationOnce(() => writeChain([entryRow({ status: 'draft', publishedAt: null })]));
    db.query.contentTypes.findFirst.mockResolvedValue({ apiId: 'post' });

    const row = await service.takedown({ id: 'e-1', dto: { status: 'draft' } });

    expect(chainOf(db.update).set).toHaveBeenCalledWith({
      status: 'draft',
      publishedAt: null,
    });
    expect(cache.purgeEntry).toHaveBeenCalledWith('post', 'e-1'); // CDN stops serving it
    // Webhook-driven display sites hear about the takedown (was published).
    expect(webhooks.dispatch).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ event: 'entry.unpublished' }),
    );
    // The takedown view reports the cleared publish state, not a stale date.
    expect(row.status).toBe('draft');
    expect(row.publishedAt).toBeNull();
  });

  it('no webhook when the entry was never published (nothing live to invalidate)', async () => {
    const { service, db, webhooks } = makeService();
    db.query.contentEntries.findFirst.mockResolvedValue({ id: 'e-1', status: 'draft' });
    db.update.mockImplementationOnce(() => writeChain([entryRow({ status: 'archived', publishedAt: null })]));
    db.query.contentTypes.findFirst.mockResolvedValue({ apiId: 'post' });

    await service.takedown({ id: 'e-1', dto: { status: 'archived' } });

    expect(webhooks.dispatch).not.toHaveBeenCalled();
  });

  it('unknown entry → NOT_FOUND before any write or purge', async () => {
    const { service, db, cache } = makeService();
    db.query.contentEntries.findFirst.mockResolvedValue(undefined);

    const err = await rejection(service.takedown({ id: 'nope', dto: { status: 'draft' } }));

    expect(err.code).toBe('NOT_FOUND');
    expect(db.update).not.toHaveBeenCalled();
    expect(cache.purgeEntry).not.toHaveBeenCalled();
  });
});
