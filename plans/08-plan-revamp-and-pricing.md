# Plan: Plan Revamp & Pricing

> Status: drafted · Executes: spec 15 (`specs/15-plan-revamp-and-pricing.md`) · Supersedes: -

## Goal

Ship the real plan catalog (free/starter/pro @ $0/$10/$18), honest limits, a
revision-retention cap, and a public `/pricing` page fed by a new public
`GET /plans` — replacing the mock plans + mock pricing page.

## Current state

Already shipped (do **not** re-plan):
- `plans` / `subscriptions` schema + `EntitlementsService.resolveLimits`
  (specs/08); every enforcement call site reads `PlanLimits`.
- `BILLING_PATTERNS.LIST_PLANS` → `BillingService.listPlans()` already returns
  only `isPublic && active` plans, no Stripe ids ([billing.service.ts:58](apps/auth-service/src/billing/billing.service.ts#L58)).
- Revision write path inserts a revision on every entry create/update/restore
  ([entries.service.ts](apps/core-service/src/content/entries.service.ts) L77, L182, L288) — but **no cap ever**.
- `CoreEntitlementsService` already has a cached fail-open `limits()` + a public
  `effectiveLimits()` accessor (added specs/14) — the pattern to reuse for the
  revision cap.
- Client `/pricing/page.tsx` is fully built (cards + matrix + FAQ + CTA) but
  **hardcoded mock** (Free/Pro/Business, $59, "Save 20%").
- **Only `ThrottlerGuard` is a global `APP_GUARD`** — `JwtAuthGuard` is
  per-route. A controller with no `@UseGuards` is public (same as the Stripe
  webhook route). No `@Public` decorator exists or is needed.

Plan starts from here.

## Phases

### Phase 1 — Shared contracts

- **Why here** — first; every backend + the client imports these.
- **Files — modify:**
  - `libs/shared/contracts/src/lib/types/admin.types.ts`:
    - `PlanLimits` — add `revisionsPerEntry?: number | null`,
      `aiTextRequestsPerMonth?: number | null`, `aiImageRequestsPerMonth?: number | null`.
    - `PlanFeatures` — **remove** `sso?: boolean`.
  - `libs/shared/contracts/src/lib/dto/billing.dto.ts` —
    `CreateCheckoutSessionDto.planKey`: `@IsIn(['starter', 'pro'])` + type
    `'starter' | 'pro'`.
- **Shared contracts:** the 3 new `PlanLimits` fields, `sso` removal, checkout
  `planKey` enum. No new patterns/errors.
- **Verify:** `pnpm nx typecheck @wriven/contracts` passes; `sso` absent,
  new fields + checkout enum resolvable from `@wriven/contracts`.

### Phase 2 — Seed + plan data

- **Why here** — depends on Phase 1 (new fields); produces the real catalog.
- **Files — modify:**
  - `apps/auth-service/src/db/seed.ts` — rewrite `planDefs` to the 3 plans
    (free/starter/pro) with the finalized numbers (spec §"Finalized plan
    numbers"); **delete the legacy `business` row** before upserting (after
    asserting no `subscriptions.plan_id` references it — pre-launch: none);
    the legacy `pro` row is upserted in place to the new top-tier meaning,
    `starter` inserted fresh. Prices in **cents** (free 0/0, starter
    1000/10800, pro 1800/16200). Update the header comment.
  - `apps/auth-service/src/db/schema/index.ts` — plan-key comment
    `'free'|'pro'|'business'` → `'free'|'starter'|'pro'` (L433).
- **Shared contracts:** none.
- **Verify:** `pnpm db:auth:seed` runs clean; `GET`-equivalent check
  (Supabase MCP read-only) confirms exactly 3 plans with the right numbers,
  `business` gone, and `SELECT count(*) FROM auth_svc.subscriptions WHERE
  plan_id IN (business id)` = 0 (no dangling refs).

### Phase 3 — Revision retention (core-service)

- **Why here** — depends on Phase 1 (the `revisionsPerEntry` field).
- **Files — modify:**
  - `apps/core-service/src/entitlements/core-entitlements.service.ts` — add
    `async revisionsCap(workspaceId): Promise<number | null>` returning
    `limits(workspaceId)?.revisionsPerEntry ?? null` (cached fail-open, same
    pattern as `effectiveLimits`).
  - `apps/core-service/src/content/entries.service.ts` — inject
    `CoreEntitlementsService` (already injected for quota checks); after each
    `contentRevisions` insert in **create (L77), update (L182), restore (L288)**,
    inside the same `tx`, prune oldest beyond the cap:
    ```ts
    const cap = await this.entitlements.revisionsCap(workspaceId);
    if (cap != null) {
      await tx.execute(sql`
        DELETE FROM core_svc.content_revisions
        WHERE entry_id = ${row.id} AND id NOT IN (
          SELECT id FROM core_svc.content_revisions
          WHERE entry_id = ${row.id} ORDER BY version DESC LIMIT ${cap}
        )`);
    }
    ```
- **Shared contracts:** consumes `revisionsPerEntry`.
- **Verify:** `pnpm nx build @wriven/core-service` + typecheck + lint clean.
  DB-level prune smoke (write-capable conn): seed 8 revisions for one entry on
  a free workspace, run the prune SQL with `cap=5`, confirm exactly the 5
  newest remain. Then `DELETE` the test rows.

### Phase 4 — Public plan catalog (api-gateway)

- **Why here** — depends on Phase 2 (data) + Phase 1; powers the pricing page.
- **Files — create:**
  - `apps/api-gateway/src/plans/plans.controller.ts` —
    `@Controller('plans')` + `@Get()` →
    `firstValueFrom(this.auth.send(BILLING_PATTERNS.LIST_PLANS, {}))`.
    **No `@UseGuards`** (public — only the global `ThrottlerGuard` applies,
    which is fine for a GET). `@Inject(SERVICE_TOKENS.AUTH_SERVICE)`.
- **Files — modify:**
  - `apps/api-gateway/src/app/app.module.ts` — register `PlansController` in
    the `controllers` array (flat, like the others).
- **Shared contracts:** consumes `BILLING_PATTERNS.LIST_PLANS`, `PlanView`.
- **Verify:** `pnpm nx build @wriven/api-gateway` + typecheck + lint clean.
  `curl -i http://localhost:5000/api/v1/plans` (no auth headers) → 200 +
  `{ success: true, data: [free, starter, pro] }`, no `stripe_*` fields.

### Phase 5 — Frontend pricing page (separate commit)

- **Why here** — depends on Phase 4 (`GET /plans`).
- **Files — create:**
  - `apps/client/src/hooks/use-public-plans.ts` — `usePublicPlans()` TanStack
    Query hook over `plansApi.listPublic()` (no workspace header; ~5min stale).
- **Files — modify:**
  - `apps/client/src/lib/api.ts` — add `plansApi.listPublic()` →
    `request<PlanView[]>('/plans')` (no `workspace: true`); fix the
    `free/pro/business` comment → `free/starter/pro`.
  - `apps/client/src/lib/types.ts` — `PlanLimits` +3 fields; `PlanFeatures`
    remove `sso`; `CreateCheckoutInput.planKey` → `'starter' | 'pro'`.
  - `apps/client/src/app/pricing/page.tsx` — delete the hardcoded `plans` +
    `comparisonRows` arrays; render from `usePublicPlans()`; monthly/annual
    toggle reads `priceMonthly` / `priceYearly`; **"Save 20%" → "Save 10%"**;
    build the comparison matrix from `PlanLimits`/`PlanFeatures` (unbuilt
    features `(future)` + greyed). Keep layout/FAQ/CTA. Loading + error states.
  - `apps/client/src/hooks/use-billing.ts` — comment only (`free/starter/pro`).
- **Shared contracts:** `PlanView` (frontend mirrors from `@/lib/types`).
- **Verify:** `pnpm nx build @wriven/client` passes; `/pricing` renders 3 real
  tiers with toggle reflecting 10% annual; matrix matches seed; checkout DTO
  type-checks with `'starter' | 'pro'`.

### Phase 6 — Docs

- **Why here** — doc-maintenance rule; do alongside/after code.
- **Files — modify:**
  - `doc/api-reference.md` — add public `GET /plans`; note checkout `planKey`
    is now `starter|pro`.
  - `doc/status.md` — plans row (3 tiers, real pricing), revision cap.
  - `doc/market-readiness.md` — pricing/plan item → done/in-progress.
  - `doc/diagrams/05-billing.md` — tier names + numbers.
  - `doc/conventions.md` — none needed (no new codes).
- **Shared contracts:** none.
- **Verify:** docs render; links resolve; numbers consistent with the seed.

## Risks / open questions

1. **Plan-key reshuffle** — `pro` (key) is repurposed middle→top; `starter`
   is new; `business` deleted. Confirm no workspace is on a paid plan before
   deleting (pre-launch: all `free`). Spec OQ#3.
2. **The ❓ numbers** — pro projects 15; API requests 100k/500k/2M; AI text
   50/500/2,000; AI image 5/50/200. Spec OQ#2. Lock before Phase 2.
3. **Legacy `business` Stripe sandbox objects** — deleting the DB row orphans
   the sandbox Product/Prices (harmless). Optionally archive via Stripe MCP.
   Spec OQ#1. Default: delete row, leave orphans.
4. **AI fields are forward-only** — Phase 1 adds them, Phase 2 seeds them, but
   **no enforcement** wires up (ai-service is a skeleton). Don't accidentally
   gate anything on them yet.
5. **`assetBandwidthGb=10` on free is not enforced** (bandwidth unmetered,
   specs/14) — the pricing page must not imply it's a hard cap.
6. **Revision prune correctness** — must run inside the same tx as the insert;
   verify the `NOT IN (… LIMIT cap)` subquery keeps the newest `cap` by
   `version` (the DB-level smoke in Phase 3 catches ordering bugs).

## Out of scope

- AI metering enforcement (ai-service unbuilt — separate spec).
- Stripe Products/Prices for the new tiers (sandbox setup task, not code).
- Migrating real paid subscriptions (none exist).
- locales / environments features (limits stay placeholders).
- `assetBandwidthGb` metering (specs/14).
- Pricing-page marketing copy beyond the discount %.

## Definition of done

- [ ] Phase 1: `pnpm nx typecheck @wriven/contracts` clean; `sso` gone, 3 new
      `PlanLimits` fields + checkout `planKey` `'starter'|'pro'`.
- [ ] Phase 2: `pnpm db:auth:seed` → exactly free/starter/pro with finalized
      numbers; `business` gone; no dangling `subscriptions.plan_id`.
- [ ] Phase 3: core-service build/typecheck/lint clean; revision prune leaves
      exactly `cap` newest revisions per entry (DB smoke).
- [ ] Phase 4: gateway build/typecheck/lint clean; `GET /api/v1/plans` (no auth)
      → 200, 3 plans, no Stripe ids.
- [ ] Phase 5: client build clean; `/pricing` renders real tiers, 10% annual
      toggle, matrix matches seed; checkout typechecks with `starter|pro`.
- [ ] Phase 6: api-reference, status, market-readiness, billing diagram updated.
- [ ] Backend and frontend land in **separate commits**; one-line Conventional
      Commits, no AI co-author trailer.
