/**
 * Idempotent seed for the admin panel foundation:
 *  a bootstrap `admin` from env (ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD)
 *
 * Plans are NOT seeded — they are managed from the admin panel (POST /admin/plans;
 * paid plans get their Stripe Product/Prices created there, prices entered in USD
 * dollars — the DTO converts to cents). Until a `free` plan row exists, entitlements
 * fail closed to the baked-in FREE_FALLBACK limits (auth/entitlements.service.ts).
 *
 * Run after migrations:
 *   pnpm db:auth:seed
 * (loads apps/auth-service/.env via tsx --env-file)
 */
import * as bcrypt from 'bcrypt';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const client = postgres(url, { prepare: false });
  const db = drizzle(client, { schema });

  // Bootstrap admin (optional — only if env provided).
  const email = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (email && password) {
    const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
    const passwordHash = await bcrypt.hash(password, rounds);
    const inserted = await db
      .insert(schema.adminUsers)
      .values({
        email,
        name: process.env.ADMIN_SEED_NAME?.trim() || 'Platform Admin',
        passwordHash,
        role: 'admin',
      })
      .onConflictDoNothing({ target: schema.adminUsers.email })
      .returning({ id: schema.adminUsers.id });
    console.log(
      inserted.length
        ? `✓ bootstrap admin created: ${email}`
        : `• admin ${email} already exists — skipped`,
    );
  } else {
    console.log(
      '• ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD not set — skipped admin seed',
    );
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
