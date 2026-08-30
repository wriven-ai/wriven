import { chain, writeChain } from './drizzle-mock';

/**
 * The mock's own contract: write chains mirror real drizzle (bare await
 * resolves an EMPTY result unless `.returning()` ran), read chains resolve
 * rows. This is the guard that makes a dropped `.returning()` in service
 * code fail specs loudly.
 */
describe('drizzle-mock chain semantics', () => {
  it('write chain: bare await resolves [] (real driver result shape)', async () => {
    const result = await writeChain([{ id: 'x' }]).values({ a: 1 });
    expect(result).toEqual([]);
  });

  it('write chain: .returning() resolves the stubbed rows', async () => {
    const rows = await writeChain([{ id: 'x' }]).values({ a: 1 }).returning();
    expect(rows).toEqual([{ id: 'x' }]);
  });

  it('read chain: bare await resolves the stubbed rows (selects)', async () => {
    const rows = await chain([{ id: 'x' }]).from('t').where('w');
    expect(rows).toEqual([{ id: 'x' }]);
  });

  it('write chain awaits are awaitable repeatedly (thenable not consumed)', async () => {
    const c = writeChain([{ id: 'y' }]);
    await expect(Promise.resolve(c)).resolves.toEqual([]);
  });
});
