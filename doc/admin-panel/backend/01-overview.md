# Admin Panel — Backend Overview

Implementation guide for the **`/admin/*` API surface** built in this monorepo.
This is the doc the backend agent (working in this repo) follows to add admin
support to the gateway + auth/core services. Pairs with
[../README.md](../README.md) (context) and the [frontend/](../frontend/) guide (the
SPA that consumes this).

Conventions to follow throughout: Drizzle in `auth_svc`/`core_svc` schemas,
NestJS modules + TCP microservices, the `{ success, data }` / `{ success, error }`
envelope, and the patterns already in
[06 — API Reference](../../06-api-reference.md), [07 — Conventions](../../07-conventions.md),
[02 — Architecture](../../02-architecture.md). **Mirror existing code** (guards,
controllers, message patterns) rather than inventing new shapes.

## Module docs (this folder)

| File | Covers |
|------|--------|
| **01-overview.md** (this) | File layout, env, build order, implementation status |
| [02-schema.md](./02-schema.md) | `auth_svc` DDL — admin identity, audit, plans, subscriptions, seed |
| [03-auth.md](./03-auth.md) | Tokens/cookies, cross-origin CORS, `AdminJwtGuard`, RBAC, TOTP |
| [04-audit.md](./04-audit.md) | `@Audit` decorator + interceptor → `admin_audit_log` |
| [05-rpc.md](./05-rpc.md) | Cross-tenant `admin.*` TCP message patterns (auth + core) |
| [06-endpoints.md](./06-endpoints.md) | Full `/admin/*` HTTP endpoint table (the contract) |
| [07-tenancy.md](./07-tenancy.md) | Users / workspaces / projects oversight module |
| [08-moderation.md](./08-moderation.md) | Content / media / api-keys / webhooks moderation module |
| [09-plans.md](./09-plans.md) | Plans + subscriptions + plan-limit enforcement |
| [10-security.md](./10-security.md) | Security checklist (enforce in code + review) |

---

## 1. Where things go

```
apps/auth-service/src/
  db/schema/index.ts            # + adminUsers, adminRefreshTokens, adminAuditLog, plans, subscriptions
  admin/                        # NEW: admin identity + cross-tenant tenant queries
    admin-auth.service.ts       #   login, TOTP, refresh, password
    admin-users.service.ts      #   CRUD admin_users (admin role only)
    admin-audit.service.ts      #   write + query audit log
    admin-tenancy.service.ts    #   cross-tenant user/workspace/project queries (no scope)
    admin-plans.service.ts      #   plans + subscriptions
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

## 2. Env additions

Add to gateway + auth-service `.env.example` (never commit real secrets):

```
ADMIN_JWT_SECRET=            # distinct from JWT_SECRET
ADMIN_PANEL_ORIGIN=https://admin.wriven.com   # CORS allowlist for the SPA
ADMIN_SEED_EMAIL=
ADMIN_SEED_PASSWORD_HASH=    # argon2/bcrypt hash, set out-of-band
# optional hardening
ADMIN_IP_ALLOWLIST=          # comma-separated CIDRs for /admin/* (prod)
```

> `ADMIN_JWT_SECRET` must be **identical** in auth-service + gateway and
> **different** from `JWT_SECRET`.

---

## 3. Build order

1. Schema + migration + seed (`free` plan, bootstrap `admin`). → [02-schema.md](./02-schema.md).
2. auth-service `admin/` module: admin-auth (login/TOTP/refresh), admin-users CRUD,
   audit write/list, admin-tenancy queries, plans. Register `admin.*` patterns.
   → [03-auth.md](./03-auth.md), [05-rpc.md](./05-rpc.md), [07-tenancy.md](./07-tenancy.md), [09-plans.md](./09-plans.md).
3. core-service `admin/` module: content/media/keys/webhooks cross-tenant queries +
   `admin.*` patterns. → [08-moderation.md](./08-moderation.md).
4. gateway `admin/` module: `AdminJwtGuard`, `AdminRolesGuard` + decorator,
   `@CurrentAdmin`, `AuditInterceptor` + `@Audit`, all controllers, CORS for the
   SPA origin. → [03-auth.md](./03-auth.md), [04-audit.md](./04-audit.md), [06-endpoints.md](./06-endpoints.md).
5. `.env.example` updates; update [../../08-status.md](../../08-status.md) +
   [../../06-api-reference.md](../../06-api-reference.md) (add the `/admin/*` section).

---

## 4. Implementation status

- ✅ **Phase A** — admin identity (`admin_users`), `AdminJwtGuard` + `AdminRolesGuard`
  (`admin`/`moderator`/`member`), `@Audit` interceptor + `admin_audit_log`,
  `/admin/auth/*`, `/admin/metrics/overview`, `/admin/admins`, `/admin/audit-log`.
- ✅ **Phase B** — tenant oversight: `/admin/users` (list/detail/suspend/verify/
  delete), `/admin/workspaces` (list/detail), `/admin/projects` (list/detail/
  soft-delete). `users.suspendedAt` blocks login. → [07-tenancy.md](./07-tenancy.md).
- ✅ **Phase C** — moderation (core-service): `/admin/content` (list/get/takedown),
  `/admin/media` (list/usage/purge), `/admin/api-keys` (list/revoke),
  `/admin/webhooks` (list/disable). → [08-moderation.md](./08-moderation.md).
- ✅ **Phase D** — plans + enforcement: `/admin/plans` (list/create/update),
  `PUT /admin/workspaces/:id/plan` (assign). `EntitlementsService` resolves
  effective limits (plan + subscription overrides) and **enforces** the
  `projects` and `members` quotas on tenant create paths (free = 2 projects →
  `PLAN_LIMIT_REACHED`). `auth.entitlements.resolve` RPC exposes limits+usage.
  → [09-plans.md](./09-plans.md).

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
**CORS origin allowlist** (still `origin:true`). Metrics/media-usage caching at
scale. (Core-side quota counts are point-in-time, not advisory-locked — minor
race on soft caps; hard storage cap is checked pre-upload.)
