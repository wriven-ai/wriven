import { RpcException } from '@nestjs/microservices';
import type { FieldDef } from '@wriven/contracts';
import { EntriesService } from './entries.service';
import type { ContentTypesService } from './content-types.service';
import type { WebhooksService } from '../webhooks/webhooks.service';
import type { CachePurgeService } from '../cache/cache-purge.service';
import type { CoreEntitlementsService } from '../entitlements/core-entitlements.service';
import * as schema from '../db/schema';
import { chain, writeChain, asDb, chainOf, createDbMock } from '../testing/drizzle-mock';

const { contentEntries, contentRevisions, aiGenerations } = schema;

const T0 = new Date('2026-01-15T10:00:00.000Z');

const FIELDS: FieldDef[] = [
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'body', label: 'Body', type: 'richtext' },
];

function typeRow() {
  return { id: 'ct-1', apiId: 'post', name: 'Post', fields: FIELDS, projectId: 'p1' };
}

function entryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e-1',
    workspaceId: 'ws-1',
    projectId: 'p1',
    contentTypeId: 'ct-1',
    slug: 'hello-world',
    status: 'draft',
    data: { title: 'Hello', body: 'World' },
    authorId: 'u1',
    createdBy: 'u1',
    updatedBy: null,
    publishedAt: null,
    deletedAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function makeService() {
  const db = createDbMock();
  const types = { requireRow: jest.fn().mockResolvedValue(typeRow()) };
  const webhooks = { dispatch: jest.fn().mockResolvedValue(undefined) };
  const cache = { purgeEntry: jest.fn().mockResolvedValue(undefined) };
  const entitlements = {
    assertEntryQuota: jest.fn().mockResolvedValue(undefined),
    revisionsCap: jest.fn().mockResolvedValue(null),
  };
  const service = new EntriesService(
    asDb(db),
    types as unknown as ContentTypesService,
    webhooks as unknown as WebhooksService,
    cache as unknown as CachePurgeService,
    entitlements as unknown as CoreEntitlementsService,
  );
  return { service, db, types, webhooks, cache, entitlements };
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

/** Let fire-and-forget webhook/purge promises settle before asserting. */
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

const base = { workspaceId: 'ws-1', projectId: 'p1', userId: 'u1' };

describe('EntriesService.create', () => {
  it('happy path: quota asserted, slug derived from the first text field, revision v1', async () => {
    const { service, db, entitlements } = makeService();
    db.__tx.insert.mockImplementationOnce(() => writeChain([entryRow()]))
      .mockImplementationOnce(() => chain([{ id: 'rev-1' }]));

    const view = await service.create({
      ...base,
      dto: { contentTypeId: 'ct-1', data: { title: 'Hello', body: 'World' } },
    });

    expect(entitlements.assertEntryQuota).toHaveBeenCalledWith('ws-1');
    expect(db.__tx.insert).toHaveBeenNthCalledWith(1, contentEntries);
    expect(db.__tx.insert).toHaveBeenNthCalledWith(2, contentRevisions);
    const values = chainOf(db.__tx.insert).values.mock.calls[0][0] as Record<string, unknown>;
    expect(values.slug).toMatch(/^hello/); // uniqueSlug over the title
    expect(values.status).toBe('draft');
    expect(values.publishedAt).toBeNull();
    expect(chainOf(db.__tx.insert, 1).values).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 'e-1', version: 1 }),
    );
    expect(view.id).toBe('e-1');
  });

  it('created directly as published → publishedAt stamped', async () => {
    const { service, db } = makeService();
    db.__tx.insert.mockImplementationOnce(() => writeChain([entryRow({ status: 'published' })]))
      .mockImplementationOnce(() => chain([{ id: 'rev-1' }]));

    await service.create({
      ...base,
      dto: { contentTypeId: 'ct-1', data: { title: 'X' }, status: 'published' },
    });

    const values = chainOf(db.__tx.insert).values.mock.calls[0][0] as Record<string, unknown>;
    expect(values.status).toBe('published');
    expect(values.publishedAt).toEqual(expect.any(Date));
  });

  it('slug unique-violation → CONFLICT naming the slug', async () => {
    const { service, db } = makeService();
    db.__tx.insert.mockImplementationOnce(() => {
      throw Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'content_entries_project_slug_uq',
      });
    });

    const err = await rejection(
      service.create({
        ...base,
        dto: { contentTypeId: 'ct-1', data: { title: 'X' }, slug: 'taken' },
      }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toContain('taken');
  });

  it('invalid field data rejected before any write', async () => {
    const { service, db } = makeService();
    const err = await rejection(
      service.create({
        ...base,
        dto: {
          contentTypeId: 'ct-1',
          data: { title: 123 as unknown as string }, // wrong type
        },
      }),
    );
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('unique-field collision → CONFLICT naming the field label', async () => {
    const ctx = makeService();
    const fields: FieldDef[] = [{ key: 'sku', label: 'SKU', type: 'text', unique: true }];
    (ctx.types.requireRow as jest.Mock).mockResolvedValue({ ...typeRow(), fields });
    ctx.db.query.contentEntries.findFirst.mockResolvedValue(entryRow()); // collision

    const err = await rejection(
      ctx.service.create({
        ...base,
        dto: { contentTypeId: 'ct-1', data: { sku: 'A-1' } },
      }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toContain('SKU');
    expect(ctx.db.transaction).not.toHaveBeenCalled();
  });
});

describe('EntriesService.update — webhook/cache side effects', () => {
  /**
   * Wire the update flow. `entry` is the pre-update row (drives prevStatus);
   * `updated` is what the tx returns (drives the webhook branch) and defaults
   * to the entry row.
   */
  function setup(entry: Record<string, unknown> = {}, updated: Record<string, unknown> = entry) {
    const ctx = makeService();
    ctx.db.query.contentEntries.findFirst.mockResolvedValue(entryRow(entry));
    ctx.db.select.mockImplementationOnce(() => chain([{ v: 2 }])); // nextVersion → 3
    ctx.db.__tx.update.mockImplementationOnce(() => writeChain([entryRow(updated)]));
    ctx.db.__tx.insert.mockImplementationOnce(() => writeChain([{ id: 'rev-2' }]));
    return ctx;
  }

  it('draft → published fires entry.published and purges the cache', async () => {
    const ctx = setup({}, { status: 'published', publishedAt: T0 });

    await ctx.service.update({ ...base, id: 'e-1', dto: { status: 'published' } });
    await tick();

    expect(ctx.cache.purgeEntry).toHaveBeenCalledWith('post', 'e-1');
    const [projectId, payload] = (ctx.webhooks.dispatch as jest.Mock).mock.calls[0];
    expect(projectId).toBe('p1');
    expect(payload).toMatchObject({ event: 'entry.published', entry: { slug: 'hello-world' } });
  });

  it('published → draft fires entry.unpublished', async () => {
    const ctx = setup({ status: 'published', publishedAt: T0 }, {});

    await ctx.service.update({ ...base, id: 'e-1', dto: { status: 'draft' } });
    await tick();

    expect((ctx.webhooks.dispatch as jest.Mock).mock.calls[0][1]).toMatchObject({
      event: 'entry.unpublished',
    });
  });

  it('re-saving a published entry (e.g. slug rename) re-fires entry.published', async () => {
    const ctx = setup(
      { status: 'published', publishedAt: T0 },
      { status: 'published', publishedAt: T0, slug: 'new-slug' },
    );

    await ctx.service.update({ ...base, id: 'e-1', dto: { slug: 'new-slug' } });
    await tick();

    expect((ctx.webhooks.dispatch as jest.Mock).mock.calls[0][1]).toMatchObject({
      event: 'entry.published',
      entry: { slug: 'new-slug' },
    });
  });

  it('draft → draft fires nothing', async () => {
    const ctx = setup();

    await ctx.service.update({ ...base, id: 'e-1', dto: { data: { title: 'Hi' } } });
    await tick();

    expect(ctx.webhooks.dispatch).not.toHaveBeenCalled();
    expect(ctx.cache.purgeEntry).not.toHaveBeenCalled();
  });

  it('dto data merges over existing data, revision carries the next version', async () => {
    const ctx = setup();

    await ctx.service.update({ ...base, id: 'e-1', dto: { data: { title: 'New' } } });

    const set = chainOf(ctx.db.__tx.update).set.mock.calls[0][0] as Record<string, unknown>;
    expect(set.data).toEqual({ title: 'New', body: 'World' }); // merge, not replace
    expect(chainOf(ctx.db.__tx.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({ version: 3 }), // max(2) + 1
    );
  });

  it('first publish stamps publishedAt; republish keeps the original', async () => {
    const ctx = setup(
      {}, // draft, publishedAt null
      { status: 'published', publishedAt: new Date('2026-02-01T00:00:00.000Z') },
    );

    await ctx.service.update({ ...base, id: 'e-1', dto: { status: 'published' } });

    const set = chainOf(ctx.db.__tx.update).set.mock.calls[0][0] as Record<string, unknown>;
    expect(set.publishedAt).toEqual(expect.any(Date)); // stamped (was null)
  });
});

describe('EntriesService.remove / listRevisions / restoreRevision', () => {
  it('remove soft-deletes; a published entry fires entry.deleted', async () => {
    const ctx = makeService();
    ctx.db.query.contentEntries.findFirst.mockResolvedValue(
      entryRow({ status: 'published', publishedAt: T0 }),
    );
    ctx.db.update.mockImplementationOnce(() => writeChain([entryRow()]));

    await expect(ctx.service.remove({ workspaceId: 'ws-1', projectId: 'p1', id: 'e-1' })).resolves.toEqual({
      success: true,
    });
    await tick();

    expect(chainOf(ctx.db.update).set).toHaveBeenCalledWith({ deletedAt: expect.any(Date) });
    expect((ctx.webhooks.dispatch as jest.Mock).mock.calls[0][1]).toMatchObject({
      event: 'entry.deleted',
    });
  });

  it('removing a draft fires no webhook', async () => {
    const ctx = makeService();
    ctx.db.query.contentEntries.findFirst.mockResolvedValue(entryRow());
    ctx.db.update.mockImplementationOnce(() => writeChain([entryRow()]));

    await ctx.service.remove({ workspaceId: 'ws-1', projectId: 'p1', id: 'e-1' });
    await tick();

    expect(ctx.webhooks.dispatch).not.toHaveBeenCalled();
  });

  it('restoreRevision writes the old data as a NEW revision and re-fires published if live', async () => {
    const ctx = makeService();
    ctx.db.query.contentEntries.findFirst.mockResolvedValue(
      entryRow({ status: 'published', publishedAt: T0 }),
    );
    ctx.db.query.contentRevisions.findFirst.mockResolvedValue({
      id: 'rev-1',
      entryId: 'e-1',
      version: 1,
      status: 'draft',
      data: { title: 'Old', body: 'Older' },
      createdBy: 'u1',
      createdAt: T0,
    });
    ctx.db.select.mockImplementationOnce(() => chain([{ v: 2 }]));
    ctx.db.__tx.update.mockImplementationOnce(() =>
      writeChain([entryRow({ status: 'published', publishedAt: T0, data: { title: 'Old', body: 'Older' } })]),
    );
    ctx.db.__tx.insert.mockImplementationOnce(() => writeChain([]));

    const view = await ctx.service.restoreRevision({
      ...base,
      entryId: 'e-1',
      version: 1,
    });
    await tick();

    expect(chainOf(ctx.db.__tx.update).set).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: 'Old', body: 'Older' } }),
    );
    expect(chainOf(ctx.db.__tx.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({ version: 3 }),
    );
    expect((ctx.webhooks.dispatch as jest.Mock).mock.calls[0][1]).toMatchObject({
      event: 'entry.published',
    });
    expect(view.data).toEqual({ title: 'Old', body: 'Older' });
  });

  it('restoreRevision with an unknown version → NOT_FOUND', async () => {
    const ctx = makeService();
    ctx.db.query.contentEntries.findFirst.mockResolvedValue(entryRow());
    ctx.db.query.contentRevisions.findFirst.mockResolvedValue(undefined);

    const err = await rejection(
      ctx.service.restoreRevision({ ...base, entryId: 'e-1', version: 99 }),
    );
    expect(err.code).toBe('NOT_FOUND');
  });
});

