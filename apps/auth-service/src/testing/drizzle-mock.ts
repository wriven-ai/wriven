import { is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import type { DrizzleDB } from '@wriven/database';
import * as schema from '../db/schema';

/**
 * Unit-test stand-in for the injected Drizzle client. Drizzle builder args
 * (`eq/and/isNull/sql` fragments) are opaque to this mock — specs assert on
 * which table was touched, call counts/order, and resolved values only.
 */

/** Fluent awaitable chain: unknown methods return the chain; `returning()` resolves rows. */
export function chain(rows: unknown[] = []) {
  // Drizzle builders are dynamically dispatched — an any-typed target keeps
  // the Proxy honest without modelling the whole builder surface.
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const target: any = {
    returning: jest.fn().mockResolvedValue(rows),
  };
  const proxy = new Proxy(target, {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    get(t: any, prop: string | symbol) {
      if (prop === 'then') {
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        return (resolve: any, reject: any) =>
          Promise.resolve(rows).then(resolve, reject);
      }
      if (!(prop in t)) {
        t[prop] = jest.fn().mockReturnValue(proxy);
      }
      return t[prop];
    },
  });
  return proxy as unknown as { returning: jest.Mock } & Record<string, jest.Mock>;
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
    insert: jest.fn(() => chain()),
    update: jest.fn(() => chain()),
    delete: jest.fn(() => chain()),
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
