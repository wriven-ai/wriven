import { DynamicModule, Global, Module } from '@nestjs/common';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DRIZZLE } from './drizzle.constants';

/**
 * Typed Drizzle database handle. Each service parameterises it with its own
 * schema, e.g. `DrizzleDB<typeof schema>`.
 */
export type DrizzleDB<
  TSchema extends Record<string, unknown> = Record<string, never>,
> = PostgresJsDatabase<TSchema>;

export interface DatabaseModuleOptions {
  /** Drizzle schema object for the owning service (its Postgres schema). */
  schema: Record<string, unknown>;
  /** Override the connection string; defaults to `process.env.DATABASE_URL`. */
  connectionString?: string;
}

/**
 * Global module that provides a single Drizzle client over postgres.js.
 * All services share one Postgres database (Supabase) and isolate by schema.
 */
@Global()
@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseModuleOptions): DynamicModule {
    const provider = {
      provide: DRIZZLE,
      useFactory: () => {
        const url = options.connectionString ?? process.env.DATABASE_URL;
        if (!url) {
          throw new Error('DATABASE_URL is not set');
        }
        // prepare:false keeps us compatible with Supabase poolers.
        const client = postgres(url, { prepare: false });
        return drizzle(client, { schema: options.schema });
      },
    };

    return {
      module: DatabaseModule,
      providers: [provider],
      exports: [provider],
    };
  }
}
