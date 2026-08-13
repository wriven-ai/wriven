# Spec: Workspace Metrics

> Priority: P1 · Area: cross (gateway + auth + core + contracts + client) · Status: drafted

## Overview

The tenant dashboard shows **no real workspace-level stats** today. The project
dashboard ([p/[projSlug]/page.tsx](../apps/client/src/app/(dashboard)/w/[wsSlug]/p/[projSlug]/page.tsx))
is entirely hardcoded ("141 entries", "5 Schema", "12,420 API hits", "8.4 MB",
"1.2/5.0 GB bandwidth", "AI tokens"). The real numbers already exist in the DB
and partly in the API (`GET /usage` from specs/14 carries requests + storage),
but nothing aggregates them into a workspace (or project) overview.

This spec adds two read-only aggregate endpoints — `GET /stats/workspace`
and `GET /stats/project` (header-scoped like `GET /usage`) — that return real counts (projects, members,
entries incl. draft/published split, content types, API keys, webhooks, media
count + storage, API requests vs plan limit), plus **forward-compatible but
null** fields for the unmetered dimensions (bandwidth, AI text, AI image). The
frontend consumes them to replace every hardcoded stat card with live data,
themed to the design system (reusing the `components/skeleton/` loading states).

This closes the "buyer comparing Wriven to Contentful/Sanity expects a real
dashboard" gap — a P1 table-stakes expectation. It is **not** the metering work
(that landed in specs/14); it is the read-side aggregation + UI of counts that
already exist. Bandwidth + AI metering stay out of scope (their `used` values
ship as `null` until the metering infra lands).

## Depends on

- **specs/14 — Usage Metering** (`GET /usage`, `core.usage.read`, `usage_buckets`,
  `UsageService.read` composing requests used/limit + storage usedMb/limitMb from
  the media SUM). This spec **reuses** `UsageService.read` for the
  requests/storage/period portion of `WorkspaceStatsView` — no new metering.
- **Plan limits** (`PlanLimits`: `apiRequestsPerMonth`, `storageMb`,
  `assetBandwidthGb`, `aiTextRequestsPerMonth`, `aiImageRequestsPerMonth`) in
  `libs/shared/contracts/src/lib/types/admin.types.ts` — already resolved live
  by `auth.entitlements.resolve` / `CoreEntitlementsService`. Supplies the
  `limit` side of every meter.
- **specs/12/13 — RBAC** (`WorkspaceGuard`, `ProjectGuard`, `useCan`) — the
  stats routes inherit workspace/project membership gating; no new permission.
- The `components/skeleton/` folder + `Skeleton` primitive (added for the billing
  page) — loading states reuse them.

## Tooling context (skills / MCP / plugins)

- **Supabase MCP / direct psql** — used read-only during this draft to confirm
  the countable columns exist: `content_entries.status` (draft|published|
  archived, indexed), `content_entries.deleted_at`, `media_assets.size_bytes` +
  `deleted_at`, `api_keys.revoked_at`, `webhooks`, `workspace_members`,
  `projects`. Confirmed — **no schema change needed**. Migrations are not
  required; counts run over existing indexed columns.
- **Nx MCP** — for `pnpm nx typecheck/build/lint` targets during implementation;
  not used for this draft.
- No external analytics/OLAP tool (ClickHouse, Postgres `pg_stat_statements`,
  etc.) — checked, none wired; v1 uses live Drizzle `$count`/aggregates over
  indexed columns (acceptable for tenant-scale; caching noted as the scale path).
- **Stripe / Prisma / Stripe-Directory MCPs** — not relevant (read-only counts,
  no billing changes).

## Scope

