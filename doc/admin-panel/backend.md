# Admin Panel — Backend Implementation Spec

Implementation guide for the **`/admin/*` API surface** built in this monorepo.
This is the doc the backend agent (working in this repo) follows to add admin
support to the gateway + auth/core services. Pairs with
[README.md](./README.md) (context) and [frontend.md](./frontend.md) (the SPA that
consumes this).

Conventions to follow throughout: Drizzle in `auth_svc`/`core_svc` schemas,
NestJS modules + TCP microservices, the `{ success, data }` / `{ success, error }`
envelope, and the patterns already in
[06 — API Reference](../06-api-reference.md), [07 — Conventions](../07-conventions.md),
[02 — Architecture](../02-architecture.md). **Mirror existing code** (guards,
controllers, message patterns) rather than inventing new shapes.

---

## 1. Where things go

```
apps/auth-service/src/
  db/schema/index.ts            # + adminUsers, adminRefreshTokens, adminAuditLog, plans, workspacePlans
  admin/                        # NEW: admin identity + cross-tenant tenant queries
    admin-auth.service.ts       #   login, TOTP, refresh, password
    admin-users.service.ts      #   CRUD admin_users (admin role only)
    admin-audit.service.ts      #   write + query audit log
    admin-tenancy.service.ts    #   cross-tenant user/workspace/project queries (no scope)
    plans.service.ts            #   plans + workspace_plans
    admin.controller.ts         #   @MessagePattern('admin.*') handlers

apps/core-service/src/
  admin/                        # NEW: cross-tenant content/media/keys/webhooks queries
    admin-content.service.ts
    admin-media.service.ts
    admin-keys.service.ts
    admin-webhooks.service.ts
    admin.controller.ts         #   @MessagePattern('admin.*') handlers

apps/api-gateway/src/admin/     # NEW: public HTTP surface for the SPA
  admin-jwt.guard.ts            #   verifies admin_access_token (ADMIN_JWT_SECRET)
  admin-roles.guard.ts          #   RBAC: admin|moderator|member
  admin-roles.decorator.ts      #   @AdminRoles('admin', 'moderator')
  current-admin.decorator.ts    #   @CurrentAdmin() -> { adminUserId, email, role }
  audit.interceptor.ts          #   @Audit('user.suspend') -> writes admin_audit_log
  audit.decorator.ts
  admin-auth.controller.ts      #   /admin/auth/*
  admin-users.controller.ts     #   /admin/admins/*  (admin only)
  admin-metrics.controller.ts   #   /admin/metrics/*
  admin-tenancy.controller.ts   #   /admin/users, /workspaces, /projects
  admin-content.controller.ts   #   /admin/content, /media, /api-keys, /webhooks, /invitations
  admin-plans.controller.ts     #   /admin/plans
  admin-audit.controller.ts     #   /admin/audit-log
  admin.module.ts
```

---

## 2. Schema (auth_svc) — full DDL

Add to [apps/auth-service/src/db/schema/index.ts](../../apps/auth-service/src/db/schema/index.ts).
Then generate + run a migration (see [03 — Database](../03-database.md)).

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

export const plans = authSchema.table('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),     // 'free'|'pro'|'team'|'enterprise'
  name: text('name').notNull(),
  limits: jsonb('limits').notNull().default(sql`'{}'::jsonb`),
  // { projects, members, storageMb, entries, apiKeys, webhooks } — absent = unlimited
  priceMonthly: integer('price_monthly'),  // cents; informational until billing
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workspacePlans = authSchema.table('workspace_plans', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'restrict' }),
  status: text('status').notNull().default('active'),  // active|past_due|suspended|trialing
  overrides: jsonb('overrides'),                        // per-workspace limit overrides
  assignedBy: uuid('assigned_by'),                      // admin_user id (no FK across concern)
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
```

**Seed (migration or a one-off seed script):**
- One `free` plan: `{ key:'free', name:'Free', limits:{ projects:3, members:5, storageMb:100, entries:1000, apiKeys:5, webhooks:3 } }`.
- One bootstrap `admin` user from env (`ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD_HASH`) — never commit a plaintext password.
- Workspaces with no `workspace_plans` row resolve to `free` in code.

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
The SPA runs on a different origin (`admin.wriven.com`) than the API
(`api.wriven.com`). For the browser to send admin cookies:
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

### 3.5 TOTP (MFA)
If `admin_users.totpSecret` is set, `/admin/auth/login` returns a
`{ mfaRequired: true, challengeId }` step; a second call `/admin/auth/login/totp`
verifies the 6-digit code before issuing cookies. Recommended-required for `admin`.

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
admin.auth.login / admin.auth.totp / admin.auth.refresh / admin.auth.logout / admin.auth.me
admin.adminUsers.list / .get / .create / .update / .delete
admin.audit.write / admin.audit.list
admin.users.list (search/paginate ALL tenant users) / .get / .update / .delete / .resendVerification
admin.workspaces.list (+owner, member/project counts, plan) / .get / .update / .suspend
admin.workspaces.setPlan
admin.projects.list / .get / .delete
admin.invitations.list
admin.plans.list / .create / .update
admin.metrics.overview (counts + growth from auth_svc)
```

