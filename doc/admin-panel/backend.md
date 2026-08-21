# Admin Panel — Backend Implementation Spec

Implementation guide for the **`/admin/*` API surface** built in this monorepo.
This is the doc the backend agent (working in this repo) follows to add admin
support to the gateway + auth/core services. Pairs with
[README.md](./README.md) (context) and [frontend.md](./frontend.md) (the SPA that
consumes this).

Conventions to follow throughout: Drizzle in `auth_svc`/`core_svc` schemas,
NestJS modules + TCP microservices, the `{ success, data }` / `{ success, error }`
envelope, and the patterns already in
[API Reference](../api-reference.md), [Conventions](../conventions.md),
[Architecture](../architecture.md). **Mirror existing code** (guards,
controllers, message patterns) rather than inventing new shapes.

---

## 1. Where things go

```
apps/auth-service/src/
  db/schema/index.ts            # + adminUsers, adminRefreshTokens, adminAuditLog, plans, subscriptions
  admin/                        # admin identity + cross-tenant tenant queries
    admin-auth.service.ts       #   login, refresh, logout, getById
    admin-users.service.ts      #   CRUD admin_users (admin role only)
    admin-audit.service.ts      #   write + query audit log
    admin-tenancy.service.ts    #   cross-tenant user/workspace/project queries (no scope)
    admin-plans.service.ts      #   plans + subscriptions
    admin-token.service.ts      #   admin JWT sign/verify (ADMIN_JWT_SECRET)
    admin-metrics.service.ts    #   auth_svc counts for /admin/metrics
    admin.controller.ts         #   @MessagePattern('admin.*') handlers
    admin.module.ts

apps/core-service/src/
  admin/                        # cross-tenant content/media/keys/webhooks queries
    admin-content.service.ts
    admin-content-types.service.ts
    admin-media.service.ts
    admin-keys.service.ts
    admin-webhooks.service.ts
    admin-project-usage.service.ts   # GET /admin/projects/:id/usage rollup
    admin-metrics.service.ts         # core_svc counts for /admin/metrics
    admin.controller.ts         #   @MessagePattern('admin.*') handlers
    admin.module.ts

apps/api-gateway/src/admin/     # public HTTP surface for the SPA
  admin-jwt.guard.ts            #   verifies admin_access_token (ADMIN_JWT_SECRET)
  admin-roles.guard.ts          #   RBAC: admin|moderator|member
  admin-roles.decorator.ts      #   @AdminRoles('admin', 'moderator')
  current-admin.decorator.ts    #   @CurrentAdmin() -> { adminUserId, email, role }
  audit.interceptor.ts          #   @Audit('user.suspend') -> writes admin_audit_log
  audit.decorator.ts
  # one controller per resource (no admin.module.ts — registered in src/app/app.module.ts)
  admin-auth.controller.ts      #   /admin/auth/*
  admin-metrics.controller.ts   #   /admin/metrics/*
  admin-admins.controller.ts    #   /admin/admins/*  (admin only)
  admin-users.controller.ts     #   /admin/users/*
  admin-workspaces.controller.ts    #   /admin/workspaces/*
  admin-projects.controller.ts      #   /admin/projects/*
  admin-content.controller.ts       #   /admin/content/*
  admin-content-types.controller.ts #   /admin/content-types
  admin-media.controller.ts         #   /admin/media/*
  admin-apikeys.controller.ts       #   /admin/api-keys/*
  admin-webhooks.controller.ts      #   /admin/webhooks/*
  admin-support.controller.ts       #   /admin/support/tickets/*
  admin-support-metrics.controller.ts  #   /admin/support/metrics
  admin-plans.controller.ts     #   /admin/plans
  admin-audit.controller.ts     #   /admin/audit-log
```

---

## 2. Schema (auth_svc) — full DDL

Add to [apps/auth-service/src/db/schema/index.ts](../../apps/auth-service/src/db/schema/index.ts).
Then generate + run a migration (see [Database](../database.md)).

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