- In scope:
  - **Workspace stats endpoint** — `GET /stats/workspace` →
    `WorkspaceStatsView`: projects, members, entries {total, published,
    draft, archived}, contentTypes, apiKeys (active), webhooks, media {count,
    usedMb, limitMb}, apiRequests {used, limit}, period, plus null-`used`
    forward fields (bandwidthGb, aiText, aiImage). **workspace-member**.
  - **Project stats endpoint** — `GET /stats/project` → `ProjectStatsView`:
    entries {total, published, draft, archived}, contentTypes, apiKeys
    (active, this project), webhooks (this project), media {count, usedMb}.
    **project-member**. (No requests/bandwidth/AI — those are
    workspace-billing-unit, not project-scoped.)
  - **Shared contracts** — `WorkspaceStatsView`, `ProjectStatsView` types; 3 new
    TCP patterns; barrel exports. No new DTOs, error codes, or schema.
  - **Backend fan-out** — gateway merges auth (projects + members) with core
    (everything else) via `Promise.all`, mirroring the admin-metrics merge.
  - **Frontend** — `statsApi` methods + `useWorkspaceStats` / `useProjectStats`
    TanStack Query hooks; a themed stat-card grid on the workspace overview;
    replace every hardcoded number on the project dashboard with real data;
    themed skeletons via `components/skeleton/`.
  - Doc updates (api-reference, conventions, core-service, auth-service,
    frontend, status, market-readiness).
- Out of scope:
  - **Bandwidth metering** — real asset egress lives at R2/Cloudflare, not the
    gateway (deferred in specs/14). `bandwidthGb.usedGb` ships `null`; `limitGb`
    from the plan. Do not fabricate a proxy metric.
  - **AI usage metering** — `ai-service` is a skeleton; AI requests are a plan
    limit but **unmetered** (status.md: "AI limit fields added (unenforced —
    ai-service pending)"). `aiText.used` / `aiImage.used` ship `null`; `limit`
    from the plan. Becomes real when the AI metering spec lands.
  - **Locales-used count** — there is **no locale dimension on entries**
    (localization/i18n is unbuilt — `doc/market-readiness.md` P1). Nothing to
    count; deferred with the i18n feature.
  - **Historical / trend charts** — v1 returns current counts only; time series
    + CSV export is later.
  - **Per-API-key / per-content-type drilldown** — workspace/project totals
    only; per-key analytics is a v2 concern.
  - **Admin (platform-wide) stats** — already exist (`admin-metrics`); not
    touched.
  - **Count caching / materialized views** — v1 runs live `$count`/SUM per
    dashboard load (indexed columns, tenant-scale). Redis / cached rollups is
    the scale path (called out in `doc/market-readiness.md` "Scale hardening").

## API / endpoints

Customer-facing (new, gateway → TCP fan-out). Both follow the **header-based
scoped-read pattern** used by `GET /usage` and the content routes — the
`WorkspaceGuard`/`ProjectGuard` read `X-Workspace-Id`/`X-Project-Id` headers
(not path params), and the handlers use `@CurrentWorkspace()`/`@CurrentProject()`
decorators. No ids in the path (avoids `:workspaceId`/`:projectId` collision and
matches how the client already sends scope on every scoped call):
- `GET /api/v1/stats/workspace` — merged workspace aggregate (auth
  projects/members + core content/media/keys/webhooks/requests/storage) —
  **workspace-member** (`@UseGuards(JwtAuthGuard, WorkspaceGuard)`,
  `@CurrentWorkspace() workspaceId`).
- `GET /api/v1/stats/project` — project-scoped content/media/keys/webhooks
  aggregate (core only) — **project-member**
  (`@UseGuards(JwtAuthGuard, WorkspaceGuard, ProjectGuard)` — `ProjectGuard`
  depends on the workspace cascade, so both guards run;
  `@CurrentWorkspace() workspaceId, @CurrentProject() projectId`).

No changes to existing HTTP endpoints.

## Shared contracts (@wriven/contracts)

New/changed (all in `libs/shared/contracts/src/lib/`):

