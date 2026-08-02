# Plan: Usage Metering

> Status: drafted · Executes: spec 14 (`specs/14-usage-metering.md`) · Supersedes: -

## Goal

Count Delivery API requests per workspace per month, expose a `GET /usage`
read API + dashboard widget, and add a soft (default-off) overage gate —
closing the `apiRequestsPerMonth` metering gap (P0, market-readiness #2).

## Current state

Already shipped (do **not** re-plan):
- `PlanLimits` carries `apiRequestsPerMonth` / `assetBandwidthGb` / `storageMb`
  (`libs/shared/contracts/src/lib/types/admin.types.ts`).
- `auth.entitlements.resolve` returns effective limits
  (`apps/auth-service/src/auth/entitlements.service.ts`); core caches them 30s
  fail-open (`apps/core-service/src/entitlements/core-entitlements.service.ts`).
- Per-workspace storage cap already SUMs `media_assets.size_bytes`
  (`apps/core-service/src/media/media.service.ts` ~L69).
- Delivery API + `ApiKeyGuard` resolve `workspaceId`/`projectId` per request
  (`apps/api-gateway/src/delivery/delivery.controller.ts`,
  `apps/api-gateway/src/auth/api-key.guard.ts`).
- core schema style: `coreSchema = pgSchema('core_svc')`, `bigint`/`uniqueIndex`
  imported from `drizzle-orm/pg-core`; model module triple =
  `apps/core-service/src/api-keys/`. Next core migration = `0007`.
- `@nestjs/schedule` is a workspace dep (auth-service uses `@Cron`); **not** in
  the gateway yet.

This plan starts from there.

## Phases

### Phase 1 — Shared contracts

- **Why here** — first; every other phase imports these.
- **Files — create:**
  - `libs/shared/contracts/src/lib/types/usage.types.ts` —
    `UsagePeriod { start: string; end: string }`,
    `UsageView { period: UsagePeriod; requests: { used: number; limit: number | null }; storage: { usedMb: number; limitMb: number | null } }`
    (`null` = unlimited). Interface-only, model on `types/billing.types.ts`.
  - `libs/shared/contracts/src/lib/dto/usage.dto.ts` — `UsageQueryDto { periodStart?: string }`
    (`@IsOptional() @IsISO8601()`), accepted now for surface stability, ignored
    in v1.
- **Files — modify:**
  - `libs/shared/contracts/src/lib/messages.ts` — add `USAGE_PATTERNS`:
    ```ts
    export const USAGE_PATTERNS = {
      RECORD: 'core.usage.record',
      READ: 'core.usage.read',
    } as const;
    ```
  - `libs/shared/contracts/src/index.ts` — barrel-export the two new files.
- **Shared contracts:** the new `USAGE_PATTERNS`, `UsageView`, `UsagePeriod`,
  `UsageQueryDto`. No new error code — reuse `RATE_LIMITED` (429).
- **Verify:** `pnpm nx typecheck shared-contracts` passes; `USAGE_PATTERNS`,
  `UsageView`, `UsageQueryDto` resolvable from `@wriven/contracts`.

### Phase 2 — Schema + migration

- **Why here** — core usage service (Phase 3) writes this table.
- **Files — modify:**
  - `apps/core-service/src/db/schema/index.ts` — add `usageBuckets` table
    (model on `mediaAssets`; no cross-schema FK — same denormalized
    `workspaceId` pattern `content_entries` uses):
    ```ts
    export const usageBuckets = coreSchema.table(
      'usage_buckets',
      {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').notNull(),
        periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
        periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
        requestCount: bigint('request_count', { mode: 'number' }).notNull().default(0),
        updatedAt: timestamp('updated_at', { withTimezone: true })
          .notNull()
          .defaultNow()
          .$onUpdate(() => new Date()),
      },
      (t) => [
        uniqueIndex('usage_buckets_workspace_period_uq').on(t.workspaceId, t.periodStart),
        index('usage_buckets_workspace_idx').on(t.workspaceId),
      ],
    );
    ```
    No relations block needed (direct reads only).
- **Shared contracts:** none.
- **Verify:** `pnpm db:core:generate` produces **only** the `usage_buckets`
  table in a new `0007_*.sql` (no drift on other tables); `pnpm db:core:migrate`
  applies cleanly; row visible in `pnpm db:core:studio`.

### Phase 3 — core-service usage module

- **Why here** — depends on Phase 1 (patterns/types) + Phase 2 (table). The
  gateway (Phase 4) calls this.
- **Files — create:**
  - `apps/core-service/src/usage/usage.module.ts` — providers
    `UsageService`, imports nothing extra (DRIZZLE + CoreEntitlements injected).
  - `apps/core-service/src/usage/usage.controller.ts` — two `@MessagePattern`s:
    - `USAGE_PATTERNS.RECORD` → `service.record(buckets)` (payload:
      `{ buckets: [{ workspaceId, periodStart, periodEnd, requestCount }] }`).
    - `USAGE_PATTERNS.READ` → `service.read({ workspaceId })` → `UsageView`.
  - `apps/core-service/src/usage/usage.service.ts`:
    - `currentPeriod()` — UTC calendar-month boundaries (1st 00:00 → next
      1st 00:00). Pure helper.
    - `record(buckets)` — per-row atomic upsert in a tx:
      ```ts
      await db.insert(usageBuckets)
        .values({ workspaceId, periodStart, periodEnd, requestCount: n })
        .onConflictDoUpdate({
          target: [usageBuckets.workspaceId, usageBuckets.periodStart],
          set: { requestCount: sql`${usageBuckets.requestCount} + ${n}` },
        });
      ```
      (loop the batch; swallow individual errors so one bad bucket doesn't
      drop the rest — log at warn).
    - `read(workspaceId)` — fetch `request_count` for current period (0 if
      absent); SUM `media_assets.size_bytes` for `usedMb` (reuse the
      aggregation shape from `media.service`); get limits from the injected
      `CoreEntitlementsService.limits(workspaceId)` (the private method —
      expose a thin public `effectiveLimits(workspaceId)` or reuse
      `storageLimitBytes`'s resolution path); compose + return `UsageView`.
- **Files — modify:**
  - `apps/core-service/src/app/app.module.ts` — `imports: […, UsageModule]`.
  - `apps/core-service/src/entitlements/core-entitlements.service.ts` — expose
    the cached limits resolver for `UsageService` (e.g. make `limits()`
    internal-callable, or add `effectiveLimits(workspaceId): Promise<PlanLimits | null>`).
    Minimal change — do not alter the fail-open/cache behavior.
- **Shared contracts:** consumes `USAGE_PATTERNS`, `UsageView`.
- **Verify:** `pnpm nx build core-service` + `pnpm nx typecheck core-service`
  + `pnpm nx lint core-service` clean. Smoke via
  `node apps/core-service/dist/main.js`: send a `core.usage.record` (e.g. via a
  tiny TCP scratch script or `nest microservices` test) then `core.usage.read`
  → `requests.used` reflects the increment and `storage.usedMb` matches the
  media SUM.

### Phase 4 — api-gateway usage module + delivery wiring

- **Why here** — depends on Phase 1 + Phase 3. This is the metering edge.
- **New dependency:** `@nestjs/schedule` in `apps/api-gateway/package.json` +
  `pnpm install` (workspace dep already; new consumer).
- **Files — create:**
  - `apps/api-gateway/src/usage/usage.module.ts` — providers
    `UsageBufferService`, `UsageEnforceService`; registers `ScheduleModule`
    (or import at app module — pick one place); exports the services.
  - `apps/api-gateway/src/usage/usage-buffer.service.ts` —
    `Map<workspaceId, number>`; `bump(ws)`; `@Interval(USAGE_FLUSH_INTERVAL_MS,
    default 15000)` flush that builds the `buckets[]` payload and `emit`s
    `core.usage.record` (fire-and-forget; clear flushed keys; also flush when
    map size ≥ `USAGE_FLUSH_THRESHOLD`, default 100). No persistence; log
    flush totals at debug. Survives a single failed flush by retrying next
    tick (don't clear on send error).
  - `apps/api-gateway/src/usage/usage-enforce.service.ts` — short-TTL cache
    (`USAGE_ENFORCE_TTL_MS`, default 30000) `{ ws → { used, limit, expires } }`;
    `assertRequests(ws)`: no-op unless `USAGE_ENFORCE=true`; if cached and
    `used >= limit` → throw `{ ...ERROR_CODES.RATE_LIMITED, message: 'Monthly
    API request limit reached.' }`; on miss, fetch via `core.usage.read`
    (cached) — **fail open** (allow) if unresolved. Never blocks when the flag
    is off or data is missing.
  - `apps/api-gateway/src/usage/usage.controller.ts` — `GET /usage`,
    `@UseGuards(JwtAuthGuard, WorkspaceGuard)`, workspace-member; forwards
    `{ userId, workspaceId }` to `core.usage.read`, returns `UsageView`.
    Model on `apps/api-gateway/src/billing/billing.controller.ts`.
- **Files — modify:**
  - `apps/api-gateway/src/delivery/delivery.controller.ts` — in both `list()`
    and `get()`, after `this.assertProject(...)`, call
    `await this.usageEnforce.assertRequests(key.workspaceId)` then
    `this.usageBuffer.bump(key.workspaceId)`. One bump per HTTP request.
    Inject the two services.
  - `apps/api-gateway/src/app/app.module.ts` — import `UsageModule` (and
    `ScheduleModule.forRoot()` if not placed inside `UsageModule`); register
    `UsageController`.
  - `apps/api-gateway/.env` + `apps/api-gateway/.env.example` — `USAGE_ENFORCE=false`,
    `USAGE_FLUSH_INTERVAL_MS=15000`, `USAGE_FLUSH_THRESHOLD=100`,
    `USAGE_ENFORCE_TTL_MS=30000`.
- **Shared contracts:** consumes `USAGE_PATTERNS`, `UsageView`, `ERROR_CODES`.
- **Verify:**
  - `pnpm nx build api-gateway` + typecheck + lint clean.
  - Start gateway + core. Hit
    `GET /v1/projects/:id/content/:apiId` N times with a `Bearer wrk_…` key;
    wait > flush interval; confirm `usage_buckets.request_count` rose by N for
    that workspace+period (`pnpm db:core:studio`).
  - `GET /api/v1/usage` (workspace-member token) returns the `UsageView` with
    matching `requests.used`.
  - With `USAGE_ENFORCE=true`, set the plan's `apiRequestsPerMonth` low (or
    bump the counter past it) → next delivery request returns `RATE_LIMITED`
    429; below the limit, succeeds. With `USAGE_ENFORCE=false`, no block.
  - **Fail-open:** stop core-service mid-traffic → delivery requests still
    succeed (enforce allows, buffer holds).

### Phase 5 — Frontend usage widget

- **Why here** — separate commit; depends on Phase 4's `GET /usage`.
- **Files — create:**
  - `apps/client/src/lib/api.ts` — `usageApi.getUsage()` → `GET /api/v1/usage`
    (model on `billingApi` / `mediaApi`).
  - `useUsage` TanStack Query hook — keyed by `currentWorkspaceId`, staleTime
    ~60s.
  - `UsageCard` component — two progress bars (API requests `used/limit`,
    storage `usedMb/limitMb`) + period label; `limit: null` → "Unlimited".
    Reuse existing card/progress primitives; `limit: null` → "Unlimited".
- **Files — modify:**
  - Mount `UsageCard` on the dashboard overview and/or the billing page
    (`apps/client/src/app/(dashboard)/w/[wsSlug]/billing/page.tsx`). Billing
    page is primary.
- **Shared contracts:** `UsageView` (frontend imports types from
  `@wriven/contracts`).
- **Verify:** `pnpm nx build client` + typecheck + lint clean. Logged in as a
  workspace member, the widget renders both bars; after hitting the Delivery
  API, `pnpm nx ...` dev refresh shows `requests.used` climb (within staleTime).

### Phase 6 — Docs + env

- **Why here** — doc-maintenance rule; do alongside/after the code lands.
- **Files — modify:**
  - `doc/api-reference.md` — add `GET /api/v1/usage` (workspace-member) +
    document `RATE_LIMITED` reused for monthly request overage.
  - `doc/conventions.md` — note `RATE_LIMITED` reuse for usage overage.
  - `doc/core-service/core-service.md` — new usage module section.
  - `doc/status.md` — mark usage metering 🟡/✅ under core-service + gateway.
  - `doc/market-readiness.md` — move "Usage metering" from open-P0 to done/in-progress.
- **Shared contracts:** none.
- **Verify:** docs render; links resolve; no contradiction with the code.

## Risks / open questions

- **Compose location** — plan puts limit composition in `core.usage.read`
  (core already holds the entitlements client). Spec OQ#2; confirm in plan-mode
  review. Alternative: gateway composes `core.usage.read` + auth resolve.
- **`CoreEntitlementsService.limits()` is private** — Phase 3 must expose it
  (or add a thin public accessor) without changing fail-open/cache behavior.
  Smallest-possible surface.
- **Counter loss on gateway crash** — accepted (soft metering). If a customer
  disputes, the atomic Postgres counter is the source of truth once flushed.
  Revisit only if charging on metered overage (deferred).
- **Enforce flag default off** — must stay off until counters validated against
  real staging traffic; flipping on too early blocks paying customers. DoD
  enforces both states are tested.
- **High-traffic flush backpressure** — per-row upsert in a tx is fine at v1
  scale; if flush batches grow large, batch into one CTE. Out of scope now.
- **Time source** — `currentPeriod()` uses `new Date()` server-side (fine; not
  the workflow-script restriction). Pin to UTC explicitly.

## Out of scope

- `assetBandwidthGb` metering (needs R2/Cloudflare egress logs — edge-dependent).
- Stripe usage-based / metered billing + overage invoicing (specs/08 deferred).
- AI credits metering (ai-service is a skeleton).
- Per-API-key breakdown, historical/trend time-series, CSV export.
- Redis counter / background rollup pipeline (scale path).
- Admin (platform) cross-tenant usage view (light follow-on; reuse
  `core.usage.read`).

## Definition of done

- [ ] Phase 1: `pnpm nx typecheck shared-contracts` clean; `USAGE_PATTERNS`,
      `UsageView`, `UsageQueryDto` exported.
- [ ] Phase 2: `pnpm db:core:generate` → only `usage_buckets` in `0007_*.sql`;
      `pnpm db:core:migrate` clean.
- [ ] Phase 3: `pnpm nx build/typecheck/lint core-service` clean; `record`
      increments atomically; `read` returns matching `requests.used` +
      `storage.usedMb`.
- [ ] Phase 4: `pnpm nx build/typecheck/lint api-gateway` clean; N delivery
      requests → `request_count += N` after flush; `GET /usage` returns the
      view; `USAGE_ENFORCE=true` blocks at limit (429), `=false` never blocks;
      core down → delivery still succeeds (fail-open).
- [ ] Phase 5: `pnpm nx build/typecheck/lint client` clean; widget renders +
      updates; **separate commit** from backend.
- [ ] Phase 6: `doc/api-reference.md`, `conventions.md`, `core-service.md`,
      `status.md`, `market-readiness.md` updated.
- [ ] Backend and frontend land in **separate commits**; one-line Conventional
      Commits, no AI co-author trailer.
