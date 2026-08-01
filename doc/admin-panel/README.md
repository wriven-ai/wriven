# Admin Panel (Platform Console)

The **Wriven Admin Panel** — the internal console used by Wriven staff to operate
the whole SaaS: oversee every tenant, moderate content, manage plans/limits,
handle abuse, and audit activity.

This folder is the single source of truth for building it. The build guides are
split **one file per module**:

| Doc | For | Covers |
|-----|-----|--------|
| **README.md** (this) | everyone | What it is, architecture, roles, the two repos |
| [backend/](./backend/) | **the backend agent (this repo)** | Per-module impl spec (see table below) |
| [frontend/](./frontend/) | **the admin-panel frontend agent (separate repo)** | Per-module SPA build guide (see table below) |
| [api-contract.md](./api-contract.md) | **the frontend agent** | Concrete `/admin/*` endpoint table (method/path/role/req/resp) + copy-paste TS types & DTOs. Hand this over directly. |

**Backend modules** ([backend/](./backend/)):

| File | Covers |
|------|--------|
| [01-overview.md](./backend/01-overview.md) | File layout, env, build order, implementation status |
| [02-schema.md](./backend/02-schema.md) | `auth_svc` DDL — admin identity, audit, plans, subscriptions, seed |
| [03-auth.md](./backend/03-auth.md) | Tokens/cookies, cross-origin CORS, `AdminJwtGuard`, RBAC, TOTP |
| [04-audit.md](./backend/04-audit.md) | `@Audit` decorator + interceptor → `admin_audit_log` |
| [05-rpc.md](./backend/05-rpc.md) | Cross-tenant `admin.*` TCP message patterns |
| [06-endpoints.md](./backend/06-endpoints.md) | Full `/admin/*` HTTP endpoint table |
| [07-tenancy.md](./backend/07-tenancy.md) | Users / workspaces / projects oversight |
| [08-moderation.md](./backend/08-moderation.md) | Content / media / api-keys / webhooks moderation |
| [09-plans.md](./backend/09-plans.md) | Plans + subscriptions + plan-limit enforcement |
| [10-security.md](./backend/10-security.md) | Security checklist |

**Frontend modules** ([frontend/](./frontend/)):

| File | Covers |
|------|--------|
| [01-overview.md](./frontend/01-overview.md) | What you're building, screen order, definition of done |
| [02-stack-structure.md](./frontend/02-stack-structure.md) | Tech stack, project structure, env |
| [03-data-layer.md](./frontend/03-data-layer.md) | API client, types, auth bootstrap, query conventions, nav |
| [04-screens.md](./frontend/04-screens.md) | Every screen, detailed spec |
| [05-design-system.md](./frontend/05-design-system.md) | Wriven brand tokens (light+dark), typography, components |

> **Definition:** a **separate-repo** React + React Router SPA, talking to a new
> `/admin/*` API surface on the existing gateway, authenticated by a **separate
> `admin_users` identity** (never tenant users), with **full audit logging** and
> server-side **RBAC** (`admin` · `moderator` · `member`).

---

## 1. What this is — and what it is NOT

| | Tenant Dashboard (`apps/client`) | **Admin Panel (this)** |
|--|----------------------------------|------------------------|
| Who logs in | Customers (tenant users) | **Wriven staff only** |
| Identity table | `auth_svc.users` | **`auth_svc.admin_users`** (new) |
| Scope | One user's own workspaces/projects | **Cross-tenant — everything** |
| Repo | This monorepo (Next.js) | **Separate repo** (React + React Router, Vite) |
| Backend | Gateway tenant endpoints | **NEW `/admin/*` module on the same gateway** |
| Guards | Per-user `WorkspaceGuard`/`ProjectGuard` | **`AdminJwtGuard` + RBAC, bypasses tenant scoping** |

**NOT:** not the tenant dashboard, not a second content editor, not for customers.
A god-mode operations console. Every screen is cross-tenant; every write is audited.

---

## 2. Two repos, one gateway

