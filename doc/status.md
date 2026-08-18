Current Scope & Status

What is actually implemented today, per module. Legend: ✅ done · 🟡 partial · 🔲 not started.

_Last reviewed: after the AI generation redesign (specs/21) — typed `AiOutput` (scalar/record), whole-entry `compose`, Generate/Refine author model, per-project AI voice, and token/cost accounting on `/usage`. Image gen still deferred._

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
| `WorkspaceGuard` (`X-Workspace-Id` membership) | ✅ | calls `auth.validateWorkspaceMember`; attaches cascade-resolved `workspacePermissions` |
| `ProjectGuard` (`X-Project-Id` membership) | ✅ | calls `auth.validateProjectMember`; attaches `projectPermissions` (cascade absorbed auth-service-side — no more gateway bypass) |
| `PermissionGuard` (`@RequirePermission`) | ✅ | tenant RBAC edge enforcement; mirrors `AdminRolesGuard`. Content/media/api-keys/webhooks/billing routes gated (specs/12) |
| `ApiKeyGuard` (`Bearer wrk_…` → project scope, TTL cache) | ✅ | public Delivery API auth (plans/01 P2) |
| Rate limiting (`@nestjs/throttler`) | ✅ | global + per-route |
| **Usage metering** (Delivery API counter) | 🟡 | in-process buffer flushes to `core.usage.record`; `GET /usage`; soft overage gate `USAGE_ENFORCE` (default off, fail-open) (specs/14) |
| CORS (credentials) | ✅ | `CLIENT_ORIGIN` |
| Google OAuth (Passport strategy on gateway) | ✅ | |
| Billing + Stripe webhook | ✅ | `/billing/*` (JWT + WorkspaceGuard) + public `POST /webhooks/stripe` (`rawBody: true`, forwards to auth-service) |

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
| **Stripe billing** (Checkout, Billing Portal, direct plan-swap, webhook reconcile) | ✅ | backend done (specs/08); `/billing/swap` upgrades/cycle-switches immediately (prorated) + **defers downgrades to period end** via Subscription Schedules (specs/16, `pendingDowngrade` on the view) + cancel-to-free; live e2e 🟡 deferred to sandbox config |
| **Plans** (free/starter/pro @ $0/$10/$18) | ✅ | realistic catalog + public `GET /plans` + revision-retention cap (specs/15); business tier + `sso` removed; AI text limit fields enforced (specs/19) |
| **RBAC permission layer** (`AuthorizationService`, cascade resolver) | ✅ | `Permission` catalog + role→perm maps in `@wriven/contracts`; `validate*Member` returns cascade-resolved perms; role checks → `authorize()` (specs/12). Frontend `useCan()` filled against the shared cascade; nav + action buttons + management routes gated (specs/13) |
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
| **API keys** (project-scoped, hash-only, scope read/preview/manage) | ✅ | `api_keys` table; create/list/regenerate/revoke/resolve (plans/01 P1) |
| **Content Delivery API** (published-only read by `apiId`/slug) | ✅ | select/filter/sort/paginate/include (plans/01 P3) |
| `media_assets` schema | ✅ | R2 keys |
| **Media upload** (presigned direct-to-R2 + create/list/delete) | ✅ | storage adapter; keys-only (specs/03) |
| **Media delivery** (resolve `media` fields → public URL objects) | ✅ | always-resolved in Delivery API |
| **Inline body images** (TipTap `image` node, assetId-only) | ✅ | delivery hydrates `src`/dims; keys-only (specs/03) |
| Per-workspace media quota (100 MB) + per-file caps (5/25 MB) | ✅ | enforced at presign (specs/03) |
| Image transforms (resize/format) | 🔲 | deferred; consumer optimizes (next/image). Adapter-ready (specs/03) |
| Reference fields (author target type + pick + expand) | ✅ | builder sets `refTypeId`+`multiple`; editor reference picker; delivery `include` expands |
| **CDN cache headers + purge on publish** | ✅ | published reads `s-maxage`+`Cache-Tag`/`Surrogate-Key`; Cloudflare tag-purge on entry events, no-op if unconfigured (plans/01 P5) |
| **Webhooks** (publish/unpublish/delete → signed POST, HMAC, retry) | ✅ | `webhooks` table; dispatcher on entry events (plans/01 P6) |
| **Preview API** (drafts via `wrk_preview_`/`wrk_admin_`) | ✅ | key scope drives `preview`→drafts; preview reads `no-store` (plans/01 P7) |
| **Unique-field enforcement** (`FieldDef.unique`) | ✅ | JSONB value check on create/update; builder has a Unique toggle |
| **Default content type seeding** | ✅ | seeds a `Post` type on project create (idempotent); builder Unique/Multiple toggles |
| **Entry revisions API + UI** (list + restore) | ✅ | History drawer; restore records a new revision |
| **Revision retention** (`revisionsPerEntry`) | ✅ | per-entry cap prunes oldest beyond the plan limit (5/10/15) on every write (specs/15) |
| **Usage metering** (`usage_buckets`) | 🟡 | Delivery API request counter (batched atomic increment) + `core.usage.read` composes `UsageView` (requests + storage SUM + plan limits) (specs/14). Overage gate built but **default-off** (`USAGE_ENFORCE`); live validation pending |

## AI generation — ai-service (FastAPI `:8000`) + core-service metering

