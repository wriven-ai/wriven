# Spec: Usage Metering

> Priority: P0 · Area: cross (gateway + core + contracts + client) · Status: drafted

## Overview

Plans advertise `apiRequestsPerMonth` and `assetBandwidthGb`, but those
dimensions are **never measured or enforced** — only count-based caps
(projects/members/entries/content-types/api-keys/webhooks/storage-at-upload)
bite today. This spec adds the missing commercial metering layer: count
Delivery API requests per workspace per billing period, store them, expose a
usage read API, surface usage in the dashboard, and add a (soft, fail-open)
overage gate. This is the #2 P0 item in `doc/market-readiness.md`
("Usage metering — L … limits defined, unmeasured") and the explicit gap that
must close before Wriven can charge on a metered plan.

The key insight (verified in code): the entitlements seam is already complete
— `PlanLimits` already carries `apiRequestsPerMonth` / `assetBandwidthGb` /
`storageMb`, `auth.entitlements.resolve` returns effective limits, and every
enforcement call site reads them. So metering needs **zero changes to existing
quota enforcement**; it only has to (a) *produce* the request counter and
(b) *read* it back at the delivery edge. Storage usage is already computed
live (`CoreEntitlementsService.storageLimitBytes` + `media.service` SUM) — it
just needs a read path.

## Depends on

None (greenfield over shipped scaffolding):
- `PlanLimits` (`apiRequestsPerMonth`, `assetBandwidthGb`, `storageMb`) —
  `libs/shared/contracts/src/lib/types/admin.types.ts`.
- `auth.entitlements.resolve` (`EntitlementsService`) — live; returns limits.
- `CoreEntitlementsService` + per-workspace storage cap — live
  (`apps/core-service/src/entitlements/core-entitlements.service.ts`).
- Delivery API + `ApiKeyGuard` — live
  (`apps/api-gateway/src/delivery/delivery.controller.ts`,
  `apps/api-gateway/src/auth/api-key.guard.ts`); resolves `workspaceId` +
  `projectId` per request — the meter key.
- Stripe billing (specs/08) — backend done; flat-rate `licensed` prices. This
  spec does **not** touch Stripe (no metered/usage-type billing — deferred in
  specs/08).

## Tooling context (skills / MCP / plugins)

- **Supabase MCP** — available (read-only for DDL here); migrations go through
  `pnpm db:core:*` (session pooler `DIRECT_URL`), not the MCP. Not used for
  changes in this spec.
- **Nx MCP** — for build/lint/typecheck/targets. Used during implementation,
  not for this draft.
- **Stripe MCP** — checked, **not used**. Confirmed out of scope: no metered
  prices / `Stripe.SubscriptionItem.createUsageRecord` in v1 (specs/08
  deferred metered billing). Revisited when overage→Stripe reporting lands.
- No external metering SaaS (Vercel Analytics / Prefab / etc.) — checked,
  none wired; v1 uses Postgres atomic counters (zero new infra). Redis
  considered for the counter (faster increments) but rejected for v1 to keep
  the infra footprint flat; noted as the scale path in "Out of scope".

## Scope

- In scope:
  - **Request metering** — count Delivery API (`Bearer wrk_…`) requests per
    workspace per calendar month (UTC), persisted in `core_svc`.
  - **Batched increment** — gateway buffers counts in-process and flushes to
    core-service over TCP on an interval + size threshold (no per-request DB
    or TCP hop on the hot path).
  - **Usage read API** — `GET /api/v1/usage` returning the current period's
    `{ requests: {used, limit}, storage: {usedMb, limitMb}, period }`.
  - **Soft overage gate** — gateway-side check (short-TTL cache, fail-open);
    when `requests.used >= limit`, reject with `RATE_LIMITED` (429). Behind a
    `USAGE_ENFORCE` flag, **default off** for v1 (meter + display first,
    enforce once counters are validated).
  - **Frontend usage widget** — a usage card (requests + storage bars) on the
    workspace dashboard / billing page, consuming `GET /usage`.
  - Shared contracts: `USAGE_PATTERNS`, `UsageView` type, optional `usage`
    DTO.
  - One new table `usage_buckets` in `core_svc`.
  - Doc updates (api-reference, core-service, conventions, status,
    market-readiness).
