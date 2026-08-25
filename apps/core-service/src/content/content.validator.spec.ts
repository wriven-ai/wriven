import type { FieldDef } from '@wriven/contracts';
import { RpcException } from '@nestjs/microservices';
import { validateEntryData } from './content.validator';

function field(overrides: Partial<FieldDef> = {}): FieldDef {
  return {
    key: 'title',
    label: 'Title',
    type: 'text',
    required: false,
    ...overrides,
  } as FieldDef;
}

async function failure(fields: FieldDef[], data: Record<string, unknown>) {
  try {
    await validateEntryData(fields, data);
  } catch (err) {
    if (err instanceof RpcException) {
      return err.getError() as { code: string; message: string };
    }
    throw err;
  }
  throw new Error('expected validation to fail');
}

describe('validateEntryData', () => {
  it('accepts data matching the field definitions', () => {
    expect(() =>
      validateEntryData(
        [field(), field({ key: 'views', type: 'number' })],
        { title: 'Hi', views: 3 },
      ),
    ).not.toThrow();
  });

  it('rejects unknown keys (whitelist)', async () => {
    const err = await failure([field()], { title: 'x', rogue: 1 });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('Unknown field "rogue"');
  });

  it('rejects missing required fields; null counts as missing', async () => {
    const err = await failure([field({ required: true })], {});
    expect(err.message).toContain('required');

    const nullErr = await failure([field({ required: true })], { title: null });
    expect(nullErr.message).toContain('required');
  });

  it('optional fields may be absent', () => {
    expect(() => validateEntryData([field()], {})).not.toThrow();
  });

  it.each([
    ['text', 'text', 42],
    ['number', 'number', 'seven'],
    ['boolean', 'boolean', 'yes'],
    ['date', 'date', 'not-a-date'],
    ['media', 'media', 7],
    ['reference', 'reference', {}],
  ] as const)('%s field rejects a %p value', async (key, type, value) => {
    const err = await failure([field({ key, type })], { [key]: value });
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('richtext accepts a ProseMirror doc AND legacy plain strings', () => {
    const fields = [field({ type: 'richtext' })];
    expect(() =>
      validateEntryData(fields, { title: { type: 'doc', content: [] } }),
    ).not.toThrow();
    expect(() => validateEntryData(fields, { title: 'legacy' })).not.toThrow();
  });

  it('richtext rejects arbitrary objects', async () => {
    const err = await failure([field({ type: 'richtext' })], {
      title: { type: 'table', rows: [] },
    });
    expect(err.message).toContain('rich-text');
  });

  it('select enforces the option list', async () => {
    const err = await failure(
      [field({ type: 'select', options: ['draft', 'final'] })],
      { title: 'archived' },
    );
    expect(err.message).toContain('one of');
  });

  it('multiple requires an array and validates each item', async () => {
    const notArray = await failure(
      [field({ multiple: true })],
      { title: 'oops' },
    );
    expect(notArray.message).toContain('array');

    const badItem = await failure(
      [field({ multiple: true })],
      { title: ['ok', 42] },
    );
    expect(badItem.message).toContain('string');
  });

  it('number rejects NaN', async () => {
    const err = await failure([field({ type: 'number' })], {
      title: Number.NaN,
    });
    expect(err.message).toContain('number');
  });
});