- **`messages.ts`** — add to the existing pattern blocks (dot-namespaced):
  ```ts
  // WORKSPACE_PATTERNS (auth-service owns tenancy counts)
  STATS: 'auth.workspace.stats',
  // USAGE_PATTERNS (core-service owns content/media/keys/webhooks + usage)
  WORKSPACE_STATS: 'core.usage.workspaceStats',
  PROJECT_STATS: 'core.usage.projectStats',
  ```
- **`types/stats.types.ts`** (new; interface-only, model on
  `types/usage.types.ts`):
  ```ts
  export interface EntryStatusCounts {
    total: number;
    published: number;
    draft: number;
    archived: number;
  }

  export interface WorkspaceStatsView {
    // tenancy (auth-service)
    projects: number;
    members: number;
    // content + assets (core-service)
    entries: EntryStatusCounts;
    contentTypes: number;        // active (not soft-deleted)
    apiKeys: number;             // active (not revoked)
    webhooks: number;
    media: { count: number; usedMb: number; limitMb: number | null };
    // metered usage (core; reuse UsageService.read)
    apiRequests: { used: number; limit: number | null };
    period: { start: string; end: string }; // current calendar month (UTC)
    // forward-compatible — unmetered today; `used` null until metering lands
    bandwidthGb: { usedGb: number | null; limitGb: number | null };
    aiText: { used: number | null; limit: number | null };
    aiImage: { used: number | null; limit: number | null };
  }

  export interface ProjectStatsView {
    entries: EntryStatusCounts;
    contentTypes: number;
    apiKeys: number;             // active, this project
    webhooks: number;            // this project
    media: { count: number; usedMb: number };
    // no requests/bandwidth/AI — workspace-billing-unit, not project-scoped
  }
  ```
- **`errors.ts`** — no new code. Reuse `FORBIDDEN` (non-member), `NOT_FOUND`,
  `INTERNAL_ERROR`.
- **`src/index.ts`** (barrel) — add:
  ```ts
  export * from './lib/types/stats.types';
  ```
- No new DTOs (ids arrive via path params + guard-injected identity).

## Database / schema

**No schema changes.** Every count runs over existing indexed columns:
- `auth_svc.projects` (by `workspace_id`), `auth_svc.workspace_members` (by
  `workspace_id`).
- `core_svc.content_entries` (`workspace_id` / `project_id` + `status` index +
  `deleted_at`), `core_svc.content_types` (`project_id` + `deleted_at`),
  `core_svc.api_keys` (`workspace_id` / `project_id` index + `revoked_at`),
  `core_svc.webhooks` (`workspace_id` / `project_id`), `core_svc.media_assets`
  (`workspace_id` / `project_id` index + `size_bytes` + `deleted_at`),
  `core_svc.usage_buckets` (`workspace_id` + period — already used by
  `UsageService.read`).

No `pnpm db:*` migration. (`locales` is intentionally absent — no source column;
see Out of scope.)

## Backend changes

### api-gateway
- **Create:**
  - `apps/api-gateway/src/stats/stats.controller.ts` —
    `@Controller('stats')`, header-based scoped reads (mirror
    `GET /usage` + the content controller). DI:
    `@Inject(SERVICE_TOKENS.AUTH_SERVICE)` + `@Inject(SERVICE_TOKENS.CORE_SERVICE)`.
    - `GET /workspace` — `@UseGuards(JwtAuthGuard, WorkspaceGuard)`,
      **workspace-member**, `@CurrentWorkspace() workspaceId`:
      `Promise.all([ auth.send(WORKSPACE_PATTERNS.STATS, {userId, workspaceId}),
      core.send(USAGE_PATTERNS.WORKSPACE_STATS, {workspaceId}) ])` → merge
      (auth → `projects`/`members`, core → rest) → `WorkspaceStatsView`.
    - `GET /project` — `@UseGuards(JwtAuthGuard, WorkspaceGuard, ProjectGuard)`,
      **project-member**, `@CurrentWorkspace() workspaceId,
      @CurrentProject() projectId`:
      `core.send(USAGE_PATTERNS.PROJECT_STATS, {workspaceId, projectId})` →
      `ProjectStatsView` (core-only, no auth fan-out).
  - `apps/api-gateway/src/stats/stats.module.ts` — registers the controller
    with the existing `AUTH_SERVICE` + `CORE_SERVICE` TCP client tokens.
