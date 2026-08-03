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
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const client = postgres(url, { prepare: false });
  const db = drizzle(client, { schema });

  // 1. Plans — free / starter / pro. Definitions are config (source of truth
  //    is this seed), so we upsert on `key`. Prices in cents. Limits sized to
  //    free-tier infra (R2 + Supabase) + indie pricing ($0/$10/$18, 10% annual).
  //    See specs/15. The legacy `business` tier is removed; its row is deleted
  //    here (FK-restrict will error loudly if any subscription still references
  //    it — pre-launch none do). The legacy `pro` key is repurposed in place to
  //    the new top tier; `starter` is new. Stripe price ids are NOT touched by
  //    the upsert (re-link the new tiers in the Stripe sandbox setup task).
  await db.delete(schema.plans).where(eq(schema.plans.key, 'business'));

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
        members: 4,
        environments: 0,
        contentTypes: 5,
        entries: 500,
        locales: 1,
        storageMb: 100,
        assetBandwidthGb: 10,
        apiRequestsPerMonth: 100_000,
        apiKeys: 2,
        webhooks: 2,
        revisionsPerEntry: 5,
        aiTextRequestsPerMonth: 50,
        aiImageRequestsPerMonth: 5,
      },
      features: {
        scheduledPublishing: false,
        revisionHistory: false,
        customRoles: false,
        auditLog: false,
        previewApi: true,
        supportTier: 'community',
      },
    },
    {
      key: 'starter',
      name: 'Starter',
      description: 'For small teams shipping production content.',
      sortOrder: 1,
      priceMonthly: 1000,
      priceYearly: 10_800,
      trialDays: 0,
      limits: {
        projects: 5,
        members: 10,
        environments: 0,
        contentTypes: 20,
        entries: 2_000,
        locales: 1,
        storageMb: 1_000,
        assetBandwidthGb: null,
        apiRequestsPerMonth: 500_000,
        apiKeys: 10,
        webhooks: 10,
        revisionsPerEntry: 10,
        aiTextRequestsPerMonth: 500,
        aiImageRequestsPerMonth: 50,
      },
      features: {
        scheduledPublishing: false,
        revisionHistory: true,
        customRoles: false,
        auditLog: false,
        previewApi: true,
        supportTier: 'email',
      },
    },
    {
      key: 'pro',
      name: 'Pro',
      description: 'For bigger teams: higher limits, more AI, priority support.',
      sortOrder: 2,
      priceMonthly: 1800,
      priceYearly: 16_200,
      trialDays: 0,
      limits: {
        projects: 15,
        members: 25,
        environments: 0,
        contentTypes: 50,
        entries: 10_000,
        locales: 1,
        storageMb: 5_000,
        assetBandwidthGb: null,
        apiRequestsPerMonth: 2_000_000,
        apiKeys: 25,
        webhooks: 20,
        revisionsPerEntry: 15,
        aiTextRequestsPerMonth: 2_000,
        aiImageRequestsPerMonth: 200,
      },
      features: {
        scheduledPublishing: false,
        revisionHistory: true,
        customRoles: false,
        auditLog: false,
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
