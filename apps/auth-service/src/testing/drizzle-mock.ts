import { is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import type { DrizzleDB } from '@wriven/database';
import * as schema from '../db/schema';

/**
 * Unit-test stand-in for the injected Drizzle client. Drizzle builder args
 * (`eq/and/isNull/sql` fragments) are opaque to this mock — specs assert on
 * which table was touched, call counts/order, and resolved values only.
 */

/**
 * Fluent awaitable chain: unknown methods return the chain; `returning()` resolves rows.
 *
 * `kind` matters: a real drizzle WRITE (insert/update/delete) awaited without
 * `.returning()` resolves an EMPTY driver result — so a write chain resolves
 * `[]` unless `.returning()` ran on it, and a dropped `.returning()` fails
 * specs loudly instead of silently returning stub rows. Reads (select) always
 * resolve rows.
 *
 * `insert`/`update` kinds additionally require `.values()`/`.set()` before the
 * chain may be awaited — real drizzle throws on a values-less write, so the
 * default surface mocks use these kinds to catch a dropped `.values`/`.set`
 * in service code. `write` (delete-style) is lenient: deletes are awaited
 * with only a `.where()`.
 */
export function chain(
  rows: unknown[] = [],
  kind: 'read' | 'write' | 'insert' | 'update' = 'read',
) {
  // Drizzle builders are dynamically dispatched — an any-typed target keeps
  // the Proxy honest without modelling the whole builder surface.
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const target: any = {
    returning: jest.fn(() => {
      target.__returned = true;
      return Promise.resolve(rows);
    }),
    __returned: false,
    __shaped: false,
  };
  const proxy = new Proxy(target, {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    get(t: any, prop: string | symbol) {
      if (prop === 'then') {
        if (
          (kind === 'insert' || kind === 'update') &&
          !t.__returned &&
          !t.__shaped
        ) {
          const op = kind === 'insert' ? '.values()' : '.set()';
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          return (_resolve: any, reject: any) =>
            reject(
              new Error(
                `mock ${kind} chain awaited without ${op} — real drizzle throws on a values-less write`,
              ),
            );
        }
        const resolved = kind !== 'read' && !t.__returned ? [] : rows;
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        return (resolve: any, reject: any) =>
          Promise.resolve(resolved).then(resolve, reject);
      }
      if (prop === 'values' || prop === 'set') t.__shaped = true;
      if (!(prop in t)) {
        t[prop] = jest.fn().mockReturnValue(proxy);
      }
      return t[prop];
    },
  });
  return proxy as unknown as { returning: jest.Mock } & Record<string, jest.Mock>;
}

/** Write-chain variant for insert/update/delete mocks (see `chain`). */
export function writeChain(rows: unknown[] = []) {
  return chain(rows, 'write');
}

export interface QueryMock {
  findFirst: jest.Mock;
  findMany: jest.Mock;
}

export interface DbSurfaceMock {
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  select: jest.Mock;
  execute: jest.Mock;
  query: Record<string, QueryMock>;
  $count: jest.Mock;
}

export interface DbMock extends DbSurfaceMock {
  /** Invokes the callback with `__tx` and propagates rejections (rollback). */
  transaction: jest.Mock;
  __tx: DbSurfaceMock;
}

function queryMap(): Record<string, QueryMock> {
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([, value]) => is(value, PgTable))
      .map(([key]) => [
        key,
        {
          findFirst: jest.fn().mockResolvedValue(undefined),
          findMany: jest.fn().mockResolvedValue([]),
        },
      ]),
  );
}

function surface(query: Record<string, QueryMock>): DbSurfaceMock {
  return {
    // Default write mocks use the strict kinds so a service bug dropping
    // .values()/.set() rejects loudly instead of silently writing [].
    insert: jest.fn(() => chain([], 'insert')),
    update: jest.fn(() => chain([], 'update')),
    delete: jest.fn(() => writeChain()),
    select: jest.fn(() => chain()),
    execute: jest.fn().mockResolvedValue(undefined),
    $count: jest.fn().mockResolvedValue(0),
    query,
  };
}

/** Fresh db mock. Reads outside a tx: `db.query.users.findFirst`; inside: `db.__tx.query...`. */
export function createDbMock(): DbMock {
  const tx = surface(queryMap());
  const db = surface(queryMap());
  return {
    ...db,
    transaction: jest.fn(
      async (cb: (t: DbSurfaceMock) => Promise<unknown>) => cb(tx),
    ),
    __tx: tx,
  };
}

/** Cast a mock into the service constructor's `DrizzleDB<typeof schema>` type. */
export function asDb(mock: DbMock): DrizzleDB<typeof schema> {
  return mock as unknown as DrizzleDB<typeof schema>;
}

/**
 * The chain returned by the `call`-th invocation of a write mock — for
 * asserting what was passed to `.values(...)` / `.set(...)` on that call.
 */
export function chainOf(
  mock: jest.Mock,
  call = 0,
): { values: jest.Mock; set: jest.Mock; returning: jest.Mock } & Record<
  string,
  jest.Mock
> {
  return mock.mock.results[call].value;
}

/**
 * Serialize a drizzle SQL fragment (where-clause, query args) with circular
 * table refs cut, so bound params become assertable strings.
 */
export function serializeFragment(fragment: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(fragment, (_key, value: unknown) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[circular]';
      seen.add(value);
    }
    return value;
  });
}

/**
 * Assert that the `call`-th invocation of a write mock (insert/update/delete)
 * carries a `.where(...)` whose serialized fragment contains every needle —
 * the tenant-scoping pin for destructive writes. Fails LOUDLY when the chain
 * never called `.where` at all (a scope-less delete/update is a full-table
 * write). Needles are stringified; column names (e.g. 'deletedAt') work as
 * presence pins for `isNull` fragments.
 */
export function expectScopedWhere(
  mock: jest.Mock,
  call: number,
  ...needles: (string | number)[]
): void {
  const { where } = chainOf(mock, call);
  if (!where || where.mock.calls.length === 0) {
    throw new Error(
      `expected a .where(...) on write call ${call} — an unscoped write is a full-table operation`,
    );
  }
  const fragment = serializeFragment(where.mock.calls[0][0]);
  for (const needle of needles) {
    // Message spelled out (not `toContain`) so failures show the fragment.
    if (!fragment.includes(String(needle))) {
      throw new Error(
        `write call ${call} WHERE fragment missing ${JSON.stringify(needle)}.\nFragment: ${fragment}`,
      );
    }
  }
}