- Out of scope:
  - **`assetBandwidthGb` metering** — real asset egress happens at R2 /
    Cloudflare, not the gateway; the Delivery JSON payload is negligible.
    Measuring it accurately needs R2/CDN log integration (edge-dependent) —
    deferred. The limit field stays in `PlanLimits` for future use; v1 does
    not measure or enforce it.
  - **Stripe usage-based / metered billing** — reporting usage to Stripe
    (`createUsageRecord`), overage invoicing, metered prices (specs/08
    explicitly deferred these).
  - **AI credits / generations metering** — `ai-service` is a skeleton
    (specs/market-readiness P2); no AI dimension to meter yet.
  - **Per-API-key breakdown** — v1 meters at workspace granularity (the
    billing unit). Per-key drilldown is a v2 analytics concern.
  - **Historical / trend charts** — v1 returns the current period only;
    multi-period time series + CSV export is later.
  - **Redis counter / rollup pipeline** — v1 uses Postgres atomic upsert;
    Redis + background rollup is the scale path once traffic warrants it.
  - **Admin (platform) usage view** — admin metrics exist; a cross-tenant
    usage table is a light follow-on (reuse `core.usage.read`), not required
    to close the P0 gap.

## API / endpoints

Customer-facing (new, gateway → TCP `core.usage.*`):
- `GET /api/v1/usage` — current-period usage for the active workspace
  (`requests.used/limit`, `storage.usedMb/limitMb`, `period.start/end`) —
  **workspace-member**

Inbound from the public Delivery edge (new TCP pattern, gateway → core, not an
HTTP endpoint):
- `core.usage.record` — batched increment; payload
  `{ buckets: [{ workspaceId, periodStart, periodEnd, requestCount }] }`.
  Fire-and-forget semantically (loss on crash acceptable — metering is soft).
- `core.usage.read` — payload `{ workspaceId }` → `UsageView` (raw used
  counts + period; the gateway folds in limits from the cached
  `auth.entitlements.resolve`, or core composes them — see Backend).

No changes to existing HTTP endpoints. The Delivery controller gains an
increment call on its existing `list`/`get` paths; no new routes.

## Shared contracts (@wriven/contracts)

New/changed (all in `libs/shared/contracts/src/lib/`):

- **`messages.ts`** — new `USAGE_PATTERNS` block (core-service owns it — it
  owns the metered resources: api_keys, delivery, media). Dot-namespaced,
  consistent with `CORE_PATTERNS`:
  ```ts
  export const USAGE_PATTERNS = {
    RECORD: 'core.usage.record',
    READ: 'core.usage.read',
  } as const;
  ```
- **`types/usage.types.ts`** (new; interface-only, model on
  `types/billing.types.ts`):
  - `UsagePeriod { start: string; end: string }` (ISO; calendar month UTC).
  - `UsageView { period: UsagePeriod; requests: { used: number; limit: number | null }; storage: { usedMb: number; limitMb: number | null } }`
    (`limit: null` = unlimited; `requests.used` is the current-period count).
- **`dto/usage.dto.ts`** (new; optional) — `UsageQueryDto { periodStart?: string }`
  for future range queries; v1 ignores it (current period only) but the route
  accepts and validates it so the surface is stable.
- **`errors.ts`** — no new code. Reuse `RATE_LIMITED` (429) for request
  overage (it is semantically rate-limiting by monthly quota, and 429 is the
  correct status). Document the reuse in `doc/conventions.md`.
- **`src/index.ts`** (barrel) — add:
  ```ts
  export * from './lib/dto/usage.dto';
  export * from './lib/types/usage.types';
  ```

## Database / schema

- **New table `core_svc.usage_buckets`** — one row per workspace per billing
  period, atomic increment. Add to the core-service schema file alongside
  `apiKeys` / `mediaAssets`:
  ```ts
  export const usageBuckets = coreSchema.table('usage_buckets', {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(), // denormalized scoping; no cross-schema FK (same pattern as content_entries.workspace_id)
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    requestCount: bigint('request_count', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  }, (t) => [
    uniqueIndex('usage_buckets_workspace_period_uq').on(t.workspaceId, t.periodStart),
    index('usage_buckets_workspace_idx').on(t.workspaceId),
  ]);
  ```
  No `createdAt`-only churn — one row per period is upserted, not appended, so
  the table stays O(workspaces × months). Add a `usageBucketsRelations` →
  none (no cross-schema relation; reads are direct).