```
   ┌──────────────────────────────┐         ┌──────────────────────────────┐
   │  Admin Panel SPA (SEPARATE    │         │   Wriven monorepo (this)      │
   │  REPO): React + React Router  │         │                               │
   │  + Vite. Hand-maintained      │         │   api-gateway                 │
   │  types (no @wriven/contracts) │         │     + NEW `admin/` module     │
   └──────────────┬───────────────┘         │   auth-service (auth_svc)     │
                  │ HTTPS, credentials:include │   core-service (core_svc)     │
                  │ cross-origin (CORS allow)  │                               │
                  ▼                            └──────────────────────────────┘
        admin.wriven.com  ───────────────────▶  api.wriven.com/admin/*
```

Consequences of the **separate repo** (details in the two sub-docs):

- **No shared types.** The SPA can't `import type` from `@wriven/contracts`.
  Hand-maintain a small `types.ts` in the admin repo mirroring the response
  envelope + admin DTOs (same approach the published SDK client took). A future
  `@wriven-ai/admin-types` package is optional, not now.
- **Cross-origin auth.** Admin cookies are set by `api.wriven.com` but read by a
  browser on `admin.wriven.com`. Use `SameSite=None; Secure` httpOnly cookies +
  gateway **CORS allowlist** (`ADMIN_PANEL_ORIGIN`) with `credentials: true`, OR a
  short-lived bearer token held in memory. backend/03-auth.md picks the cookie path and
  explains both.
- **Independent deploy.** The SPA ships on its own (Vercel/Netlify/static host).
  The gateway just needs the CORS origin env set.

---

## 3. Admin roles (RBAC) — `admin` · `moderator` · `member`

Distinct from tenant roles. Stored on `admin_users.role`, enforced **server-side**
on every endpoint (a hidden button is not security).

| Role | Can |
|------|-----|
| **`admin`** | Everything: manage admin_users, define/assign plans, platform settings, all moderation, all destructive ops (suspend/delete/revoke/takedown). |
| **`moderator`** | Tenant oversight + moderation: view all users/workspaces/projects/content/media; suspend users/workspaces, content takedown (archive/unpublish), revoke API keys, disable webhooks, purge abusive media, resend verification. **Cannot** manage admin_users, define plans, or change platform settings. |
| **`member`** | **Read-only** across the entire panel (support/auditor). No writes. |

`admin` is the only role that manages other admins and plans/settings. Keep the
enum small now; can split later without touching tenant code.

---

## 4. New database tables (summary)

Full DDL in [backend/02-schema.md](./backend/02-schema.md). All in the `auth_svc` schema:

- **`admin_users`** — staff identity (email, passwordHash, `role`
  admin|moderator|member, totpSecret, active). Separate from tenant `users`.
- **`admin_refresh_tokens`** — admin sessions (separate cookies/secret).
- **`admin_audit_log`** — append-only record of every admin write (mandatory).
- **`plans`** + **`subscriptions`** — plan definitions + one subscription per
  workspace (Stripe-ready; created `free` on workspace creation, admin overrides).
- (optional) **`platform_settings`** — runtime feature flags.

---

## 5. Build order

1. **Backend (this repo)** — schema + migration + seed (`admin` + `free` plan);
   `admin/` gateway module: `AdminJwtGuard`, `RolesGuard`, `@Audit` interceptor,
   `/admin/auth/*`; cross-tenant `admin.*` RPC in auth/core; CORS for the SPA
   origin. → [backend/](./backend/).
2. **Frontend (separate repo)** — Vite + React Router SPA per [frontend/](./frontend/),
   wired to `/admin/*`, screens in priority order, design system applied.

When a module or material change lands, update these docs and
[../../status.md](../status.md) (keep `doc/` current — house rule).

---

## 6. Open decisions (confirm with product)

- **Auth transport:** cross-origin httpOnly cookies (`SameSite=None; Secure`) —
  **recommended** — vs in-memory bearer token. backend/03-auth.md assumes cookies.
- **Admin SPA domain:** `admin.wriven.com` assumed (sets the CORS origin).
- **Plan enforcement:** v1 = assign + display limits; wiring limits into tenant
  write paths is a follow-up.
- **MFA:** TOTP recommended-required for `admin`. In v1 scope?
- **Impersonation:** deferred past v1 (recommended).
