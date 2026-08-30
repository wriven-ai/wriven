import { RpcException } from '@nestjs/microservices';
import type { DeliveryMedia, FieldDef } from '@wriven/contracts';
import { DeliveryService } from './delivery.service';
import type { MediaService } from '../media/media.service';
import { asDb, createDbMock, serializeFragment } from '../testing/drizzle-mock';


const T0 = new Date('2026-01-15T10:00:00.000Z');

function typeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ct-1',
    workspaceId: 'ws-1',
    projectId: 'p1',
    apiId: 'post',
    name: 'Post',
    fields: [] as FieldDef[],
    createdBy: 'u1',
    createdAt: T0,
    updatedAt: T0,
    deletedAt: null,
    ...overrides,
  };
}

function entryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e-1',
    workspaceId: 'ws-1',
    projectId: 'p1',
    contentTypeId: 'ct-1',
    slug: 'hello',
    status: 'published',
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

function mediaView(overrides: Partial<DeliveryMedia> = {}): DeliveryMedia {
  return {
    id: 'm-1',
    url: 'https://cdn.example.com/projects/p1/m-1.png',
    mime: 'image/png',
    width: 640,
    height: 480,
    alt: 'A photo',
    ...overrides,
  };
}

function makeService() {
  const db = createDbMock();
  const resolveMany = jest.fn().mockResolvedValue(new Map<string, DeliveryMedia>());
  const media = { resolveMany };
  const service = new DeliveryService(asDb(db), media as unknown as MediaService);
  return { service, db, resolveMany };
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

/**
 * Bound parameter values of a drizzle where-fragment: objects shaped
 * `{ value: string, encoder: … }`. Walking params structurally (not string
 * matching) avoids false hits on column schema metadata like the status
 * column's `default: 'draft'`.
 */
function boundValues(fragment: unknown, out: string[] = []): string[] {
  if (Array.isArray(fragment)) {
    for (const item of fragment) boundValues(item, out);
    return out;
  }
  if (!fragment || typeof fragment !== 'object') return out;
  const obj = fragment as Record<string, unknown>;
  if (typeof obj.value === 'string' && 'encoder' in obj) {
    out.push(obj.value);
    return out;
  }
  for (const key of Object.keys(obj)) {
    if (key === 'table' || key === 'config') continue; // schema metadata, not params
    boundValues(obj[key], out);
  }
  return out;
}

/** Bound where-params of the entries findMany/findFirst call. */
function whereParamsOf(mock: jest.Mock): string[] {
  return boundValues(mock.mock.calls[mock.mock.calls.length - 1][0]?.where);
}

describe('DeliveryService — status visibility (the draft-leak guard)', () => {
  it('read keys see published ONLY — the where fragment must never contain "draft"', async () => {
    const { service, db } = makeService();
    db.query.contentTypes.findFirst.mockResolvedValue(typeRow());
    db.query.contentEntries.findMany.mockResolvedValue([]);
    db.$count.mockResolvedValue(0);

    await service.list({ projectId: 'p1', apiId: 'post', query: {} });

    const w = whereParamsOf(db.query.contentEntries.findMany);
    expect(w).toContain('published');
    expect(w).not.toContain('draft'); // the visibility gate itself
  });

  it('preview keys also see drafts', async () => {
    const { service, db } = makeService();
    db.query.contentTypes.findFirst.mockResolvedValue(typeRow());
    db.query.contentEntries.findMany.mockResolvedValue([]);
    db.$count.mockResolvedValue(0);

    await service.list({ projectId: 'p1', apiId: 'post', query: {}, preview: true });

    expect(whereParamsOf(db.query.contentEntries.findMany)).toContain('draft');
  });

  it('get() applies the same visibility gate', async () => {
    const { service, db } = makeService();
    db.query.contentTypes.findFirst.mockResolvedValue(typeRow());
    db.query.contentEntries.findFirst.mockResolvedValue(entryRow());

    await service.get({ projectId: 'p1', apiId: 'post', slug: 'hello', query: {} });

    const w = whereParamsOf(db.query.contentEntries.findFirst);
    expect(w).toContain('published');
    expect(w).not.toContain('draft');
  });
});

describe('DeliveryService.list — filters, sorting, pagination', () => {
  function setup() {
    const ctx = makeService();
    ctx.db.query.contentTypes.findFirst.mockResolvedValue(typeRow());
    ctx.db.query.contentEntries.findMany.mockResolvedValue([]);
    ctx.db.$count.mockResolvedValue(0);
    return ctx;
  }

  it('nested operator payload → VALIDATION_ERROR, never a silent no-match', async () => {
    const { service } = setup();
    const err = await rejection(
      service.list({
        projectId: 'p1',
        apiId: 'post',
        query: { filter: { rating: { gte: 4 } } } as never,
      }),
    );
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('no nested operators');
  });

  it('equality filter is parameterized into the where fragment (key AND value bound)', async () => {
    const { service, db } = setup();

    await service.list({
      projectId: 'p1',
      apiId: 'post',
      query: { filter: { rating: '4' } },
    });

    const w = serializeFragment(db.query.contentEntries.findMany.mock.calls[0][0]?.where);
    expect(w).toContain('rating'); // the filter KEY is bound into the JSONB access
    expect(w).toContain('4'); // and the VALUE is a bound param, not interpolated SQL
  });

  it.each([
    ['-createdAt', 'created_at'],
    ['slug', 'slug'],
    ['hax-unknown', 'published_at'], // unknown column falls back to publishedAt desc
    [undefined, 'published_at'],
  ])('sort "%s" orders by %s', async (sort, expectedColumn) => {
    const { service, db } = setup();

    await service.list({ projectId: 'p1', apiId: 'post', query: { sort } });

    const orderBy = db.query.contentEntries.findMany.mock.calls[0][0]?.orderBy;
    expect(serializeFragment(orderBy)).toContain(expectedColumn);
  });

  it('pagination: page/limit defaults and offset math', async () => {
    const { service, db } = setup();

    const page = await service.list({
      projectId: 'p1',
      apiId: 'post',
      query: { page: 3, limit: 5 },
    });

    expect(page).toMatchObject({ page: 3, limit: 5, total: 0, items: [] });
    const args = db.query.contentEntries.findMany.mock.calls[0][0];
    expect(args.limit).toBe(5);
    expect(args.offset).toBe(10);
  });

  it('unknown content type → NOT_FOUND before any entry query', async () => {
    const { service, db } = makeService();
    db.query.contentTypes.findFirst.mockResolvedValue(undefined);

    const err = await rejection(service.list({ projectId: 'p1', apiId: 'nope', query: {} }));
    expect(err.code).toBe('NOT_FOUND');
    expect(db.query.contentEntries.findMany).not.toHaveBeenCalled();
  });
});

describe('DeliveryService.get', () => {
  it('unknown slug → NOT_FOUND', async () => {
    const { service, db } = makeService();
    db.query.contentTypes.findFirst.mockResolvedValue(typeRow());
    db.query.contentEntries.findFirst.mockResolvedValue(undefined);

    const err = await rejection(
      service.get({ projectId: 'p1', apiId: 'post', slug: 'ghost', query: {} }),
    );
    expect(err.code).toBe('NOT_FOUND');
  });
});

describe('DeliveryService — media + rich-text hydration', () => {
  it('media field ids are replaced by resolved objects (or null), collect is batched', async () => {
    const { service, db, resolveMany } = makeService();
    db.query.contentTypes.findFirst.mockResolvedValue(
      typeRow({
        fields: [
          { key: 'cover', label: 'Cover', type: 'media' },
          { key: 'gallery', label: 'Gallery', type: 'media', multiple: true },
        ] as FieldDef[] as unknown as FieldDef[],
      }),
    );
    db.query.contentEntries.findFirst.mockResolvedValue(
      entryRow({ data: { cover: 'm-1', gallery: ['m-1', 'm-2'] } }),
    );
    resolveMany.mockResolvedValue(
      new Map([
        ['m-1', mediaView()],
        ['m-2', mediaView({ id: 'm-2', mime: 'video/mp4', width: null, height: null })],
      ]),
    );

    const entry = await service.get({ projectId: 'p1', apiId: 'post', slug: 'hello', query: {} });

    // One batched call for both fields, ids collected (dedup not required by contract).
    expect(resolveMany).toHaveBeenCalledWith('p1', ['m-1', 'm-1', 'm-2']);
    expect(entry.data.cover).toMatchObject({ id: 'm-1', mime: 'image/png' });
    expect(entry.data.gallery).toHaveLength(2);
  });

  it('rich-text image nodes get hydrated src/dimensions; unresolved assets get src null', async () => {
    const { service, db, resolveMany } = makeService();
    db.query.contentTypes.findFirst.mockResolvedValue(
      typeRow({ fields: [{ key: 'body', label: 'Body', type: 'richtext' }] as FieldDef[] as unknown as FieldDef[] }),
    );
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'image', attrs: { assetId: 'm-1', alt: 'Custom alt' } },
            { type: 'image', attrs: { assetId: 'm-gone' } },
          ],
        },
      ],
    };
    db.query.contentEntries.findFirst.mockResolvedValue(entryRow({ data: { body: doc } }));
    resolveMany.mockResolvedValue(new Map([['m-1', mediaView()]]));

    const entry = await service.get({ projectId: 'p1', apiId: 'post', slug: 'hello', query: {} });

    expect(resolveMany).toHaveBeenCalledWith('p1', ['m-1', 'm-gone']);
    const imgs = (entry.data.body as typeof doc).content![0].content!;
    expect(imgs[0].attrs).toMatchObject({ src: 'https://cdn.example.com/projects/p1/m-1.png', alt: 'Custom alt', width: 640, height: 480, mime: 'image/png' });
    expect(imgs[1].attrs).toMatchObject({ src: null }); // dead asset never breaks rendering
  });
});