- **Migration**: `pnpm db:core:generate` (produces the next `core_svc`
  migration SQL) → `pnpm db:core:migrate` (applies via `DIRECT_URL`).
- **No change** to `plans` / `subscriptions` / `media_assets` — every column
  needed already exists.
- **Atomic increment** (drizzle upsert, conflict on the unique index):
  ```ts
  await db.insert(usageBuckets)
    .values({ workspaceId, periodStart, periodEnd, requestCount: n })
    .onConflictDoUpdate({
      target: [usageBuckets.workspaceId, usageBuckets.periodStart],
      set: { requestCount: sql`${usageBuckets.requestCount} + ${n}` },
    });
  ```

## Backend changes

### api-gateway
- **Create:**
  - `apps/api-gateway/src/usage/usage-buffer.service.ts` — in-process
    `Map<workspaceId, number>` accumulator; `bump(workspaceId)` called from
    the delivery path; flushes batched increments to `core.usage.record` on an
    `@Interval` (e.g. 15s) and when the map size crosses a threshold. No
    persistence on the gateway (stateless; loss on crash acceptable). Logs
    flush totals at debug.
  - `apps/api-gateway/src/usage/usage-enforce.service.ts` — short-TTL
    (`USAGE_ENFORCE_TTL_MS`, default 30s) cache of
    `{ workspaceId → { used, limit, expires } }`; `assertRequests(workspaceId)`
    returns/throws. Fails **open** (allows) when no cached/resolveable value
    (matches the `CoreEntitlementsService` fail-open precedent — metering is
    soft and must never break delivery). Active only when
    `USAGE_ENFORCE=true`.
  - `apps/api-gateway/src/usage/usage.controller.ts` — `GET /usage`,
    `@UseGuards(JwtAuthGuard, WorkspaceGuard)`, **workspace-member**; forwards
    `{ userId, workspaceId }` to `core.usage.read` and returns the
    `UsageView`.
