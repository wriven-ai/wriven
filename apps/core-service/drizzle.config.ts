import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Run from the workspace root, e.g. `pnpm db:core:generate`.
config({ path: 'apps/core-service/.env' });

export default defineConfig({
  schema: './apps/core-service/src/db/schema/index.ts',
  out: './apps/core-service/src/db/migrations',
  dialect: 'postgresql',
  schemaFilter: ['core_svc'],
  dbCredentials: {
    // Migrations use the session-mode pooler (DIRECT_URL); runtime uses DATABASE_URL.
    url: (process.env.DIRECT_URL ?? process.env.DATABASE_URL) as string,
  },
});
