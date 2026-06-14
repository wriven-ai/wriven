# 08 — Current Scope & Status

What is actually implemented today, per module. Legend: ✅ done · 🟡 partial · 🔲 not started.

_Last reviewed: after org/workspace member CRUD + client auth integration._

---

## Platform / infra

| Item | Status | Notes |
|------|--------|-------|
| Nx + pnpm monorepo | ✅ | apps + `libs/shared/*` |
| Single shared Supabase Postgres, schema-isolated | ✅ | `auth_svc`, `core_svc` |
| Drizzle ORM (postgres.js) + migrations | ✅ | reads via `db.query` relations; aggregates via `$count`/`max` |
| Shared `@wriven/contracts` (DTOs, types, patterns, errors) | ✅ | consumed by all NestJS services |
| Docker Compose / VPS deploy | 🔲 | not started |
| CI | 🔲 | not started |

## api-gateway (HTTP `:5000`)

| Item | Status | Notes |
|------|--------|-------|
| Public HTTP edge → TCP to services | ✅ | |
| Response envelope (interceptor + exception filter) | ✅ | `{success,data}` / `{success,error}` |
| `JwtAuthGuard` (local JWT validation) | ✅ | |
| `WorkspaceGuard` (`X-Workspace-Id` membership) | ✅ | calls `auth.validateWorkspaceMember` |
| Rate limiting (`@nestjs/throttler`) | ✅ | global + per-route |
| CORS (credentials) | ✅ | `CLIENT_ORIGIN` |
| Google OAuth (Passport strategy on gateway) | ✅ | |

## auth-service (TCP `:5001`)

| Item | Status | Notes |
|------|--------|-------|
| Register (single signup transaction, optional `orgName`) | ✅ | user+org+workspace+memberships |
| Login (timing-safe, generic error) | ✅ | rememberMe TTL |
| Refresh (rotation + revoked-reuse theft detection) | ✅ | |
| Logout | ✅ | |
| Forgot / reset password (revoke all sessions) | ✅ | no enumeration; mail via nodemailer |
| Email verification (verify + resend) | ✅ | login not blocked on unverified |
| Google OAuth login + account linking | ✅ | find-by-googleId → link-by-email → signup |
| Session `GET /auth/me` (user+orgs+workspaces) | ✅ | reload restore |
| List orgs / workspaces (`/auth/orgs`, `/auth/workspaces`) | ✅ | |
| **Org member CRUD** (list/add/update/remove, owner-guard) | ✅ | add by email; ≥1 owner |
| **Workspace member CRUD** (list/add/update/remove, admin-guard) | ✅ | ≥1 admin |
| Token cleanup cron | ✅ | prunes expired tokens daily |
| Invitation flow (invite → pending → accept) | 🔲 | members added to existing users only |
| Org/workspace create/rename/delete endpoints | 🔲 | only auto-created on signup so far |

## core-service (TCP `:5002`) — CMS

| Item | Status | Notes |
|------|--------|-------|
| Flexible content model (types + entries + JSONB) | ✅ | headless; user-defined fields |
| Content type CRUD | ✅ | soft delete |
| Entry CRUD (field validation, slug, status, revisions) | ✅ | revision per write |
| Entry publish + pagination + list filters | ✅ | |
| `media_assets` schema | ✅ | R2 keys |
| Media upload (R2 presign/upload endpoints) | 🔲 | schema only |
| ImageKit URL building | 🔲 | |
| Reference field resolution (populate/expand) | 🔲 | stored as ids |
| Unique-field enforcement (`FieldDef.unique`) | 🔲 | declared, not enforced |
| Default content type seeding on signup | 🔲 | |

## ai-service (FastAPI `:8000`)

| Item | Status |
|------|--------|
| Everything (text/image generation, jobs) | 🔲 Not started |

> Schema is AI-ready: a future `ai_generations` table references `content_entries.id`; no re-model needed.

## Frontend (`apps/client`, Next.js 16)

| Item | Status | Notes |
|------|--------|-------|
| Tailwind v4 | ✅ | |
| API client (envelope unwrap, 401→refresh→retry, `X-Workspace-Id`) | ✅ | `src/lib/api.ts` |
| Auth store (Zustand, token in memory) + TanStack Query provider | ✅ | silent session bootstrap |
| Auth pages under `(auth)` route group + shared layout | ✅ | login, register, forgot, reset |
| Login/register wired (rememberMe, orgName, errors) | ✅ | |
| Google button + `/auth/callback` page | ✅ | |
| `RequireAuth` guard + `useAuth`/`useLogout` (building blocks) | ✅ | not yet applied to dashboard |
| Dashboard pages | 🟡 | scaffold UI (WIP), not wired to API |
| Content dashboard wired to `/content/*` | 🔲 | TanStack Query hooks pending |
| Email verification page | 🔲 | API ready |

## Known gaps / next candidates

- Member **invitation** flow (email invite → accept on signup).
- **Media upload** (R2 presign) + ImageKit.
- Org/workspace **management** endpoints (create additional, rename, delete).
- **Content dashboard** wiring (F5) + apply `RequireAuth` to the dashboard layout.
- **ai-service**.
- Deploy (Docker Compose on VPS) + CI.