- **Modify:**
  - `apps/api-gateway/src/delivery/delivery.controller.ts` — in `list()` and
    `get()`, after the project assertion, call
    `usageEnforce.assertRequests(key.workspaceId)` (no-op unless enforcing)
    then `usageBuffer.bump(key.workspaceId)`. One increment per HTTP delivery
    request (count requests, not entries returned).
  - `apps/api-gateway/src/app/app.module.ts` — register `UsageController`;
    import a `UsageModule` (or inline the providers); add `ScheduleModule`
    for `@Interval` (already a workspace dep via auth-service — add
    `@nestjs/schedule` to the gateway's `package.json`).
  - `apps/api-gateway/.env` / `.env.example` — `USAGE_ENFORCE=false`,
    `USAGE_FLUSH_INTERVAL_MS=15000`, `USAGE_FLUSH_THRESHOLD=100`,
    `USAGE_ENFORCE_TTL_MS=30000`.

### core-service
- **Create:**
  - `apps/core-service/src/usage/usage.module.ts`
  - `apps/core-service/src/usage/usage.controller.ts` —
    `@MessagePattern(USAGE_PATTERNS.RECORD)` (batched upsert) and
    `@MessagePattern(USAGE_PATTERNS.READ)` (compose `UsageView`).
  - `apps/core-service/src/usage/usage.service.ts`:
    - `record(buckets)` — batched atomic upsert (loop the array; or a single
      CTE if the batch is large — start with per-row upsert in a tx).
    - `read(workspaceId)` — resolve the current period, fetch
      `usage_buckets.request_count` for this workspace+period (0 if absent),
      compute `storage usedMb` from `media_assets` SUM (reuse the existing
      aggregation used by `media.service`'s quota check), fetch limits via
      the injected `CoreEntitlementsService` (cached `auth.entitlements`
      client), and return the composed `UsageView`. Centralizing the compose
      here means the gateway stays thin.
    - `currentPeriod()` — `{ start, end }` for the current calendar month
      (UTC midnight boundaries), pure helper.
- **Modify:**
  - `apps/core-service/src/app/app.module.ts` — import `UsageModule`.
  - `apps/core-service/src/db/schema/index.ts` — add the `usageBuckets` table.

### auth-service
- **No changes.** Limits already resolve via `EntitlementsService`; core
  reads them over the existing `AUTH_PATTERNS.ENTITLEMENTS_RESOLVE`. The
  `usage` field on `WorkspaceEntitlements` stays `{ projects, members }`
  (auth-owned resources); request/storage usage is a core-owned read.

### ai-service
- No changes (out of scope).

## Frontend changes (apps/client)

- **Create:**
  - `src/app/(dashboard)/w/[wsSlug]/.../usage` widget, or fold into the
    existing billing page (`billing/page.tsx`) — a `UsageCard` showing two
    bars: **API requests** `used / limit` and **Storage** `usedMb / limitMb`,
    with the period label. Reuses the existing card/progress UI primitives.
  - `usageApi` method in `src/lib/api.ts` — `getUsage()` → `GET /api/v1/usage`.
  - `useUsage` TanStack Query hook (`src/.../hooks` or inline) — keyed by
    `currentWorkspaceId`, ~60s stale time.
- **Modify:**
  - Place the `UsageCard` on the dashboard overview and/or the billing page
    (most relevant next to the plan).
- RBAC: visible to any workspace-member (read-only). No `useCan` gating
  needed beyond the existing member guard.

## Files to create
- `libs/shared/contracts/src/lib/types/usage.types.ts`
- `libs/shared/contracts/src/lib/dto/usage.dto.ts`
- `apps/core-service/src/usage/usage.module.ts`
- `apps/core-service/src/usage/usage.controller.ts`
- `apps/core-service/src/usage/usage.service.ts`
- `apps/api-gateway/src/usage/usage.module.ts`
- `apps/api-gateway/src/usage/usage-buffer.service.ts`
- `apps/api-gateway/src/usage/usage-enforce.service.ts`
- `apps/api-gateway/src/usage/usage.controller.ts`
- `apps/core-service/src/db/migrations/<next>_*.sql` (generated)
- Frontend: `UsageCard` component + `useUsage` hook + `getUsage` api method.

## Files to modify
- `libs/shared/contracts/src/lib/messages.ts` (add `USAGE_PATTERNS`)
- `libs/shared/contracts/src/index.ts` (barrel exports)
- `apps/core-service/src/db/schema/index.ts` (add `usageBuckets`)
- `apps/core-service/src/app/app.module.ts` (import `UsageModule`)
- `apps/api-gateway/src/delivery/delivery.controller.ts` (bump + enforce)
- `apps/api-gateway/src/app/app.module.ts` (register usage module/controller +
  `ScheduleModule`)
- `apps/api-gateway/.env` + `.env.example` (`USAGE_*` flags)
- `apps/api-gateway/package.json` (`@nestjs/schedule` dep)
- `apps/client/src/lib/api.ts` + the dashboard/billing page (frontend —
  separate commit)
- `doc/api-reference.md` (add `GET /usage`)
- `doc/conventions.md` (note `RATE_LIMITED` reused for usage overage)
- `doc/core-service/core-service.md` (new usage module)
- `doc/status.md` + `doc/market-readiness.md` (mark metering in progress/done)

## New dependencies

- `@nestjs/schedule` — added to **api-gateway** (`package.json` +
  `pnpm install`) for the `@Interval` flush. Already a dep of auth-service, so
  no new workspace-level package, just a new consumer. No pip packages.

## Rules for implementation

Base (always include):
- Define shared DTOs/types/patterns/errors in `libs/shared/contracts`
  (`@wriven/contracts`) — check it before creating new ones.
- Store only R2 object **keys** in the DB; reconstruct URLs at runtime.
- Respect microservice boundaries — do not collapse auth/core/ai logic. Usage
  counters live in `core_svc` (core owns api_keys/delivery/media); limits
  remain in `auth_svc`.
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
- **Count HTTP requests, not rows.** One increment per Delivery `list`/`get`
  call — that is what `apiRequestsPerMonth` means. Do not multiply by items
  returned.
- **Never block the hot path.** The increment is fire-and-forget into the
  in-process buffer; the buffer flush is the only TCP hop, off the request
  path. The enforce check uses a short-TTL cache, never a per-request resolve.
- **Fail open.** If `core.usage.read` / entitlements are unreachable, the
  enforce gate allows the request (soft metering). Quotas are commercial
  guardrails, not security boundaries — a metering outage must not take the
  Delivery API down. Mirror the `CoreEntitlementsService` fail-open contract.
- **Period = calendar month, UTC.** Boundaries at UTC midnight on the 1st.
  Simpler and auditable than tracking each subscription's cycle; aligns with
  how buyers compare "X requests/month".
- **Enforcement default off.** Ship v1 as meter + display (`USAGE_ENFORCE=false`).
  Flip to enforce only after counters are validated against real traffic in
  staging — a miscount that blocks paying customers is worse than no
  enforcement.
- **`assetBandwidthGb` is not measured in v1.** Do not wire a fake/proxy
  metric for it (e.g. counting JSON bytes). Surface it as "not yet reported"
  in the UI rather than reporting a misleading number. The field stays in
  `PlanLimits` for the future R2/Cloudflare egress integration.
- **Atomic counter only.** No append-only event log in v1 (one upserted row
  per workspace+period). If per-request auditability is ever needed, add an
  events table then — not now.
- **No secrets / no PII.** The counter carries only `workspaceId` + counts;
  never the API key, user, or payload. Safe to log flush totals.

## Definition of done

- [ ] `pnpm nx typecheck shared-contracts` passes; `USAGE_PATTERNS`,
      `UsageView`/`UsagePeriod`, `UsageQueryDto` exported from the barrel.
- [ ] `pnpm db:core:generate` produces **only** the `usage_buckets` table;
      `pnpm db:core:migrate` applies cleanly.
- [ ] `pnpm nx build api-gateway` + `pnpm nx build core-service` pass;
      `pnpm nx lint` + `pnpm nx typecheck` clean on both.
- [ ] A Delivery API request (`GET /v1/projects/:id/content/:apiId` with a
      `Bearer wrk_…` key) bumps the in-process buffer; after the flush
      interval, `usage_buckets.request_count` for that workspace+period
      increments by 1 per request (verified via `pnpm db:core:studio` or a
      `core.usage.read` call).
- [ ] `GET /api/v1/usage` (as a workspace-member) returns
      `{ period, requests: {used, limit}, storage: {usedMb, limitMb} }` with
      `limit` matching the workspace's effective plan and `storage.usedMb`
      matching the media SUM.
- [ ] With `USAGE_ENFORCE=true` and a workspace whose `requests.used >= limit`,
      a Delivery request returns `RATE_LIMITED` (429); with the counter below
      the limit, requests succeed. With `USAGE_ENFORCE=false`, no request is
      ever blocked regardless of count.
- [ ] Fail-open verified: stop core-service, confirm Delivery requests still
      succeed (enforce allows; buffer holds, flushes on core recovery).
- [ ] Frontend `UsageCard` renders both bars on the dashboard/billing page,
      updating after delivery traffic (separate commit).
- [ ] `doc/api-reference.md`, `doc/conventions.md`, `doc/core-service/`,
      `doc/status.md`, `doc/market-readiness.md` updated (doc-maintenance rule).

## Open questions / decisions deferred (resolve in plan mode)

1. **Enforce gate placement** — gateway (`DeliveryController`, chosen here,
   single chokepoint, knows `workspaceId` from the key) vs an
   interceptor/middleware over all api-key routes. Default: gateway delivery
   controller.
2. **Compose location for `UsageView`** — core composes limits+usage (chosen;
   core already holds the entitlements client) vs gateway composing
   `core.usage.read` + `auth.entitlements.resolve`. Default: core.
3. **Period boundary** — calendar month UTC (chosen, simple) vs the
   subscription's `currentPeriodStart/End` (matches billing cycle, more
   complex). Default: calendar month.
4. **Overage response** — `RATE_LIMITED` 429 (chosen, reuse) vs a new
   `USAGE_LIMIT_REACHED` vs `PLAN_LIMIT_REACHED` 403. Default: reuse
   `RATE_LIMITED`.
5. **Flush durability** — accept counter loss on gateway crash (chosen, soft)
   vs dual-writing pending increments to a side table. Default: accept loss.
6. **Where the widget lives** — dashboard overview, billing page, or both.
   Default: both (cheap), with billing page as primary.
