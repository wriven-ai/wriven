# Plan: Workspace Metrics

> Status: drafted · Executes: spec 17 (`specs/17-workspace-metrics.md`) · Supersedes: -

## Goal
Ship two real, read-only aggregate endpoints (`GET /stats/workspace`,
`GET /stats/project`, header-scoped like `GET /usage`) + a themed dashboard UI,
replacing every hardcoded stat on the workspace overview and project dashboard
with live counts — with unmetered dimensions (bandwidth, AI text/image) present
as `null`.

## Current state
Already shipped (do not redo):
- **specs/14 usage module** — `core_svc.usage_buckets`, `UsageService.read` +
  `storageSum` (private) + exported `currentPeriod()`, `GET /usage`,
  `core.usage.record` / `core.usage.read` patterns. This plan **reuses**
  `UsageService.read` for the requests/storage/period slice.
- **`CoreEntitlementsService.effectiveLimits(workspaceId): PlanLimits | null`**
  ([core-entitlements.service.ts:128](../apps/core-service/src/entitlements/core-entitlements.service.ts#L128)) —
  resolves every plan limit (`apiRequestsPerMonth`, `storageMb`,
  `assetBandwidthGb`, `aiTextRequestsPerMonth`, `aiImageRequestsPerMonth`).
- **Gateway auth+core merge pattern** —
  [admin-metrics.controller.ts](../apps/api-gateway/src/admin/admin-metrics.controller.ts)
  (`@Inject(SERVICE_TOKENS.AUTH_SERVICE/CORE_SERVICE)` +
  `Promise.all([firstValueFrom(this.auth.send), firstValueFrom(this.core.send)])`).
- **Guards** — `JwtAuthGuard`, `WorkspaceGuard`, `ProjectGuard` (membership
  gating already injects `userId` + scope into TCP payloads).
- **Contracts** — `WORKSPACE_PATTERNS` ([messages.ts:28](../libs/shared/contracts/src/lib/messages.ts#L28)),
  `USAGE_PATTERNS` ([messages.ts:140](../libs/shared/contracts/src/lib/messages.ts#L140)),
  `SERVICE_TOKENS` ([messages.ts:209](../libs/shared/contracts/src/lib/messages.ts#L209)).
- **Auth tenancy** — `workspaces.controller.ts` owns `WORKSPACE_PATTERNS.*`
  handlers; `workspace_members` + `projects` tables countable by `workspace_id`.
- **Frontend** — `usageApi` ([api.ts:716](../apps/client/src/lib/api.ts#L716)),
  `useUsage` hook shape, `components/skeleton/` primitives + `Skeleton`, the
  `projects-overview.tsx` component, the hardcoded project dashboard
  ([p/[projSlug]/page.tsx:29-38](../apps/client/src/app/(dashboard)/w/[wsSlug]/p/[projSlug]/page.tsx#L29)).
- **No schema change** — every count runs over existing indexed columns
  (`status`, `deleted_at`, `revoked_at`, `size_bytes`).

## Phases

### Phase 1 — Shared contracts
- **Why here** — first; every service imports these. Unblocks Phases 2–4.
- **Files — create:** `libs/shared/contracts/src/lib/types/stats.types.ts`
  (`EntryStatusCounts`, `WorkspaceStatsView`, `ProjectStatsView` — exact shapes
  in spec §"Shared contracts").
- **Files — modify:**
  - `libs/shared/contracts/src/lib/messages.ts` — add `STATS: 'auth.workspace.stats'`
    to `WORKSPACE_PATTERNS`; add `WORKSPACE_STATS: 'core.usage.workspaceStats'` +
    `PROJECT_STATS: 'core.usage.projectStats'` to `USAGE_PATTERNS`.
  - `libs/shared/contracts/src/index.ts` — barrel: `export * from './lib/types/stats.types'`.
- **Shared contracts:** the types + 3 patterns above. No new DTOs/errors.
- **Verify:** `pnpm nx typecheck shared-contracts` passes; the 3 patterns +
  3 types are exported (`node -e` or grep the barrel).

### Phase 2 — core-service stats
- **Why here** — depends on Phase 1 types. Owns 11 of the 13 metrics (all
  content/media/key/webhook/usage counts).
- **Files — modify:**
  - `apps/core-service/src/usage/usage.service.ts` — add:
    - `workspaceStats({ workspaceId }): Promise<WorkspaceStatsView>` — calls
      existing `this.read({workspaceId})` for `{ requests, storage, period }`
      + `this.entitlements.effectiveLimits(workspaceId)` for limits, then
      counts (all `deletedAt IS NULL`, `api_keys.revoked_at IS NULL`):
      entries grouped by `status` → `EntryStatusCounts` (compute `total` as
      non-deleted count, then split); `contentTypes`; `apiKeys`; `webhooks`;
      `mediaAssets` count + `SUM(size_bytes)`→MB. `bandwidthGb.usedGb`,
      `aiText.used`, `aiImage.used` = `null`; their `limit` from
      `effectiveLimits`. Fail-open: if `effectiveLimits` is null, ship
      `limit: null`.
    - `projectStats({ projectId }): Promise<ProjectStatsView>` — same counts
      scoped by `projectId` (`media` = count + MB, no limit).
    - private `countEntriesByStatus(scope: {workspaceId}|{projectId})` helper
      (one query, grouped by `status`).
  - `apps/core-service/src/usage/usage.controller.ts` — add
    `@MessagePattern(USAGE_PATTERNS.WORKSPACE_STATS)` and
    `@MessagePattern(USAGE_PATTERNS.PROJECT_STATS)`, delegating to the service.
- **Shared contracts:** consumes `WorkspaceStatsView`, `ProjectStatsView`,
  `EntryStatusCounts`.
- **Verify:** `pnpm nx typecheck core-service` + `pnpm nx build core-service`
  pass. (Functional check happens via the gateway curl in Phase 4 — core is TCP
  only, no direct HTTP.)

### Phase 3 — auth-service tenancy counts
- **Why here** — depends on Phase 1. Supplies the 2 auth-owned metrics
  (projects, members) consumed by the gateway merge.
- **Files — modify:**
  - `apps/auth-service/src/auth/workspaces.controller.ts` — add
    `@MessagePattern(WORKSPACE_PATTERNS.STATS)` handler returning
    `{ projects, members }` via Drizzle `$count(projects, {workspaceId})` +
    `$count(workspaceMembers, {workspaceId})`. (Inline or via a small
    `workspaceStats()` on the existing `WorkspacesService` — keep it with the
    other workspace handlers.)
- **Shared contracts:** consumes `WORKSPACE_PATTERNS.STATS`.
- **Verify:** `pnpm nx typecheck auth-service` + `pnpm nx build auth-service`
  pass.

### Phase 4 — api-gateway endpoints + merge
- **Why here** — depends on Phases 1–3 (the two TCP handlers). The fan-out +
  HTTP surface; first runnable end-to-end check.
- **Files — create:**
  - `apps/api-gateway/src/stats/stats.controller.ts` — `@Controller('stats')`,
    **header-based scoped reads** (mirror `GET /usage` + the content
    controller; the guards read `X-Workspace-Id`/`X-Project-Id` headers and
    handlers use `@CurrentWorkspace()`/`@CurrentProject()` — **no ids in the
    path**). DI: `@Inject(SERVICE_TOKENS.AUTH_SERVICE)` +
    `@Inject(SERVICE_TOKENS.CORE_SERVICE)`.
    - `GET /workspace` — `@UseGuards(JwtAuthGuard, WorkspaceGuard)`,
      **workspace-member**, `@CurrentWorkspace() workspaceId`; `Promise.all`
      over `auth.send(WORKSPACE_PATTERNS.STATS, {userId, workspaceId})` +
      `core.send(USAGE_PATTERNS.WORKSPACE_STATS, {workspaceId})`; merge
      (auth → `projects`/`members`, core → rest) → `WorkspaceStatsView`.
    - `GET /project` — `@UseGuards(JwtAuthGuard, WorkspaceGuard, ProjectGuard)`
      (`ProjectGuard` needs the workspace cascade, so both run),
      **project-member**, `@CurrentWorkspace() workspaceId,
      @CurrentProject() projectId`; `core.send(USAGE_PATTERNS.PROJECT_STATS,
      {workspaceId, projectId})` → `ProjectStatsView`.
  - `apps/api-gateway/src/stats/stats.module.ts` — registers the controller.
- **Files — modify:** `apps/api-gateway/src/app/app.module.ts` — import
  `StatsModule`.
- **Shared contracts:** consumes all Phase-1 types + patterns.
- **Verify:** `pnpm nx typecheck api-gateway` + `pnpm nx build api-gateway`
  pass. Then a live smoke (services running): `curl GET /stats/workspace`
  (cookie + `X-Workspace-Id`) and `GET /stats/project` (+ `X-Project-Id`) →
  confirm `projects`/`members` match DB, `entries.total === published+draft+
  archived`, `media.usedMb` matches the `media_assets` SUM, `apiRequests.used
  === GET /usage`, and `bandwidthGb.usedGb`/`aiText.used`/`aiImage.used` are
  `null`; non-member → `FORBIDDEN`.

### Phase 5 — Frontend (separate commit)
- **Why here** — depends on Phase 4 endpoints existing. Backend commit lands
  first; frontend is its own commit per the separate-commit rule.
- **Files — create:**
  - `apps/client/src/components/skeleton/workspace-stats-skeleton.tsx` (+ a
    `ProjectStatsSkeleton` export in the same file) — themed, reusing the
    `Skeleton` primitive + card shell (mirror `billing-skeleton.tsx`).
  - `apps/client/src/components/workspace/workspace-stats-grid.tsx` — themed
    stat cards consuming `WorkspaceStatsView` (projects, members, entries split,
    content types, API keys, webhooks, media count + storage, API requests vs
    limit); bandwidth/AI cards render "Not yet reported" for null `used`.
  - `apps/client/src/hooks/use-workspace-stats.ts` + `use-project-stats.ts` —
    TanStack Query, `staleTime: 60_000`, keyed by workspace/project id.
- **Files — modify:**
  - `apps/client/src/lib/api.ts` — add `statsApi { workspaceStats(), projectStats() }`
    (mirror `usageApi` at line 716; `workspaceStats` → `GET /stats/workspace`
    with `{ workspace: true }`; `projectStats` → `GET /stats/project` with
    `{ workspace: true, project: true }`).
  - `apps/client/src/components/workspace/projects-overview.tsx` — render
    `<WorkspaceStatsGrid />` (with the skeleton as the query's loading state)
    above/beside the projects grid.
  - `apps/client/src/app/(dashboard)/w/[wsSlug]/p/[projSlug]/page.tsx` —
    **replace the hardcoded `stats` + `meters` arrays (lines ~29–39)** with real
    `ProjectStatsView` data; remove the fabricated "CDN Bandwidth" + "AI tokens"
    meters (no project-scoped source — open Q #2; default: remove). Loading →
    `ProjectStatsSkeleton`.
- **Verify:** `pnpm nx typecheck client` passes. Manual UI: workspace overview
  shows the real stat grid (numbers match DB); project dashboard shows live
  entries/content-types/media/API-keys/webhooks; skeletons render with no layout
  shift while loading.

### Phase 6 — Docs
- **Why here** — last; reflects what shipped. (Doc-maintenance rule.)
- **Files — modify:** `doc/api-reference.md` (two `/stats` routes),
  `doc/conventions.md` (new patterns), `doc/core-service/core-service.md` +
  `doc/auth-service/auth-service.md` (stats handlers), `doc/frontend/frontend.md`
  (stats hooks/components), `doc/status.md` + `doc/market-readiness.md` (mark
  workspace metrics done).
- **Verify:** no broken doc links; `grep` confirms both routes documented.

## Risks / open questions
1. **Count cost on every dashboard load.** Live `$count`/SUM over indexed
   columns is fine at tenant scale but unbounded for huge workspaces. v1
   accepts it (spec Out of scope); cache rollup is the P2 scale path. Watch
   this if a workspace has tens of thousands of entries.
2. **`EntryStatusCounts` drift.** Compute `total` as the non-deleted count and
   derive the split from the same grouped query — do not sum `published+draft+
   archived` separately (a future status value would silently break the sum).
3. **Project-dashboard meter removal (spec open Q #2).** Default here = remove
   the fake bandwidth/AI meters. Confirm before Phase 5 if you'd rather relabel
   them workspace-level.
4. **Stats card home (spec open Q #1).** Default = workspace overview. If you
   want them on the Usage page too, that's a trivial add in Phase 5.
5. **Stale auth-service process.** Earlier this session the running
   auth-service served stale code after a file edit. After Phase 3, hard-restart
   `pnpm dev:auth` (or `dev:all`) before the Phase 4 smoke test so the new
   handler is live.

## Out of scope
- Bandwidth metering (R2/CDN egress) — `bandwidthGb.usedGb` stays `null`.
- AI text/image metering (`ai-service` skeleton) — `aiText.used`/`aiImage.used`
  stay `null`.
- Locales-used count (no locale column on entries — depends on the unbuilt i18n
  feature).
- Historical/trend charts, CSV export, per-key drilldown.
- Admin (platform-wide) metrics (already shipped).
- Count caching / materialized views / Redis rollups.

## Definition of done
- [ ] Phase 1: `pnpm nx typecheck shared-contracts` green; `stats.types` +
      3 patterns exported. (No migration — `pnpm db:core:generate` /
      `db:auth:generate` produce no diff.)
- [ ] Phases 2–4: `pnpm nx build` + `pnpm nx typecheck` green on core-service,
      auth-service, api-gateway; `pnpm nx lint` clean.
- [ ] Phase 4 curl: `GET /stats/workspace` (cookie + `X-Workspace-Id`) returns
      `WorkspaceStatsView` with DB-matching counts, reconciling
      `entries.total`, `null` unmetered `used` values; `GET /stats/project`
      (+ `X-Project-Id`) scoped correctly; non-member → `FORBIDDEN`.
- [ ] Phase 5: `pnpm nx typecheck client` green; workspace overview + project
      dashboard render real data (no hardcoded numbers); themed skeletons show
      while loading; bandwidth/AI render "Not yet reported". Frontend in its own
      commit.
- [ ] Phase 6: docs updated (api-reference, conventions, core/auth/frontend,
      status, market-readiness), no broken links.