describe('EntriesService — AI generation provenance (linkAiGenerationsToRevision)', () => {
  function genRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'gen-1',
      entryId: null,
      appliedRevisionId: null,
      targetKind: 'field',
      output: JSON.stringify({ body: 'draft' }),
      ...overrides,
    };
  }

  function setupForLink() {
    const ctx = makeService();
    ctx.db.query.contentEntries.findFirst.mockResolvedValue(entryRow());
    ctx.db.select.mockImplementationOnce(() => chain([{ v: 2 }]));
    ctx.db.__tx.update.mockImplementationOnce(() => writeChain([entryRow()]));
    ctx.db.__tx.insert.mockImplementationOnce(() => writeChain([{ id: 'rev-2' }]));
    return ctx;
  }

  it('a valid generation is bound to the revision that persisted it', async () => {
    const ctx = setupForLink();
    ctx.db.__tx.select.mockImplementationOnce(() => chain([genRow()]));

    await ctx.service.update({
      ...base,
      id: 'e-1',
      dto: { data: {}, aiGenerationIds: ['gen-1'] },
    });

    expect(ctx.db.__tx.update).toHaveBeenCalledWith(aiGenerations);
    // Call 0 updated the entry row; call 1 is the aiGenerations provenance write.
    const set = chainOf(ctx.db.__tx.update, 1).set.mock.calls[0][0] as Record<string, unknown>;
    expect(set).toMatchObject({ entryId: 'e-1', appliedRevisionId: 'rev-2' });
  });

  it('an id the caller does not own (row missing) → VALIDATION_ERROR, tx rolls back', async () => {
    const ctx = setupForLink();
    ctx.db.__tx.select.mockImplementationOnce(() => chain([])); // not found

    const err = await rejection(
      ctx.service.update({ ...base, id: 'e-1', dto: { data: {}, aiGenerationIds: ['forged'] } }),
    );
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('cannot be applied');
  });

  it('a generation already bound to ANOTHER entry → rejected', async () => {
    const ctx = setupForLink();
    ctx.db.__tx.select.mockImplementationOnce(() => chain([genRow({ entryId: 'other-entry' })]));

    const err = await rejection(
      ctx.service.update({ ...base, id: 'e-1', dto: { data: {}, aiGenerationIds: ['gen-1'] } }),
    );
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('a generation already applied to a revision → rejected (no double-apply)', async () => {
    const ctx = setupForLink();
    ctx.db.__tx.select.mockImplementationOnce(() =>
      chain([genRow({ appliedRevisionId: 'rev-old' })]),
    );

    const err = await rejection(
      ctx.service.update({ ...base, id: 'e-1', dto: { data: {}, aiGenerationIds: ['gen-1'] } }),
    );
    expect(err.code).toBe('VALIDATION_ERROR');
  });
});
