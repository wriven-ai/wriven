/**
 * Idempotent seed for the admin panel foundation:
 *  - the `free` plan (default for every workspace)
 *  - a bootstrap `admin` from env (ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD)
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

  // 1. Plans — free / pro / business. Definitions are config (source of truth
  //    is this seed), so we upsert on `key`. Prices in cents — placeholders.
  const planDefs = [
    {
      key: 'free',
      name: 'Free',
      description: 'For trying Wriven and small personal projects.',
      sortOrder: 0,
      priceMonthly: 0,
      priceYearly: 0,
      trialDays: 0,
      limits: {
        projects: 2,
        members: 3,
        environments: 1,
        contentTypes: 10,
        entries: 1000,
        locales: 1,
        storageMb: 100,
        assetBandwidthGb: 10,
        apiRequestsPerMonth: 100_000,
        apiKeys: 3,
        webhooks: 2,
      },
      features: {
        scheduledPublishing: false,
        revisionHistory: false,
        customRoles: false,
        sso: false,
        auditLog: false,
        previewApi: false,
        supportTier: 'community',
      },
    },
    {
      key: 'pro',
      name: 'Pro',
      description: 'For growing teams shipping production content.',
      sortOrder: 1,
      priceMonthly: 2900,
      priceYearly: 29_000,
      trialDays: 0,
      limits: {
        projects: 10,
        members: 10,
        environments: 3,
        contentTypes: 50,
        entries: 50_000,
        locales: 5,
        storageMb: 5_000,
        assetBandwidthGb: 200,
        apiRequestsPerMonth: 1_000_000,
        apiKeys: 20,
        webhooks: 20,
      },
      features: {
        scheduledPublishing: true,
        revisionHistory: true,
        customRoles: false,
        sso: false,
        auditLog: false,
        previewApi: true,
        supportTier: 'email',
      },
    },
    {
      key: 'business',
      name: 'Business',
      description: 'For scale: high limits, SSO, audit log, priority support.',
      sortOrder: 2,
      priceMonthly: 9900,
      priceYearly: 99_000,
      trialDays: 0,
      limits: {
        projects: null, // unlimited
        members: 50,
        environments: 10,
        contentTypes: null,
        entries: null,
        locales: 20,
        storageMb: 50_000,
        assetBandwidthGb: 1_000,
        apiRequestsPerMonth: 5_000_000,
        apiKeys: null,
        webhooks: null,
      },
      features: {
        scheduledPublishing: true,
        revisionHistory: true,
        customRoles: true,
        sso: true,
        auditLog: true,
        previewApi: true,
        supportTier: 'priority',
      },
    },
  ] as const;

  for (const p of planDefs) {
    await db
      .insert(schema.plans)
      .values(p)
      .onConflictDoUpdate({
        target: schema.plans.key,
        set: {
          name: p.name,
          description: p.description,
          sortOrder: p.sortOrder,
          priceMonthly: p.priceMonthly,
          priceYearly: p.priceYearly,
          trialDays: p.trialDays,
          limits: p.limits,
          features: p.features,
        },
      });
  }
  console.log(`✓ plans ensured: ${planDefs.map((p) => p.key).join(', ')}`);

  // 2. Bootstrap admin (optional — only if env provided).
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
