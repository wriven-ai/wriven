import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import type { DrizzleDB } from '@wriven/database';
import * as schema from '../../src/db/schema';

/**
 * Ephemeral Postgres for integration specs: one container per spec file
 * (Jest isolates module registries per file), real migrations applied from
 * `src/db/migrations`, `truncate()` between tests. Never touches dev/prod DBs —
 * random port, gone when the file ends.
 */
export interface TestDb {
  container: StartedPostgreSqlContainer;
  /** Connection string for `DatabaseModule.forRoot({ connectionString })`. */
  url: string;
  db: DrizzleDB<typeof schema>;
  /** Wipe every auth_svc table (order-free: TRUNCATE … CASCADE). */
  truncate: () => Promise<void>;
  stop: () => Promise<void>;
}

export async function startTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  const client = postgres(url, { prepare: false, max: 10 });
  const db = drizzle(client, { schema });

  // Same journal location as drizzle.config.ts, so these ARE the prod migrations.
  await migrate(db, {
    migrationsFolder: `${__dirname}/../../src/db/migrations`,
    migrationsSchema: 'drizzle',
    migrationsTable: '__drizzle_migrations_auth',
  });

  const truncate = async () => {
    const tables = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'auth_svc'`,
    );
    const names = tables.map((r) => `"auth_svc"."${r.table_name}"`);
    if (names.length > 0) {
      await db.execute(sql.raw(`TRUNCATE TABLE ${names.join(', ')} CASCADE`));
    }
  };

  return {
    container,
    url,
    db,
    truncate,
    stop: async () => {
      await client.end();
      await container.stop();
    },
  };
}
