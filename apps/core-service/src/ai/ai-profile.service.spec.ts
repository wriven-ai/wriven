import { AiProfileService } from './ai-profile.service';
import {
  writeChain,
  asDb,
  chainOf,
  createDbMock,
  serializeFragment,
} from '../testing/drizzle-mock';

const T0 = new Date('2026-01-15T10:00:00.000Z');

function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ap-1',
    workspaceId: 'ws-1',
    projectId: 'p1',
    brandVoice: 'warm and precise',
    glossary: [{ term: 'CMS', prefer: 'headless CMS' }],
    language: 'en',
    updatedBy: 'u1',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function makeService() {
  const db = createDbMock();
  const service = new AiProfileService(asDb(db));
  return { service, db };
}

describe('AiProfileService.read', () => {
  it('no row yet → the empty view (absent is never auto-created)', async () => {
    const { service, db } = makeService();
    db.query.aiProfiles.findFirst.mockResolvedValue(undefined);

    expect(await service.read('p1')).toEqual({
      brandVoice: null,
      glossary: [],
      language: null,
      updatedAt: null,
    });
    // Scoped to the project — a cross-project read would leak voice config.
    expect(
      serializeFragment(db.query.aiProfiles.findFirst.mock.calls[0][0].where),
    ).toContain('p1');
  });

  it('existing row → mapped view with ISO updatedAt', async () => {
    const { service, db } = makeService();
    db.query.aiProfiles.findFirst.mockResolvedValue(profileRow());

    expect(await service.read('p1')).toEqual({
      brandVoice: 'warm and precise',
      glossary: [{ term: 'CMS', prefer: 'headless CMS' }],
      language: 'en',
      updatedAt: T0.toISOString(),
    });
  });
});

describe('AiProfileService.upsert', () => {
  it('first edit inserts with the authoritative workspaceId and nulls coalesced', async () => {
    const { service, db } = makeService();
    db.insert.mockImplementationOnce(() => writeChain([profileRow({ brandVoice: null, glossary: [], language: null })]));

    await service.upsert({
      workspaceId: 'ws-9',
      projectId: 'p1',
      userId: 'u1',
      dto: { brandVoice: undefined, glossary: undefined, language: undefined } as never,
    });

    expect(chainOf(db.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-9', // gateway-injected, never a client header value
        projectId: 'p1',
        brandVoice: null,
        glossary: [], // NOT NULL jsonb — null past the DTO must not reach SQL
        language: null,
        updatedBy: 'u1',
      }),
    );
  });

  it('null glossary past the DTO is written as [] (23502 regression guard)', async () => {
    const { service, db } = makeService();
    db.insert.mockImplementationOnce(() => writeChain([profileRow({ glossary: [] })]));

    await service.upsert({
      workspaceId: 'ws-1',
      projectId: 'p1',
      userId: 'u1',
      dto: { glossary: null } as never,
    });

    expect(chainOf(db.insert).values).toHaveBeenCalledWith(
      expect.objectContaining({ glossary: [] }),
    );
  });

  it('update path writes only the provided fields (partial patch)', async () => {
    const { service, db } = makeService();
    db.insert.mockImplementationOnce(() => writeChain([profileRow({ language: 'de' })]));

    await service.upsert({
      workspaceId: 'ws-1',
      projectId: 'p1',
      userId: 'u2',
      dto: { language: 'de' } as never,
    });

    const upsert = chainOf(db.insert).onConflictDoUpdate.mock.calls[0][0] as {
      target: unknown;
      set: Record<string, unknown>;
    };
    // Conflict target: one row per project (the projectId unique index).
    const target = upsert.target as unknown as {
      name: string;
      uniqueName: string;
    };
    expect(target.name).toBe('project_id');
    expect(target.uniqueName).toBe('ai_profiles_project_id_unique');
    // Partial: only language (+audit cols) — brandVoice/glossary untouched.
    expect(Object.keys(upsert.set)).not.toContain('brandVoice');
    expect(Object.keys(upsert.set)).not.toContain('glossary');
    expect(upsert.set.language).toBe('de');
    expect(upsert.set.updatedBy).toBe('u2');
    expect(upsert.set.updatedAt).toEqual(expect.any(Date));
  });
});