- **Modify:**
  - `apps/api-gateway/src/app/app.module.ts` — import `StatsModule`.

### core-service
- **Create:** none (extends the existing usage module).
- **Modify:**
  - `apps/core-service/src/usage/usage.service.ts` — add two methods
    (reusing the existing `read()` + `currentPeriod()` + storage SUM helper):
    - `workspaceStats(workspaceId)` — calls `this.read(workspaceId)` for
      `{ requests, storage, period }`, then counts (Drizzle `$count` /
      filtered queries, all `deletedAt IS NULL`):
      `contentEntries` by `workspaceId` grouped by `status` →
      `EntryStatusCounts`; `contentTypes`; `apiKeys` (`revokedAt IS NULL`);
      `webhooks`; `mediaAssets` count + `SUM(size_bytes)` → MB. Reads the
      effective plan limits via the injected `CoreEntitlementsService` for
      `storage.limitMb`, `apiRequests.limit`, `bandwidthGb.limitGb`,
      `aiText.limit`, `aiImage.limit`. Returns `WorkspaceStatsView` with
      `bandwidthGb.usedGb`/`aiText.used`/`aiImage.used` = `null` (unmetered).
    - `projectStats(projectId)` — same counts scoped by `projectId`
      (`media.usedMb` only — no plan limit on the project view). Returns
      `ProjectStatsView`.
  - `apps/core-service/src/usage/usage.controller.ts` — add two
    `@MessagePattern`s: `USAGE_PATTERNS.WORKSPACE_STATS` and
    `USAGE_PATTERNS.PROJECT_STATS`, delegating to the service.

### auth-service
- **Create:** none mandatory (a small stats handler).
- **Modify:**
  - `apps/auth-service/src/auth/workspaces.controller.ts` /
    `workspaces.service.ts` — add a
    `@MessagePattern(WORKSPACE_PATTERNS.STATS)` handler returning
    `{ projects, members }` via `$count` over `projects` + `workspace_members`
    by `workspace_id`.

### ai-service
- No changes (out of scope — AI `used` ships `null`).

## Frontend changes (apps/client)

- **Create:**
  - `src/components/skeleton/workspace-stats-skeleton.tsx` + a project variant
    (themed, reusing the `Skeleton` primitive + card shell; mirrors the billing
    skeleton).
  - A `WorkspaceStatsGrid` component (themed stat cards) — or fold the cards
    into the existing `components/workspace/projects-overview.tsx`.
  - `useWorkspaceStats` + `useProjectStats` TanStack Query hooks (60s
    `staleTime` — counts move slowly), and `statsApi` methods in `src/lib/api.ts`:
    `workspaceStats()` → `GET /stats/workspace` (`{ workspace: true }`);
    `projectStats()` → `GET /stats/project` (`{ workspace: true, project: true }`).
- **Modify:**
  - `src/app/(dashboard)/w/[wsSlug]/page.tsx` (+ `projects-overview.tsx`) —
    render the real `WorkspaceStatsGrid` (projects, members, entries,
    content types, API keys, webhooks, media, API requests vs limit). Show
    bandwidth/AI cards as "not yet reported" (null `used`).
  - `src/app/(dashboard)/w/[wsSlug]/p/[projSlug]/page.tsx` — **replace every
    hardcoded number** (lines ~29–38: "141", "5 Schema", "12,420", "8.4 MB",
    plus the fake "CDN Bandwidth" + "AI tokens" meters) with real
    `ProjectStatsView` data. Remove the fabricated meters that have no
    project-scoped source (bandwidth/AI) or relabel them as workspace-level.
- RBAC: read-only, visible to any workspace/project member. No `useCan` gate
  beyond the existing member guard.

