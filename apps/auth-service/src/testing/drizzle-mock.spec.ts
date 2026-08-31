import { chain, writeChain, createDbMock, expectScopedWhere } from './drizzle-mock';

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

describe('drizzle-mock strict write kinds', () => {
  it('default insert/update mocks reject when awaited without .values/.set', async () => {
    const db = createDbMock();
    await expect(db.insert()).rejects.toThrow('without .values()');
    await expect(db.update()).rejects.toThrow('without .set()');
    await expect(db.__tx.insert()).rejects.toThrow('without .values()');
  });

  it('shaped default writes resolve the empty driver result as before', async () => {
    const db = createDbMock();
    const insert = db.insert();
    insert.values({ a: 1 });
    await expect(insert).resolves.toEqual([]);
    const update = db.update();
    update.set({ a: 1 });
    await expect(update).resolves.toEqual([]);
  });

  it('delete chains stay lenient (awaited with only .where)', async () => {
    const db = createDbMock();
    const del = db.delete();
    del.where({} as never);
    await expect(del).resolves.toEqual([]);
  });
});

describe('expectScopedWhere', () => {
  it('passes when every needle is a bound param of the where fragment', () => {
    const db = createDbMock();
    const del = db.delete();
    del.where({ ws: 'ws-1', user: 'u-2' } as never);
    del.returning();
    expectScopedWhere(db.delete, 0, 'ws-1', 'u-2');
  });

  it('fails loudly naming the missing needle and dumping the fragment', () => {
    const db = createDbMock();
    const del = db.delete();
    del.where({ user: 'u-2' } as never);
    expect(() => expectScopedWhere(db.delete, 0, 'ws-1')).toThrow(/missing "ws-1"/);
  });

  it('fails when the write never called .where (full-table write)', () => {
    const db = createDbMock();
    const del = db.delete();
    del.values({} as never);
    expect(() => expectScopedWhere(db.delete, 0, 'x')).toThrow(/unscoped write/);
  });
});