// Self-serve tiers: free / starter / pro. Display + billing live in
// columns (Stripe-ready); quotas + entitlements live in jsonb so new dimensions
// need no migration. See PlanLimits / PlanFeatures / PlanView in @wriven/contracts.
export const plans = authSchema.table('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),     // 'free'|'starter'|'pro'
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  isPublic: boolean('is_public').notNull().default(true),  // show on pricing page
  active: boolean('active').notNull().default(true),
  // Billing (Stripe-ready; nullable until billing lands). Prices in cents.
  priceMonthly: integer('price_monthly'),
  priceYearly: integer('price_yearly'),    // final yearly amount Stripe charges
  yearlyDiscountPercent: integer('yearly_discount_percent'),  // 0–100, null = none
  yearlyDiscountAmount: integer('yearly_discount_amount'),    // cents saved vs monthly×12
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
  stripeEventCreatedAt: timestamp('stripe_event_created_at', { withTimezone: true }),  // stale-event guard (event.created)
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  pendingChange: jsonb('pending_change'),               // deferred downgrade (specs/16)
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

**Seed** (`apps/auth-service/src/db/seed.ts`, run `pnpm db:auth:seed`):
- Plans are **not seeded** — create/manage them from the admin Plans UI
  (`POST /admin/plans`, prices in USD dollars; paid plans get their Stripe
  Product/Prices created server-side). See [`doc/plan-config.md`](../plan-config.md)
  for the intended tier configuration.
- One bootstrap `admin` from env (`ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`) —
  hashed at seed time; never commit a plaintext password.
- Workspaces with no `subscriptions` row (or no `free` plan row yet) resolve to
  the baked-in `FREE_FALLBACK` limits in `EntitlementsService` — fail closed.

---

## 3. Auth model (cross-origin, separate identity)

### 3.1 Tokens & cookies
- **Separate secret** `ADMIN_JWT_SECRET` (distinct from tenant `JWT_SECRET`).
- Access token: short-lived JWT, payload `{ sub: adminUserId, email, role }`.
- Refresh token: random, stored **hashed** in `admin_refresh_tokens` (mirror the
  existing `refresh_tokens` flow in auth-service).
- **Separate cookies:** `admin_access_token`, `admin_refresh_token`. An admin
  session must never satisfy a tenant guard or vice-versa.

### 3.2 Cross-origin cookie settings (separate-repo SPA)
The SPA runs on a different origin (`admin.wriven.tech`) than the API
(`api.wriven.tech`). For the browser to send admin cookies:
- Cookies: **`httpOnly; Secure; SameSite=None`** (SameSite=None requires Secure;
  Lax/Strict would block cross-site sending).
- Gateway CORS: allow exactly `ADMIN_PANEL_ORIGIN`, `credentials: true`, allow the
  CSRF header. Configure in [main.ts](../../apps/api-gateway/src/main.ts) — add the
  admin origin alongside the existing tenant origin (don't use `*` with credentials).
- Keep the existing **`CsrfGuard`** on admin mutations (double-submit token), same
  as tenant side.

> **Alternative (bearer token):** issue the access token in the login JSON body,
> store it in SPA memory (not localStorage), send `Authorization: Bearer`. Simpler
> CORS, but you lose httpOnly protection and must handle refresh manually.
> **Default to cookies** unless cross-origin cookie setup is blocked by the host.

### 3.3 `AdminJwtGuard`
Clone [jwt-auth.guard.ts](../../apps/api-gateway/src/auth/jwt-auth.guard.ts):
read the `admin_access_token` cookie, `jwt.verify` with `ADMIN_JWT_SECRET`, attach
`req.adminUser = { adminUserId: payload.sub, email, role }`. On failure throw
`UNAUTHORIZED` (reuse `ERROR_CODES`).

### 3.4 `AdminRolesGuard` + `@AdminRoles`
```ts
@AdminRoles('admin')                  // only admin
@AdminRoles('admin', 'moderator')     // admin or moderator
// (no decorator) => any authenticated admin, incl. member (read-only routes)
```
The guard reads the route's required roles (via `Reflector`) and checks
`req.adminUser.role`. `member` passes only on routes with no decorator (reads).
Throw `FORBIDDEN` otherwise.

### 3.5 TOTP (MFA) — not implemented
The `admin_users.totpSecret` column exists in the schema, but no runtime TOTP
flow is built: login is single-step email+password, there is no
`/admin/auth/login/totp`, and admins have no MFA reset. Deferred (see §10).

---

## 4. Audit logging (mandatory on every write)

Implement once, apply everywhere via decorator + interceptor:

```ts
@Audit('user.suspend', { target: 'user' })   // action + target type
@Patch('users/:id')
suspendUser(@Param('id') id: string, ...) { ... }
```

`AuditInterceptor`:
- runs **after** the handler succeeds (no audit on failure unless you want
  attempted-action logging — out of scope for v1),
- resolves `adminUserId` from `req.adminUser`, `ip` from request,
- `targetId` from a configured route param (default `:id`) or the handler result,
- `metadata` from an optional `req.auditMeta` the handler can set (e.g. before/after,
  reason from the request body),
- calls auth-service `admin.audit.write` (TCP) to insert the row.

Rule: **no mutating admin endpoint ships without `@Audit`.** PR review checks this.

---

## 5. Cross-tenant data access — `admin.*` RPC

Tenant message patterns are scoped to the calling user's memberships. Admin needs
unscoped, cross-tenant reads/writes. **Add new `admin.*` message patterns** in
auth-service and core-service rather than loosening tenant handlers (keeps god-mode
explicit and greppable).

Add to the existing TCP controllers (or new `admin.controller.ts` per service).
Examples — name them `admin.<area>.<action>`:

**auth-service (`admin.controller.ts`):**
```
admin.auth.login / admin.auth.refresh / admin.auth.logout / admin.auth.getById
admin.admins.list / .create / .update / .delete
admin.audit.write / admin.audit.list
admin.users.list (search/paginate ALL tenant users) / .get / .update (suspend, force-verify) / .delete
admin.workspaces.list (+owner, member/project counts, plan) / .get / .setPlan
admin.projects.list / .get / .delete
admin.plans.list / .create / .update
  # Returns AdminPlanView (PlanView + stripe_product_id / stripe_price_id_monthly /
  # stripe_price_id_yearly) so the admin can see the Stripe linkage. create
  # (paid) also creates the Stripe Product + monthly/yearly Prices and stores
  # their ids; a paid plan with no price (monthly or yearly) → VALIDATION_ERROR.
  # update with active:false archives the Stripe Product + deactivates its Prices.
  # Prices are read-only after create (Stripe owns pricing). Stripe failures →
  # STRIPE_SYNC_FAILED (DB write skipped). See specs/11.
admin.metrics.auth (user/workspace/plan counts from auth_svc)
```

**core-service (`admin.controller.ts`):**
```
admin.content.list (cross-tenant, filter ws/project/type/status) / .get / .takedown
admin.contentTypes.list (cross-tenant content-type definitions)
admin.media.list / .usage (per-workspace bytes) / .purge
admin.apiKeys.list / .revoke
admin.webhooks.list / .disable
admin.projects.usage (per-project content/media/keys/webhooks/AI rollup)
admin.support.list / .get / .reply / .update / .metrics (support ticketing)
admin.metrics.content (entry/media/key counts + storage totals)
```

Gateway controllers fan out to whichever service owns the data; for screens that
need both identity and content (e.g. workspace detail with storage), the gateway
calls both and merges — same pattern the tenant side already uses across the
`auth_svc`/`core_svc` no-FK boundary.

All list endpoints: **paginate + filter + sort** (match the tenant list contract
in [API Reference](../api-reference.md)). Never return unbounded result sets.

---

## 6. HTTP endpoint surface (`/admin/*`)

All under `AdminJwtGuard`. Mutations under `CsrfGuard` + `@Audit`. Role gates shown
in brackets — none = any admin (incl. `member`, read-only).

```
# Auth
POST   /admin/auth/login                 # single-step email+password -> cookies (no TOTP step)
POST   /admin/auth/refresh
POST   /admin/auth/logout
GET    /admin/auth/me                    # { adminUserId, email, name, role }

# Metrics
GET    /admin/metrics/overview           # gateway merge of auth + core metrics (users/ws/projects/entries/storage/plan split — no growth fields)

# Tenant users
GET    /admin/users                      # search/paginate
GET    /admin/users/:id                  # detail + memberships + activity
PATCH  /admin/users/:id                  [admin|moderator]  # suspend/reactivate, force-verify
DELETE /admin/users/:id                  [admin]            # HARD delete (FK violations → CONFLICT)

# Workspaces
GET    /admin/workspaces                 # list + owner + usage + plan
GET    /admin/workspaces/:id             # members, projects, storage, plan
PATCH  /admin/workspaces/:id             [admin|moderator]  # suspend / rename
PUT    /admin/workspaces/:id/plan        [admin]            # assign plan + overrides

# Projects
GET    /admin/projects                    # cross-workspace
GET    /admin/projects/:id
GET    /admin/projects/:id/usage          # per-project counts
DELETE /admin/projects/:id               [admin]            # soft-delete

# Content types
GET    /admin/content-types               # all types (cross-tenant)

# Content moderation
GET    /admin/content                     # global entry browser (read-only)
GET    /admin/content/:id
PATCH  /admin/content/:id                [admin|moderator]  # takedown: archive/unpublish

# Media
GET    /admin/media                        # usage per workspace, large/abusive files
DELETE /admin/media/:id                  [admin|moderator]  # purge

# API keys
GET    /admin/api-keys                     # all keys (prefix/scope/project/lastUsed)
DELETE /admin/api-keys/:id               [admin|moderator]  # revoke

# Webhooks
GET    /admin/webhooks                      # all + last status
PATCH  /admin/webhooks/:id/disable       [admin|moderator]  # disable

# Support (staff ticket handling)
GET    /admin/support/tickets            # queue: page/limit/status/priority/scopeType/workspaceId/assignedAdminId/unassigned/q
GET    /admin/support/tickets/:id        # full thread incl. internal notes
POST   /admin/support/tickets/:id/messages  [admin|moderator]  # reply / internal note
PATCH  /admin/support/tickets/:id        [admin|moderator]  # status/priority/assignee
GET    /admin/support/metrics            # counts: open/pending/resolved/closed/unassigned/total

# Plans (definitions)
GET    /admin/plans
POST   /admin/plans                       [admin]
PATCH  /admin/plans/:id                   [admin]

# Admin users
GET    /admin/admins                      [admin]
POST   /admin/admins                      [admin]
PATCH  /admin/admins/:id                  [admin]   # { role?, active? } only
DELETE /admin/admins/:id                  [admin]

# Audit
GET    /admin/audit-log                    # ?page&limit&action&targetType (no admin-id/date filters)
```

Responses use the standard envelope. The frontend client (frontend.md §4) unwraps
`data` and throws `error`.

---

## 7. Env additions

Add to gateway + auth-service `.env.example` (never commit real secrets):

```
ADMIN_JWT_SECRET=            # distinct from JWT_SECRET
ADMIN_PANEL_ORIGIN=https://admin.wriven.tech   # CORS allowlist for the SPA
ADMIN_SEED_EMAIL=
ADMIN_SEED_PASSWORD_HASH=    # argon2/bcrypt hash, set out-of-band
# optional hardening
ADMIN_IP_ALLOWLIST=          # comma-separated CIDRs for /admin/* (prod)
```

---

## 8. Security checklist (enforce in code + review)

- [ ] Admin identity, JWT secret, and cookies fully separate from tenant.
- [ ] RBAC checked **server-side** on every endpoint; `member` = read-only.
- [ ] Every mutating endpoint has `@Audit`; audit log is append-only.
- [ ] CORS allowlist is the exact admin origin, `credentials: true`, no `*`.
- [ ] Cookies `httpOnly; Secure; SameSite=None`; CSRF guard on mutations.
- [ ] Cross-tenant access only through explicit `admin.*` RPC (tenant handlers
      untouched).
- [ ] No raw secrets returned (api-key tokens / webhook secrets are hash/once-only;
      admin sees prefixes/metadata).
- [ ] Destructive ops require a reason (stored in audit metadata) + role gate.
- [ ] Optional: IP allowlist + rate limit on `/admin/*` in prod.
- [ ] TOTP for `admin` (recommended-required).

---

## 9. Build order (backend)

1. Schema + migration + seed (`free` plan, bootstrap `admin`).
2. auth-service `admin/` module: admin-auth (login/TOTP/refresh), admin-users CRUD,
   audit write/list, admin-tenancy queries, plans. Register `admin.*` patterns.
3. core-service `admin/` module: content/media/keys/webhooks cross-tenant queries +
   `admin.*` patterns.
4. gateway `admin/` module: `AdminJwtGuard`, `AdminRolesGuard` + decorator,
   `@CurrentAdmin`, `AuditInterceptor` + `@Audit`, all controllers, CORS for the
   SPA origin.
5. `.env.example` updates; update [../../status.md](../status.md) +
   [../../api-reference.md](../api-reference.md) (add the `/admin/*` section).

## 10. Implementation status

- ✅ **Phase A** — admin identity (`admin_users`), `AdminJwtGuard` + `AdminRolesGuard`
  (`admin`/`moderator`/`member`), `@Audit` interceptor + `admin_audit_log`,
  `/admin/auth/*`, `/admin/metrics/overview`, `/admin/admins`, `/admin/audit-log`.
- ✅ **Phase B** — tenant oversight: `/admin/users` (list/detail/suspend/verify/
  delete), `/admin/workspaces` (list/detail), `/admin/projects` (list/detail/
  soft-delete). `users.suspendedAt` blocks login.
- ✅ **Phase C** — moderation (core-service): `/admin/content` (list/get/takedown),
  `/admin/media` (list/usage/purge), `/admin/api-keys` (list/revoke),
  `/admin/webhooks` (list/disable).
- ✅ **Phase D** — plans + enforcement: `/admin/plans` (list/create/update),
  `PUT /admin/workspaces/:id/plan` (assign). `EntitlementsService` resolves
  effective limits (plan + subscription overrides) and **enforces** the
  `projects` and `members` quotas on tenant create paths (free = 2 projects →
  `PLAN_LIMIT_REACHED`). `auth.entitlements.resolve` RPC exposes limits+usage.

**Hardening applied (review pass):**
- Suspending a user revokes its refresh tokens; `refresh()` rejects suspended
  accounts (kills active sessions, not just new logins).
- Last-active-`admin` and self-deactivate/delete guards on admin-user mgmt.
- Admin tokens carry `typ:'admin'`; `AdminJwtGuard` rejects non-admin tokens
  (defence even if secrets were mis-set equal).
- Project/member quota enforced **inside** the create tx under a per-workspace
  advisory lock (TOCTOU-safe). Limits **fail closed** to baked-in free defaults
  if the `free` plan isn't seeded.
- Plan assignment is an atomic upsert (`onConflictDoUpdate`); create-audit rows
  capture the new entity id from the handler result.

**Enforcement now complete (auth + core):**
- Auth-side (TOCTOU-safe, advisory-locked): **projects**, **members** — on
  direct create, workspace create, and **invitation accept** (new seats only).
- Core-side (`CoreEntitlementsService` → `auth.entitlements.resolve`): **entries**,
  **contentTypes**, **apiKeys**, **webhooks** on create; **media storage**
  (`storageMb`) enforced at presign against the plan (was a hardcoded constant).
  The resolve call is **timed out (4s) + short-cached (30s) + fails open** — an
  auth-service blip can't block content creation.
- Seat quota also enforced on **project-invite guest auto-add**
  (`ensureWorkspaceMember`), counting guests — closes the invite seat bypass.
- Content **takedown purges the CDN** (`CachePurgeService.purgeEntry`).

**Deferred (next slice):** TOTP/MFA. IP allowlist + `/admin/*` rate-limit.
**CORS origin allowlist — done** (`CORS_ORIGINS` on the gateway). Metrics/media-usage caching at
scale. (Core-side quota counts are point-in-time, not advisory-locked — minor
race on soft caps; hard storage cap is checked pre-upload.)
```
