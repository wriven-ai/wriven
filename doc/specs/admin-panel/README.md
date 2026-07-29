# Admin Panel (Platform Console)

The **Wriven Admin Panel** — the internal console used by Wriven staff to operate
the whole SaaS: oversee every tenant, moderate content, manage plans/limits,
handle abuse, and audit activity.

This folder is the single source of truth for building it:

| Doc | For | Covers |
|-----|-----|--------|
| **README.md** (this) | everyone | What it is, architecture, roles, the two repos |
| [backend.md](./backend.md) | **the backend agent (this repo)** | Schema, `AdminJwtGuard` + RBAC + audit, cross-tenant RPC, every `/admin/*` endpoint, CORS/cookies for a cross-origin SPA |
| [frontend.md](./frontend.md) | **the admin-panel frontend agent (separate repo)** | Full SPA build guide: stack, project structure, auth/data layer, every screen, and the design system |
| [api-contract.md](./api-contract.md) | **the frontend agent** | Concrete `/admin/*` endpoint table (method/path/role/req/resp) + copy-paste TS types & DTOs + deltas from frontend.md. Hand this over directly. |

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
  short-lived bearer token held in memory. backend.md picks the cookie path and
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

Full DDL in [backend.md §2](./backend.md). All in the `auth_svc` schema:

- **`admin_users`** — staff identity (email, passwordHash, `role`
  admin|moderator|member, totpSecret, active). Separate from tenant `users`.
- **`admin_refresh_tokens`** — admin sessions (separate cookies/secret).
- **`admin_audit_log`** — append-only record of every admin write (mandatory).
- **`plans`** + **`workspace_plans`** — plan definitions + per-workspace
  assignment/limits (billing deferred; assignment + display needed now).
- (optional) **`platform_settings`** — runtime feature flags.

---

## 5. Build order

1. **Backend (this repo)** — schema + migration + seed (`admin` + `free` plan);
   `admin/` gateway module: `AdminJwtGuard`, `RolesGuard`, `@Audit` interceptor,
   `/admin/auth/*`; cross-tenant `admin.*` RPC in auth/core; CORS for the SPA
   origin. → [backend.md](./backend.md).
2. **Frontend (separate repo)** — Vite + React Router SPA per [frontend.md](./frontend.md),
   wired to `/admin/*`, screens in priority order, design system applied.

When a module or material change lands, update these docs and
[../08-status.md](../08-status.md) (keep `doc/` current — house rule).

---

## 6. Open decisions (confirm with product)

- **Auth transport:** cross-origin httpOnly cookies (`SameSite=None; Secure`) —
  **recommended** — vs in-memory bearer token. backend.md assumes cookies.
- **Admin SPA domain:** `admin.wriven.com` assumed (sets the CORS origin).
- **Plan enforcement:** v1 = assign + display limits; wiring limits into tenant
  write paths is a follow-up.
- **MFA:** TOTP recommended-required for `admin`. In v1 scope?
- **Impersonation:** deferred past v1 (recommended).
