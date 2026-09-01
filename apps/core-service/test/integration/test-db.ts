import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import type { DrizzleDB } from '@wriven/database';
import * as schema from '../../src/db/schema';

/**
 * Ephemeral Postgres for core-service integration specs: one container per
 * spec file, real migrations from `src/db/migrations` (journal
 * `__drizzle_migrations_core`, same as drizzle.config.ts), `truncate()`
 * between tests. Never touches dev/prod DBs.
 */
export interface TestDb {
  container: StartedPostgreSqlContainer;
  db: DrizzleDB<typeof schema>;
  /** Wipe every core_svc table (order-free: TRUNCATE … CASCADE). */
  truncate: () => Promise<void>;
  stop: () => Promise<void>;
}

export async function startTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  // A failed connect/migrate after .start() must never strand the container —
  // jest's afterAll only runs when beforeAll succeeds.
  try {
    const url = container.getConnectionUri();
    const client = postgres(url, { prepare: false, max: 10 });
    const db = drizzle(client, { schema });

    // Migration 0003 backfills project_id from auth_svc.projects. In
    // production the auth schema exists (shared DB, auth migrates first);
    // in this core-only container it doesn't — pre-create the minimal table
    // the SELECT touches. Empty table → backfill no-ops, every NOT NULL
    // still succeeds on the (fresh, empty) core tables.
    await db.execute(sql`
      create schema if not exists auth_svc;
      create table if not exists auth_svc.projects (
        id uuid primary key,
        workspace_id uuid not null,
        slug text not null
      );
    `);

    await migrate(db, {
      migrationsFolder: `${__dirname}/../../src/db/migrations`,
      migrationsSchema: 'drizzle',
      migrationsTable: '__drizzle_migrations_core',
    });

    // Exclude the drizzle journal (schema 'drizzle') so migrations survive.
    const truncate = async () => {
      const tables = await db.execute<{ table_name: string }>(
        sql`select table_name from information_schema.tables where table_schema = 'core_svc'`,
      );
      const names = tables.map((r) => `"core_svc"."${r.table_name}"`);
      if (names.length > 0) {
        await db.execute(sql.raw(`TRUNCATE TABLE ${names.join(', ')} CASCADE`));
      }
    };

    return {
      container,
      db,
      truncate,
      stop: async () => {
        await client.end();
        await container.stop();
      },
    };
  } catch (err) {
    await container.stop();
    throw err;
  }
}
