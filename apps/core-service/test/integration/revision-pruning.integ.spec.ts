import { asc, eq } from 'drizzle-orm';
import { EntriesService } from '../../src/content/entries.service';
import { ContentTypesService } from '../../src/content/content-types.service';
import type { CoreEntitlementsService } from '../../src/entitlements/core-entitlements.service';
import type { WebhooksService } from '../../src/webhooks/webhooks.service';
import type { CachePurgeService } from '../../src/cache/cache-purge.service';
import * as schema from '../../src/db/schema';
import { startTestDb, type TestDb } from './test-db';

jest.setTimeout(30_000);

let testDb: TestDb;
let service: EntriesService;

const WS = '11111111-1111-4111-8111-111111111111';
const P1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const USER = '99999999-9999-4999-8999-999999999999';

const FIELDS = [
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'body', label: 'Body', type: 'richtext' },
];

beforeAll(async () => {
  testDb = await startTestDb();
  const entitlements = {
    assertEntryQuota: jest.fn().mockResolvedValue(undefined),
    // Small cap so the prune DELETE actually runs with real SQL.
    revisionsCap: jest.fn().mockResolvedValue(2),
  } as unknown as CoreEntitlementsService;
  const types = new ContentTypesService(testDb.db, entitlements);
  const webhooks = { dispatch: jest.fn().mockResolvedValue(undefined) } as unknown as WebhooksService;
  const cache = { purgeEntry: jest.fn().mockResolvedValue(undefined) } as unknown as CachePurgeService;
  service = new EntriesService(testDb.db, types, webhooks, cache, entitlements);
});

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(async () => {
  await testDb.truncate();
});

/** One type in P1 (unique per project+apiId); returns its row. */
async function seedType() {
  const [type] = await testDb.db
    .insert(schema.contentTypes)
    .values({
      workspaceId: WS,
      projectId: P1,
      name: 'Post',
      apiId: 'post',
      fields: FIELDS,
      createdBy: USER,
    })
    .returning();
  return type;
}

/** An entry under `type` with `versions` revisions. */
async function seedEntryWithRevisions(
  typeId: string,
  versions: number,
  entryId: string,
) {
  await testDb.db.insert(schema.contentEntries).values({
    id: entryId,
    workspaceId: WS,
    projectId: P1,
    contentTypeId: typeId,
    slug: `entry-${entryId}`,
    status: 'published',
    data: { title: 'Hello', body: 'World' },
    authorId: USER,
    createdBy: USER,
  });
  await testDb.db.insert(schema.contentRevisions).values(
    Array.from({ length: versions }, (_, i) => ({
      entryId,
      version: i + 1,
      data: { title: `v${i + 1}` },
      status: 'published',
      createdBy: USER,
    })),
  );
}

const remainingVersions = async (entryId: string) => {
  const rows = await testDb.db
    .select({ version: schema.contentRevisions.version })
    .from(schema.contentRevisions)
    .where(eq(schema.contentRevisions.entryId, entryId))
    .orderBy(asc(schema.contentRevisions.version));
  return rows.map((r) => r.version);
};

describe('EntriesService revision pruning — real DELETE against Postgres', () => {
  it('an update keeps only the newest `cap` revisions of THIS entry', async () => {
    const type = await seedType();
    const ENTRY = 'bbbbbbbb-0000-4000-8000-000000000001';
    const OTHER = 'bbbbbbbb-0000-4000-8000-000000000002';
    await seedEntryWithRevisions(type.id, 4, ENTRY);
    await seedEntryWithRevisions(type.id, 3, OTHER);

    await service.update({
      workspaceId: WS,
      projectId: P1,
      userId: USER,
      id: ENTRY,
      dto: { data: { title: 'v5 title' } } as never,
    });

    // v5 written by the update, then pruned to the newest 2 → {4, 5}.
    expect(await remainingVersions(ENTRY)).toEqual([4, 5]);
    // The prune is entry-scoped: the other entry's history is untouched.
    expect(await remainingVersions(OTHER)).toEqual([1, 2, 3]);
  });

  it('the entry row survives pruning with the updated data', async () => {
    const type = await seedType();
    const ENTRY = 'bbbbbbbb-0000-4000-8000-000000000003';
    await seedEntryWithRevisions(type.id, 5, ENTRY);

    const view = await service.update({
      workspaceId: WS,
      projectId: P1,
      userId: USER,
      id: ENTRY,
      dto: { data: { title: 'kept' } } as never,
    });

    expect(view.data).toMatchObject({ title: 'kept' });
    expect(await remainingVersions(ENTRY)).toEqual([5, 6]);
  });
});