## Files to create
- `libs/shared/contracts/src/lib/types/stats.types.ts`
- `apps/api-gateway/src/stats/stats.controller.ts`
- `apps/api-gateway/src/stats/stats.module.ts`
- Frontend: `statsApi` (in `src/lib/api.ts`), `useWorkspaceStats` /
  `useProjectStats` hooks, `WorkspaceStatsGrid` component,
  `components/skeleton/workspace-stats-skeleton.tsx` (+ project variant).

## Files to modify
- `libs/shared/contracts/src/lib/messages.ts` (`WORKSPACE_PATTERNS.STATS`,
  `USAGE_PATTERNS.WORKSPACE_STATS`, `USAGE_PATTERNS.PROJECT_STATS`)
- `libs/shared/contracts/src/index.ts` (barrel: `stats.types`)
- `apps/api-gateway/src/app/app.module.ts` (import `StatsModule`)
- `apps/core-service/src/usage/usage.service.ts` (`workspaceStats` +
  `projectStats`)
- `apps/core-service/src/usage/usage.controller.ts` (two new `@MessagePattern`s)
- `apps/auth-service/src/auth/workspaces.controller.ts` /
  `workspaces.service.ts` (`WORKSPACE_PATTERNS.STATS` handler)
- `apps/client/src/lib/api.ts` + `src/app/(dashboard)/w/[wsSlug]/page.tsx` +
  `components/workspace/projects-overview.tsx` +
  `src/app/(dashboard)/w/[wsSlug]/p/[projSlug]/page.tsx` (frontend — **separate
  commit**)
- `doc/api-reference.md` (add the two `/stats` routes)
- `doc/conventions.md` (note the new patterns)
- `doc/core-service/core-service.md` + `doc/auth-service/auth-service.md` (new
  stats handlers)
- `doc/frontend/frontend.md` (stats hooks/components)
- `doc/status.md` + `doc/market-readiness.md` (mark workspace metrics done)

## New dependencies

None. Reuses `@nestjs/microservices` (gateway TCP clients), Drizzle `$count`,
existing `CoreEntitlementsService`, and existing frontend primitives. No npm/pip
packages.

## Rules for implementation

Base (always include):
- Define shared DTOs/types/patterns/errors in `libs/shared/contracts`
  (`@wriven/contracts`) — check it before creating new ones.
- Store only R2 object **keys** in the DB; reconstruct URLs at runtime.
- Respect microservice boundaries — do not collapse auth/core/ai logic.
  Tenancy counts (projects/members) live in `auth_svc`; content/media/keys/
  webhooks/usage live in `core_svc`. The gateway merges.
- Endpoints return the response envelope; use error codes from
  `@wriven/contracts/errors.ts`; never leak stack traces, internal service
  names, or DB errors.
- Use dot-namespaced patterns from `@wriven/contracts/messages.ts`, never
  hardcoded strings.
- The gateway injects identity (`userId`, scope) into TCP payloads; downstream
  services trust it.
- Frontend (`apps/client`) and backend changes go in **separate commits**;
  stage selectively, never `git add -A` across both.
- Run tasks through `pnpm nx <target> <project>`. Commits are one-line
  Conventional Commits with no body. No AI co-author trailer.

Feature-specific:
- **Count what's real; never fabricate.** Bandwidth / AI-text / AI-image `used`
  must be `null` (not 0, not a proxy) until their metering lands. The UI shows
  "not yet reported" for null `used`. Never derive bandwidth from JSON bytes or
  AI from a placeholder.
- **Exclude soft-deleted + revoked.** `content_entries.deleted_at IS NULL`,
  `content_types.deleted_at IS NULL`, `media_assets.deleted_at IS NULL`,
  `api_keys.revoked_at IS NULL`. The counts must match what the list UI shows.
- **Reuse `UsageService.read`.** Don't recompute requests/storage/period —
  `workspaceStats` composes `read()` + counts. Single source of truth.