**core-service (`admin.controller.ts`):**
```
admin.content.list (cross-tenant, filter ws/project/type/status) / .get / .takedown
admin.media.usageByWorkspace / .list / .purge
admin.apiKeys.list / .revoke
admin.webhooks.list / .disable
admin.metrics.content (entry/media/key counts + storage totals)
```

Gateway controllers fan out to whichever service owns the data; for screens that
need both identity and content (e.g. workspace detail with storage), the gateway
calls both and merges — same pattern the tenant side already uses across the
`auth_svc`/`core_svc` no-FK boundary.

All list endpoints: **paginate + filter + sort** (match the tenant list contract
in [06](../06-api-reference.md)). Never return unbounded result sets.

---

## 6. HTTP endpoint surface (`/admin/*`)

All under `AdminJwtGuard`. Mutations under `CsrfGuard` + `@Audit`. Role gates shown
in brackets — none = any admin (incl. `member`, read-only).

```
# Auth
POST   /admin/auth/login                 # email+password -> cookies, or { mfaRequired }
POST   /admin/auth/login/totp            # 6-digit code -> cookies
POST   /admin/auth/refresh
POST   /admin/auth/logout
GET    /admin/auth/me                    # { adminUserId, email, name, role }

# Metrics
GET    /admin/metrics/overview           # KPIs: users/ws/projects/entries/storage, growth, plan split

# Tenant users
GET    /admin/users                      # search/paginate
GET    /admin/users/:id                  # detail + memberships + activity
PATCH  /admin/users/:id                  [admin|moderator]  # suspend/reactivate, force-verify
POST   /admin/users/:id/resend-verification   [admin|moderator]
DELETE /admin/users/:id                  [admin]            # soft-delete / GDPR

# Workspaces
GET    /admin/workspaces                 # list + owner + usage + plan
GET    /admin/workspaces/:id             # members, projects, storage, plan
PATCH  /admin/workspaces/:id             [admin|moderator]  # suspend / rename
PUT    /admin/workspaces/:id/plan        [admin]            # assign plan + overrides

# Projects
GET    /admin/projects                    # cross-workspace
GET    /admin/projects/:id
DELETE /admin/projects/:id               [admin]            # soft-delete

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
PATCH  /admin/webhooks/:id               [admin|moderator]  # disable

# Invitations
GET    /admin/invitations                   # pending system-wide

# Plans (definitions)
GET    /admin/plans
POST   /admin/plans                       [admin]
PATCH  /admin/plans/:id                   [admin]

# Admin users
GET    /admin/admins                      [admin]
POST   /admin/admins                      [admin]
PATCH  /admin/admins/:id                  [admin]   # role, deactivate, reset MFA
DELETE /admin/admins/:id                  [admin]

# Audit
GET    /admin/audit-log                    # filter by admin/action/target/date
```

Responses use the standard envelope. The frontend client (frontend.md §4) unwraps
`data` and throws `error`.

---

## 7. Env additions

Add to gateway + auth-service `.env.example` (never commit real secrets):

```
ADMIN_JWT_SECRET=            # distinct from JWT_SECRET
ADMIN_PANEL_ORIGIN=https://admin.wriven.com   # CORS allowlist for the SPA
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
5. `.env.example` updates; update [../08-status.md](../08-status.md) +
   [../06-api-reference.md](../06-api-reference.md) (add the `/admin/*` section).
```
