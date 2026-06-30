# Admin Panel — Schema (auth_svc)

Full DDL for the admin tables. Add to
[apps/auth-service/src/db/schema/index.ts](../../../apps/auth-service/src/db/schema/index.ts).
Then generate + run a migration (see [03 — Database](../../03-database.md)).

---

## 1. Tables

```ts
// ── Admin identity (platform staff — SEPARATE from tenant `users`) ──────────

export const adminUsers = authSchema.table('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('member'),   // admin | moderator | member
  totpSecret: text('totp_secret'),                  // nullable; TOTP MFA
  active: boolean('active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  check('admin_users_role_check', sql`${t.role} in ('admin','moderator','member')`),
]);

export const adminRefreshTokens = authSchema.table('admin_refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull(),
  adminUserId: uuid('admin_user_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revoked: boolean('revoked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('admin_refresh_tokens_token_hash_uq').on(t.tokenHash),
  index('admin_refresh_tokens_admin_user_id_idx').on(t.adminUserId),
]);

export const adminAuditLog = authSchema.table('admin_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminUserId: uuid('admin_user_id').notNull().references(() => adminUsers.id, { onDelete: 'restrict' }),
  action: text('action').notNull(),       // 'user.suspend', 'workspace.plan.change', 'apikey.revoke', ...
  targetType: text('target_type'),         // 'user'|'workspace'|'project'|'entry'|'api_key'|'webhook'|'admin_user'|'plan'
  targetId: text('target_id'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  ip: text('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('admin_audit_log_admin_user_id_idx').on(t.adminUserId),
  index('admin_audit_log_target_idx').on(t.targetType, t.targetId),
  index('admin_audit_log_created_at_idx').on(t.createdAt),
]);

// ── Plans & per-workspace assignment ────────────────────────────────────────

// Three self-serve tiers: free / pro / business. Display + billing live in
// columns (Stripe-ready); quotas + entitlements live in jsonb so new dimensions
// need no migration. See PlanLimits / PlanFeatures / PlanView in @wriven/contracts.
export const plans = authSchema.table('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),     // 'free'|'pro'|'business'
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  isPublic: boolean('is_public').notNull().default(true),  // show on pricing page
  active: boolean('active').notNull().default(true),
  // Billing (Stripe-ready; nullable until billing lands). Prices in cents.
  priceMonthly: integer('price_monthly'),
  priceYearly: integer('price_yearly'),
  currency: text('currency').notNull().default('usd'),
  stripeProductId: text('stripe_product_id'),
  stripePriceIdMonthly: text('stripe_price_id_monthly'),
  stripePriceIdYearly: text('stripe_price_id_yearly'),
  trialDays: integer('trial_days').notNull().default(0),
  // Quotas (null/absent = unlimited): projects, members, environments,
  // contentTypes, entries, locales, storageMb, assetBandwidthGb,
  // apiRequestsPerMonth, apiKeys, webhooks.
  limits: jsonb('limits').notNull().default(sql`'{}'::jsonb`),
  // Entitlements: scheduledPublishing, revisionHistory, customRoles, sso,
  // auditLog, previewApi, supportTier ('community'|'email'|'priority').
  features: jsonb('features').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// One subscription per workspace (the billing unit). Created as `free` when a
// workspace is created (registration + workspace create). Stripe fields nullable
// until billing lands; `overrides` lets an admin bump one customer's limits.
export const subscriptions = authSchema.table('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),  // unique
  planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'restrict' }),
  status: text('status').notNull().default('active'),  // active|trialing|past_due|canceled|paused|incomplete
  billingCycle: text('billing_cycle'),                  // 'monthly'|'yearly'|null
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  overrides: jsonb('overrides'),                        // per-workspace limit overrides
  updatedBy: uuid('updated_by'),                        // admin_user id (no FK across concern)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
```

> **Subscription lifecycle:** a free subscription is created in the same
> transaction as every workspace (`AuthService.register`, `googleLogin`,
> `WorkspacesService.create`). Workspaces without a row still resolve to `free`
> defensively. Suspending a **user** sets `users.suspendedAt` (login blocked).

---

## 2. Seed

`apps/auth-service/src/db/seed.ts`, run `pnpm db:auth:seed`:

- Three plans, upserted on `key` (definitions are config, source of truth = seed):
  - **free** — projects 2, members 3, 100 MB, 10 content types, 1k entries,
    community support. $0.
  - **pro** — projects 10, members 10, 5 GB, 50 content types, 50k entries,
    scheduled publishing + revisions + preview, email support. ~$29/mo.
  - **business** — unlimited projects/types/keys, members 50, 50 GB, SSO +
    custom roles + audit log, priority support. ~$99/mo.
- One bootstrap `admin` from env (`ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`) —
  hashed at seed time; never commit a plaintext password.
- Workspaces with no subscription row resolve to `free` in code.
- Prices/limits are placeholders — tune in the seed or later via the admin Plans UI.

See plan/subscription resolution + enforcement in [09-plans.md](./09-plans.md).