- **Limits come from the plan, not hardcoded.** `storage.limitMb`,
  `apiRequests.limit`, `bandwidthGb.limitGb`, `aiText.limit`, `aiImage.limit`
  all resolve via `CoreEntitlementsService` (cached `auth.entitlements`), so
  they track the active subscription automatically.
- **`EntryStatusCounts` must reconcile.** `total === published + draft +
  archived` (all non-deleted). Compute `total` as the count of non-deleted
  rows, not as a sum of the three, to avoid drift — then assert/derive the
  split.
- **Fail open on entitlements.** If `auth.entitlements` is unreachable, ship
  `limit: null` (unlimited) rather than throwing — stats are informational;
  a limits outage must not break the dashboard. Mirror the `UsageService`
  fail-open contract.
- **Project stats are core-only.** Do not fan to auth; projects/members are
  workspace-level, not project-level. The project dashboard shows content/
  media/key/webhook stats only.
- **Themed skeletons, not spinners.** Loading states reuse the
  `components/skeleton/` primitives, matching the card silhouette (same as the
  billing-page skeletons).

## Definition of done

- [ ] `pnpm nx typecheck shared-contracts` passes; `WorkspaceStatsView`,
      `ProjectStatsView`, `EntryStatusCounts` exported from the barrel; the 3
      new patterns present in `messages.ts`.
- [ ] No migration generated/required (`pnpm db:core:generate` and
      `pnpm db:auth:generate` produce **no** diff — confirms schema-only-over-
      existing-columns).
- [ ] `pnpm nx build api-gateway` + `pnpm nx build core-service` +
      `pnpm nx build auth-service` pass; `pnpm nx lint` + `pnpm nx typecheck`
      clean on all three.
- [ ] `GET /api/v1/stats/workspace` (with `X-Workspace-Id`, as a workspace
      member) returns `WorkspaceStatsView` where `projects`/`members` match
      `auth_svc` counts, `entries.total === published+draft+archived`,
      `media.usedMb` matches the `media_assets` SUM, `apiRequests.used` matches
      `GET /usage`, and `bandwidthGb.usedGb` / `aiText.used` / `aiImage.used`
      are `null`.
- [ ] `GET /api/v1/stats/project` (with `X-Workspace-Id` + `X-Project-Id`, as
      a project member) returns `ProjectStatsView` scoped to that project
      (verify a second project's entries don't bleed in).
- [ ] Non-members get `FORBIDDEN` on both routes; a missing workspace/project
      gets `NOT_FOUND`.
- [ ] Frontend workspace overview renders the real stat grid (no hardcoded
      numbers); the project dashboard's hardcoded "141 / 5 / 12,420 / 8.4 MB"
      block is replaced by live `ProjectStatsView` data; bandwidth/AI show
      "not yet reported" (separate commit).
- [ ] Themed skeletons render while the stats queries load (no layout shift).
- [ ] `doc/api-reference.md`, `doc/conventions.md`, `doc/core-service/`,
      `doc/auth-service/`, `doc/frontend/`, `doc/status.md`,
      `doc/market-readiness.md` updated (doc-maintenance rule).

## Open questions / decisions deferred (resolve in plan mode)

1. **Workspace stats card home** — a dedicated stats section on the workspace
   overview page (chosen) vs folding into the existing Usage page. Default:
   workspace overview, with the usage meters (requests/storage) also still on
   the Usage page.
2. **Project dashboard meters** — remove the fabricated "CDN Bandwidth" +
   "AI tokens" meters entirely (chosen — no project-scoped source) vs relabel
   them as workspace-level. Default: remove; show only real project stats.
3. **Count caching** — live `$count` per load (chosen, tenant-scale) vs a
   short-TTL in-memory/cache-manager rollup. Default: live; revisit under the
   "Scale hardening" P2 item if dashboards get slow.
4. **`EntryStatusCounts.archived`** — include archived in the split (chosen,
   matches the `status` enum) vs hide archived from the dashboard. Default:
   include; UI can deemphasize.