AI content generation runs in the standalone Python `ai-service`: prompt building,
temperature, structured-output validation, and the `select`/`compose` repair retry live
there. core-service owns the DB-bound work — quota reserve (advisory lock), the
`ai_generations` audit row, field/Tier-1 validation, per-project voice profile, and
cost accounting — and calls ai-service over HTTP behind an `AiClient` seam
(`AI_SERVICE_URL` + `INTERNAL_SECRET`). Reshaped in specs/21 (supersedes specs/19 + 20).

| Item | Status | Notes |
|------|--------|-------|
| `ai-service` generation endpoint (`POST /generate`) | ✅ | FastAPI; per-operation prompt/temperature/token-cap; `select` + `compose` validate-and-repair-once; `extra="ignore"` for rolling-deploy safety |
| core → ai-service HTTP client (`AiClient` seam) | ✅ | axios; `X-Internal-Secret`; code-allowlist error passthrough (`AI_INPUT_TOO_LARGE` stays actionable) |
| Typed generation (`core.ai.generate`) | ✅ | response is `AiOutput` (`scalar` \| `record`); single-field generate/refine on Tier-1 + whole-entry `compose`; `truncated` surfaced from `finish_reason:'length'` |
| Author model — Generate / Refine (+preset chips) | ✅ | replaced the 7-verb dropdown + tone input; per-operation tuning kept server-side (matters on a free model) |
| Co-Writer panel (apps/client) | ✅ | per-field generate/refine + history + diff + apply modes + undo; **Draft whole entry** with per-field record preview and apply-selected |
| Per-project AI voice | ✅ | brand voice + glossary + language (`ai_profiles`), edited in the content-types page, injected as a fenced `<voice_guide>`; never sent by the client on generate |
| Per-field AI policy + privacy | ✅ | **one** control: `aiPrivate` (sensitive). `aiAssist`/`aiOperations` removed — eligibility is derived (Tier-1 ∧ single-value ∧ not sensitive). Opt-in `aiContextFields` under Advanced |
| Token + cost accounting | ✅ | price resolved from the *returned* model (`*:free → 0`, never a guess); period `AiUsageStats` on `/usage` + `WorkspaceStatsView.aiText` (requests=succeeded; tokens/cost=succeeded+failed; `cost.complete` honesty flag) |
| Plan-limit enforcement | ✅ | hard-enforce `aiTextRequestsPerMonth` (advisory-lock atomic reserve); stale reservations reclaimed; entitlement failure fails closed; gateway 40s timeout backstop |
| Review hardening (specs/22) | ✅ | fixed the snake_case error-wire `usage` (NaN cost on failed rows), added 2xx body validation at the `AiClient` seam, honest retry semantics (`error_code` persisted; `AI_RESULT_EXPIRED` 410 on redacted replay), shared richtext TipTap schema (image fields no longer read empty / deleted on append), single-panel + shared-burst UI state, compose hero/preview/undo + per-field sparkle targeting, gateway env-guard + `GATEWAY_TIMEOUT` in the registry |
| Image generation | 🔲 | later (different model/cost) |
| AI reliability / audit | ✅ | idempotency keys, persisted replay, revision provenance (+ `applied_field_keys` for compose), bounded audit redaction, token/context/output budgets, correlation IDs, readiness and private metrics |

> `ai_generations` meters usage (row-count vs the plan limit), audits each generation
> (typed output, target_kind, tokens, per-model cost, latency), persists an idempotent
> successful output until retention redaction, links explicitly applied drafts to the
> saved revision, and records compose field provenance. A compose is **one** generation
> = one quota unit regardless of how many fields it fills.
> Provider key (`AI_API_KEY`) lives in **ai-service** env only — never gateway/core/frontend.

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
| API Keys page (create/list/revoke, one-time token reveal) | ✅ | `apiKeyApi`; real backend (plans/01 P4) |
| Media Library page + media field picker (upload/select) | ✅ | `mediaApi` + `uploadMedia`; grid/list/lightbox (specs/03) |
| Content editor: main+sidebar layout + inline body images | ✅ | title/body main, structured fields sidebar (specs/03) |
| Member invitations (workspace + project, accept page) | ✅ | pending list, accept-on-signup, guest role (specs/05) |
| Webhooks UI (project settings: add/list/pause/delete, secret once) | ✅ | `webhookApi`; HMAC verify documented inline |
| **Usage page** (requests + storage vs plan limits) | ✅ | `useUsage` → `GET /usage`; replaces the prior mock analytics page (specs/14) |
| **Workspace + project stats** (real aggregate counts) | ✅ | `GET /stats/workspace` + `/stats/project` → themed stat grids; replaces every hardcoded project-dashboard number. Bandwidth `used` null (unmetered); AI text reports requests + tokens + cost (specs/17, specs/21) |
| Email verification page (`/verify-email?token=`) | ✅ | auto-verifies on load; success/error states |
| **RBAC gating** (`useCan()`, `<Can>`, `<RequirePermission>`) | ✅ | nav + action buttons + management routes gated by `Permission` via the shared `effectivePermissions` cascade (specs/13) |

## Known gaps / next candidates

- Consumer **SDK / npm package** + published Delivery API docs.
- **Frontend billing page** — Checkout redirect, Billing Portal link, replace the mock pricing page; consumes `/billing/*`. Unblocks the live Stripe e2e (the hosted Checkout page also needs the sandbox account configured: `pk_test_` publishable key + Managed Payments provisioned/disabled).
- **AI generation** — redesigned and shipped (specs/21): typed `AiOutput`, whole-entry `compose`, Generate/Refine author model, per-project AI voice, token/cost accounting. Remaining: streaming, embeddings/RAG grounding, async job queue (bulk/translate), image generation, token-based plan limits.
- Deploy (Docker Compose on VPS) + CI.
