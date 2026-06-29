# 08 — Current Scope & Status

What is actually implemented today, per module. Legend: ✅ done · 🟡 partial · 🔲 not started.

_Last reviewed: after Model A delivery MVP (API keys + Content Delivery API, doc/11 Phases 0–4)._

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
| `ProjectGuard` (`X-Project-Id` membership + workspace-admin bypass) | ✅ | calls `auth.validateProjectMember` |
| `ApiKeyGuard` (`Bearer wrk_…` → project scope, TTL cache) | ✅ | public Delivery API auth (doc/11 P2) |
| Rate limiting (`@nestjs/throttler`) | ✅ | global + per-route |
| CORS (credentials) | ✅ | `CLIENT_ORIGIN` |
| Google OAuth (Passport strategy on gateway) | ✅ | |

## auth-service (TCP `:5001`)

| Item | Status | Notes |
|------|--------|-------|
| Register (single signup transaction, optional `workspaceName`) | ✅ | user+workspace+project+memberships |
| Login (timing-safe, generic error) | ✅ | rememberMe TTL |
| Refresh (rotation + revoked-reuse theft detection) | ✅ | |
| Logout | ✅ | |
| Forgot / reset password (revoke all sessions) | ✅ | no enumeration; mail via nodemailer |
| Email verification (verify + resend) | ✅ | login not blocked on unverified |
| Google OAuth login + account linking | ✅ | find-by-googleId → link-by-email → signup |
| Session `GET /auth/me` (user+workspaces+projects) | ✅ | reload restore |
| List workspaces (`/auth/workspaces`) | ✅ | |
| **Workspace CRUD** (create/get/update/delete, owner-guard) | ✅ | delete cascades projects+members |
| **Workspace member CRUD** (list/add/update/remove, owner-guard) | ✅ | add by email; ≥1 owner |
| **Project CRUD** (create/get/update/delete, admin-guard) | ✅ | create seeds creator as project admin |
| **Project member CRUD** (list/add/update/remove, admin-guard) | ✅ | ≥1 admin |
| Token cleanup cron | ✅ | prunes expired tokens daily |
| Invitation flow (invite → pending → accept) | 🔲 | members added to existing users only |

## core-service (TCP `:5002`) — CMS

| Item | Status | Notes |
|------|--------|-------|
| Flexible content model (types + entries + JSONB) | ✅ | headless; user-defined fields |
| Project-scoped content (content types/entries/media by `project_id`) | ✅ | `workspace_id` retained as denormalized scoping |
| Content type CRUD | ✅ | soft delete |
| Entry CRUD (field validation, slug, status, revisions) | ✅ | revision per write |
| Entry publish + pagination + list filters | ✅ | |
| **API keys** (project-scoped, hash-only, scope read/preview/manage) | ✅ | `api_keys` table; create/list/revoke/resolve (doc/11 P1) |
| **Content Delivery API** (published-only read by `apiId`/slug) | ✅ | select/filter/sort/paginate/include (doc/11 P3) |
| `media_assets` schema | ✅ | R2 keys |
| **Media upload** (presigned direct-to-R2 + create/list/delete) | ✅ | storage adapter; keys-only (doc/13) |
| **Media delivery** (resolve `media` fields → public URL objects) | ✅ | always-resolved in Delivery API |
| **Inline body images** (TipTap `image` node, assetId-only) | ✅ | delivery hydrates `src`/dims; keys-only (doc/13) |
| Per-workspace media quota (100 MB) + per-file caps (5/25 MB) | ✅ | enforced at presign (doc/13) |
| Image transforms (resize/format) | 🔲 | deferred; consumer optimizes (next/image). Adapter-ready (doc/13) |
| Reference field resolution (populate/expand) | 🟡 | expanded in delivery `include`; not in management reads |
| **CDN cache headers + purge on publish** | ✅ | published reads `s-maxage`+`Cache-Tag`/`Surrogate-Key`; Cloudflare tag-purge on entry events, no-op if unconfigured (doc/11 P5) |
| **Webhooks** (publish/unpublish/delete → signed POST, HMAC, retry) | ✅ | `webhooks` table; dispatcher on entry events (doc/11 P6) |
| **Preview API** (drafts via `wrk_preview_`/`wrk_admin_`) | ✅ | key scope drives `preview`→drafts; preview reads `no-store` (doc/11 P7) |
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
| API client (envelope unwrap, 401→refresh→retry, `X-Workspace-Id` + `X-Project-Id`) | ✅ | `src/lib/api.ts` |
| Auth store (Zustand, token in memory) + TanStack Query provider | ✅ | silent session bootstrap; tracks `currentProjectId` |
| Auth pages under `(auth)` route group + shared layout | ✅ | login, register, forgot, reset |
| Login/register wired (rememberMe, workspaceName, errors) | ✅ | |
| Google button + `/auth/callback` page | ✅ | |
| `RequireAuth` guard + `useAuth`/`useLogout` | ✅ | applied to the dashboard layout (redirects to /login when unauthenticated) |
| Dashboard layout: live user data + workspace/project switchers | ✅ | |
| Projects page wired to `/workspaces/:id/projects` + `/projects/*` | ✅ | TanStack Query |
| Content dashboard wired to `/content/*` | 🟡 | type/entry pages live; switchers drive `X-Project-Id` |
| API Keys page (create/list/revoke, one-time token reveal) | ✅ | `apiKeyApi`; real backend (doc/11 P4) |
| Media Library page + media field picker (upload/select) | ✅ | `mediaApi` + `uploadMedia`; grid/list/lightbox (doc/13) |
| Content editor: main+sidebar layout + inline body images | ✅ | title/body main, structured fields sidebar (doc/13) |
| Member invitations (workspace + project, accept page) | ✅ | pending list, accept-on-signup, guest role (doc/12) |
| Webhooks UI (project settings: add/list/pause/delete, secret once) | ✅ | `webhookApi`; HMAC verify documented inline |
| Email verification page | 🔲 | API ready |

## Known gaps / next candidates

- **Reference field picker** in the editor (delivery resolves refs; authoring can't pick yet).
- Consumer **SDK / npm package** + published Delivery API docs.
- **Unique-field enforcement**; default content-type seeding on signup.
- **ai-service**.
- Deploy (Docker Compose on VPS) + CI.
