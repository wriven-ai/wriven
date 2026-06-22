import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Run from the workspace root, e.g. `pnpm db:auth:generate`.
config({ path: 'apps/auth-service/.env' });

export default defineConfig({
  schema: './apps/auth-service/src/db/schema/index.ts',
  out: './apps/auth-service/src/db/migrations',
  dialect: 'postgresql',
  schemaFilter: ['auth_svc'],
  dbCredentials: {
    // Migrations use the session-mode pooler (DIRECT_URL); runtime uses DATABASE_URL.
    url: (process.env.DIRECT_URL ?? process.env.DATABASE_URL) as string,
  },
});
