import { RpcException } from '@nestjs/microservices';
import { ContentTypesService } from './content-types.service';
import type { CoreEntitlementsService } from '../entitlements/core-entitlements.service';
import { writeChain, asDb, createDbMock } from '../testing/drizzle-mock';
import type { FieldDef } from '@wriven/contracts';

function makeService() {
  const db = createDbMock();
  const entitlements = { assertContentTypeQuota: jest.fn().mockResolvedValue(undefined) };
  const service = new ContentTypesService(asDb(db), entitlements as unknown as CoreEntitlementsService);
  return { service, db, entitlements };
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

const base = { workspaceId: 'ws-1', projectId: 'p1', userId: 'u1' };

function create(fields: FieldDef[], apiId = 'post') {
  const { service } = makeService();
  return service.create({ ...base, dto: { name: 'Post', apiId, fields: fields as never } });
}

/** A clean baseline: one text field with a sibling context field. */
const text = (key: string, extra: Partial<FieldDef> = {}): FieldDef =>
  ({ key, label: key, type: 'text', ...extra }) as FieldDef;

describe('ContentTypesService.create — unique field keys', () => {
  it('duplicate keys → VALIDATION_ERROR before quota or insert', async () => {
    const { service, db, entitlements } = makeService();
    const err = await rejection(
      service.create({
        ...base,
        dto: { name: 'Post', apiId: 'post', fields: [text('title'), text('title')] as never },
      }),
    );
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('Duplicate field key');
    expect(entitlements.assertContentTypeQuota).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('ContentTypesService.create — select options policy', () => {
  it('empty options → rejected', async () => {
    const err = await rejection(
      create([{ key: 'color', label: 'Color', type: 'select', options: [] } as FieldDef]),
    );
    expect(err.message).toContain('unique, non-empty options');
  });

  it('duplicate options → rejected', async () => {
    const err = await rejection(
      create([{ key: 'color', label: 'Color', type: 'select', options: ['red', 'red'] } as FieldDef]),
    );
    expect(err.message).toContain('unique, non-empty options');
  });

  it('whitespace-only padding is rejected (trimmed value must match raw)', async () => {
    const err = await rejection(
      create([{ key: 'color', label: 'Color', type: 'select', options: [' red'] } as FieldDef]),
    );
    expect(err.message).toContain('unique, non-empty options');
  });

  it('options on a non-select field → rejected', async () => {
    const err = await rejection(create([text('title', { options: ['x'] } as Partial<FieldDef>)]));
    expect(err.message).toContain('Only select fields can define options');
  });
});

describe('ContentTypesService.create — AI sensitivity governance', () => {
  it('a sensitive field cannot also be an AI context owner', async () => {
    const err = await rejection(
      create([
        text('body'),
        text('secret', { aiPrivate: true, aiContextFields: ['body'] }),
      ]),
    );
    expect(err.message).toContain('Sensitive field "secret" cannot use AI context');
  });

  it('a sensitive field cannot be USED as context by another field', async () => {
    const err = await rejection(
      create([
        text('secret', { aiPrivate: true }),
        text('body', { aiContextFields: ['secret'] }),
      ]),
    );
    expect(err.message).toContain('unknown or sensitive field "secret"');
  });

  it('unknown context sibling → rejected', async () => {
    const err = await rejection(create([text('body', { aiContextFields: ['ghost'] })]));
    expect(err.message).toContain('unknown or sensitive field "ghost"');
  });

  it('self-referencing context → rejected', async () => {
    const err = await rejection(create([text('body', { aiContextFields: ['body'] })]));
    expect(err.message).toContain('unique sibling fields');
  });

  it('multi-value context target → rejected (its values would silently vanish from prompts)', async () => {
    const err = await rejection(
      create([
        text('tags', { type: 'text', multiple: true }),
        text('body', { aiContextFields: ['tags'] }),
      ]),
    );
    expect(err.message).toContain('multi-value field "tags"');
  });

  it('context on an ineligible owner type (number) → rejected', async () => {
    const err = await rejection(
      create([
        text('body'),
        { key: 'price', label: 'Price', type: 'number', aiContextFields: ['body'] } as FieldDef,
      ]),
    );
    expect(err.message).toContain('Only scalar text, richtext, or select fields');
  });

  it('a clean schema passes validation and reaches the insert', async () => {
    const { service, db } = makeService();
    db.insert.mockImplementationOnce(() =>
      writeChain([
        {
          id: 'ct-1',
          workspaceId: 'ws-1',
          projectId: 'p1',
          apiId: 'post',
          name: 'Post',
          fields: [],
          createdBy: 'u1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          deletedAt: null,
        },
      ]),
    );

    await expect(
      service.create({
        ...base,
        dto: {
          name: 'Post',
          apiId: 'post',
          fields: [text('title'), text('body', { aiContextFields: ['title'] })] as never,
        },
      }),
    ).resolves.toBeTruthy();
    expect(db.insert).toHaveBeenCalled();
  });
});