describe('DeliveryService — reference expansion + select projection', () => {
  const fields = [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'related', label: 'Related', type: 'reference', refTypeId: 'ct-2' },
    { key: 'secret', label: 'Internal', type: 'text' },
  ] as FieldDef[] as unknown as FieldDef[];

  function setup() {
    const ctx = makeService();
    ctx.db.query.contentTypes.findFirst.mockResolvedValueOnce(typeRow({ fields }));
    return ctx;
  }

  it('include>0 expands a published reference; unpublished refs stay raw ids', async () => {
    const { service, db } = setup();
    db.query.contentEntries.findFirst
      .mockResolvedValueOnce(entryRow({ data: { title: 'A', related: 'e-2', secret: 'x' } }))
      .mockResolvedValueOnce(entryRow({ id: 'e-2', slug: 'nested', contentTypeId: 'ct-2', data: { title: 'B' } }));
    db.query.contentTypes.findFirst.mockResolvedValueOnce(typeRow({ id: 'ct-2', apiId: 'page' }));

    const entry = await service.get({
      projectId: 'p1',
      apiId: 'post',
      slug: 'hello',
      query: { include: 1 },
    });

    expect(entry.data.related).toMatchObject({ id: 'e-2', type: 'page', slug: 'nested', data: { title: 'B' } });
  });

  it('unresolved/unpublished reference keeps the raw id (never null, never a throw)', async () => {
    const { service, db } = setup();
    db.query.contentEntries.findFirst
      .mockResolvedValueOnce(entryRow({ data: { related: 'e-9' } }))
      .mockResolvedValueOnce(undefined); // ref lookup: not published

    const entry = await service.get({
      projectId: 'p1',
      apiId: 'post',
      slug: 'hello',
      query: { include: 1 },
    });

    expect(entry.data.related).toBe('e-9');
  });

  it('include=0 never queries references', async () => {
    const { service, db } = setup();
    db.query.contentEntries.findFirst.mockResolvedValue(entryRow({ data: { related: 'e-2' } }));

    await service.get({ projectId: 'p1', apiId: 'post', slug: 'hello', query: {} });

    expect(db.query.contentEntries.findFirst).toHaveBeenCalledTimes(1); // only the slug lookup
  });

  it('select projects only requested keys that exist', async () => {
    const { service, db } = setup();
    db.query.contentEntries.findFirst.mockResolvedValue(
      entryRow({ data: { title: 'A', related: 'r', secret: 'x' } }),
    );

    const entry = await service.get({
      projectId: 'p1',
      apiId: 'post',
      slug: 'hello',
      query: { select: 'title, missing, secret' },
    });

    expect(Object.keys(entry.data).sort()).toEqual(['secret', 'title']);
  });
});
