import { RpcException } from '@nestjs/microservices';
import { DeliveryService } from '../../src/delivery/delivery.service';
import type { MediaService } from '../../src/media/media.service';
import * as schema from '../../src/db/schema';
import { startTestDb, type TestDb } from './test-db';

jest.setTimeout(30_000);

let testDb: TestDb;
let service: DeliveryService;

const WS = '11111111-1111-4111-8111-111111111111';
const P1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const P2 = 'aaaaaaaa-0000-4000-8000-000000000002'; // another tenant project
const USER = '99999999-9999-4999-8999-999999999999';

beforeAll(async () => {
  testDb = await startTestDb();
  const media = { publicUrl: (k: string) => `https://cdn.example/${k}` } as unknown as MediaService;
  service = new DeliveryService(testDb.db, media);
});

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(async () => {
  await testDb.truncate();
});

/** One type per project + N entries: [slug, status, data]. */
async function seed(
  projectId: string,
  entries: Array<{ slug: string; status: string; data: Record<string, unknown> }>,
) {
  const [type] = await testDb.db
    .insert(schema.contentTypes)
    .values({
      workspaceId: WS,
      projectId,
      name: 'Post',
      apiId: 'post',
      fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'category', label: 'Category', type: 'select', options: ['news', 'sports'] },
      ],
      createdBy: USER,
    })
    .returning();
  await testDb.db.insert(schema.contentEntries).values(
    entries.map((e) => ({
      workspaceId: WS,
      projectId,
      contentTypeId: type.id,
      slug: e.slug,
      status: e.status,
      data: e.data,
      authorId: USER,
      createdBy: USER,
      ...(e.status === 'published' ? { publishedAt: new Date() } : {}),
    })),
  );
  return type;
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    if (err instanceof RpcException) {
      return err.getError() as { code: string };
    }
    throw err;
  }
  throw new Error('expected rejection');
}

describe('DeliveryService.list — real JSONB filters + visibility against Postgres', () => {
  beforeEach(async () => {
    await seed(P1, [
      { slug: 'news-1', status: 'published', data: { title: 'N1', category: 'news' } },
      { slug: 'news-2', status: 'draft', data: { title: 'N2', category: 'news' } },
      { slug: 'sport-1', status: 'published', data: { title: 'S1', category: 'sports' } },
    ]);
    await seed(P2, [
      { slug: 'news-1', status: 'published', data: { title: 'OTHER TENANT', category: 'news' } },
    ]);
  });

  it('JSONB equality filter matches only that value, published only', async () => {
    const page = await service.list({
      projectId: P1,
      apiId: 'post',
      query: { filter: { category: 'news' } } as never,
    });

    expect(page.total).toBe(1);
    expect(page.items.map((e) => e.slug)).toEqual(['news-1']); // draft news-2 excluded
  });

  it('no filter → all published entries of the project, never another project', async () => {
    const page = await service.list({ projectId: P1, apiId: 'post', query: {} as never });

    expect(page.total).toBe(2);
    expect(page.items.map((e) => e.slug).sort()).toEqual(['news-1', 'sport-1']);
  });

  it('preview sees drafts; the public read does not', async () => {
    const preview = await service.list({
      projectId: P1,
      apiId: 'post',
      query: { filter: { category: 'news' } } as never,
      preview: true,
    });
    expect(preview.total).toBe(2);

    const live = await service.list({
      projectId: P1,
      apiId: 'post',
      query: { filter: { category: 'news' } } as never,
    });
    expect(live.total).toBe(1);
  });

  it('same slug in another project is invisible cross-project (tenant isolation)', async () => {
    const theirs = await service.list({ projectId: P2, apiId: 'post', query: {} as never });
    expect(theirs.total).toBe(1);
    expect(theirs.items[0].data).toEqual({ title: 'OTHER TENANT', category: 'news' });
  });
});

describe('DeliveryService.get — slug + visibility against Postgres', () => {
  beforeEach(async () => {
    await seed(P1, [
      { slug: 'live', status: 'published', data: { title: 'Live', category: 'news' } },
      { slug: 'wip', status: 'draft', data: { title: 'WIP', category: 'news' } },
    ]);
  });

  it('published slug resolves; draft slug NOT_FOUND without preview, found with', async () => {
    const live = await service.get({ projectId: P1, apiId: 'post', slug: 'live', query: {} as never });
    expect(live.slug).toBe('live');

    const err = await rejection(
      service.get({ projectId: P1, apiId: 'post', slug: 'wip', query: {} as never }),
    );
    expect(err.code).toBe('NOT_FOUND');

    const wip = await service.get({
      projectId: P1,
      apiId: 'post',
      slug: 'wip',
      query: {} as never,
      preview: true,
    });
    expect(wip.slug).toBe('wip');
  });
});
