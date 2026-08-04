# Spec: Plan Revamp & Pricing

> Priority: P0 · Area: cross (contracts + auth + core + gateway + client) · Status: drafted

## Overview

Replace the placeholder plan set (free/pro/business @ $0/$29/$99, mock limits)
with a realistic, market-grounded, free-tier-infra-aware catalog: **free /
starter / pro @ $0 / $10 / $18** (10% annual discount), honest limits sized to
R2 + Supabase free tiers, and a new **revision-retention** cap that bounds DB
growth. Drops the `business` tier and the unbuilt `sso` entitlement, adds
forward `PlanLimits` fields for AI text/image metering, and rewires the existing
mock `/pricing` page to render real plan data from a new public endpoint. This
directly closes the "Plans/subscriptions" + pricing-surface items under P0 in
`doc/market-readiness.md` and unblocks charging real customers.

## Depends on

- **specs/08** (Stripe billing backend) — Checkout/portal/webhook reconciler;
  `plans`/`subscriptions` schema, `EntitlementsService.resolveLimits`, the
  `BILLING_PATTERNS.LIST_PLANS` → public-catalog query already exists.
- **specs/14** (usage metering) — the limit-resolution seam (`PlanLimits` is
  already the single source every enforcement site reads; this spec only adds
  fields + changes values).
- Existing revision write path (`contentRevisions` inserted on every entry
  create/update/restore — `apps/core-service/src/content/entries.service.ts`).

## Tooling context (skills / MCP / plugins)

- **Stripe MCP** — checked, **used (read-only)**. Confirmed the legacy
  `business` plan may carry sandbox `stripe_product_id` / `stripe_price_id_*`
  (backfilled per specs/08/11). Dropping the tier orphans those sandbox
  objects — they're sandbox-only, deleted/ignored in the Stripe dashboard; no
  live customers. Flagged in Open questions.
- **Supabase MCP** — available, read-only for DDL; the plan rewrite is **seed
  data**, not a schema migration (limits/features are `jsonb`). No MCP write
  needed.
- **Nx MCP** — build/lint/typecheck during implementation.
- Market research (web, 2026): Sanity $15/seat (250k API req), Prismic $10
  (3 users), Contentful free 100k API calls + 50GB bandwidth, Strapi $25; AI
  text ≈ $0.0003/req, image ≈ $0.002–0.05/img (Flux/SDXL). Grounds the caps +
  pricing below.

## Scope

- In scope:
  - **Contract changes** (`@wriven/contracts`): remove `sso` from `PlanFeatures`;
    add `revisionsPerEntry`, `aiTextRequestsPerMonth`, `aiImageRequestsPerMonth`
    to `PlanLimits`; change `CreateCheckoutSessionDto.planKey` enum to
    `'starter' | 'pro'`.
  - **Seed rewrite** (`apps/auth-service/src/db/seed.ts`): 3 plans — free /
    starter / pro — with the finalized numbers below; remove the `business`
    tier; reconcile the legacy `pro` key (its meaning moves to `starter`; the
    new `pro` is the top tier).
  - **Revision retention** (core-service): prune each entry's revisions to the
    plan cap after every revision insert (create/update/restore), inside the
    same transaction. `CoreEntitlementsService` exposes the cap.
  - **Public plan catalog endpoint**: `GET /api/v1/plans` (no auth) → reuses
    `BILLING_PATTERNS.LIST_PLANS` (already returns `isPublic && active` only,
    no Stripe ids). Lets the marketing `/pricing` page render without login.
  - **Frontend `/pricing` page**: drop the hardcoded mock arrays; render cards +
    comparison matrix from real `GET /plans` data; monthly/annual toggle uses
    the real `priceYearly` (10% off). Update client `planKey` type + stale
    `business` references.
  - **Docs**: api-reference (public `/plans`), conventions, status,
    market-readiness, schema/seed comments, pricing-page note.
- Out of scope:
  - **AI metering enforcement** — `ai-service` is a skeleton; the two AI limit
    fields land now (schema/contract ready) but are **not enforced** until the
    AI service ships (separate spec). Counted nowhere yet.
  - **Stripe Products/Prices for the new tiers** — a sandbox setup task
    (Dashboard or Stripe MCP), not code; flagged in Open questions.
  - **Migrating real paying subscriptions** — none exist pre-launch; all
    workspaces are on `free`. (If any sandbox checkout happened, it's test
    data.)
  - **locales / environments features** — limits stay as `1` / `0` placeholders
    (features unbuilt); not implemented here.
  - **`assetBandwidthGb` metering** — stays unmetered (specs/14); the free-plan
    `10` is a product gate, not enforced until bandwidth is measured.

## API / endpoints

- `GET /api/v1/plans` — **public** plan catalog (`PlanView[]`: free/starter/pro
  with prices/limits/features, no Stripe ids). No auth. Powers `/pricing`.
- `GET /api/v1/billing/plans` — unchanged (still auth-gated; authed surfaces can
  keep using it). Same handler, same data.
- `POST /api/v1/billing/checkout` — **changed contract**: `planKey` enum is now
  `'starter' | 'pro'` (was `'pro' | 'business'`). Auth level unchanged
  (workspace owner/admin).

## Shared contracts (@wriven/contracts)

- **`types/admin.types.ts`**
  - `PlanLimits` — add:
    ```ts
    revisionsPerEntry?: number | null;
    aiTextRequestsPerMonth?: number | null;
    aiImageRequestsPerMonth?: number | null;
    ```
  - `PlanFeatures` — **remove** `sso?: boolean;` (and the field from every
    plan/seed/admin surface). Keep `scheduledPublishing`, `customRoles`,
    `auditLog` (flagged `false` on all plans until built).
- **`dto/billing.dto.ts`** — `CreateCheckoutSessionDto.planKey`:
  `@IsIn(['starter', 'pro'])` + type `'starter' | 'pro'`.
- **`types/billing.types.ts`** — no change (`SubscriptionView` is plan-agnostic).
- **`errors.ts`** — no new codes.

## Database / schema

**No schema migration.** `plans.limits` / `plans.features` are `jsonb`; the new
keys are data. The change is **seed data only**:

- `pnpm db:auth:seed` re-runs the upsert. Because `business` has no replacement
  key, the seed must **explicitly delete** the legacy `business` row (and guard
  against any `subscriptions.plan_id` still pointing at it — none expected
  pre-launch). The legacy `pro` row is upserted to the new top-tier meaning;
  `starter` is inserted fresh.
- Schema comment `'free'|'pro'|'business'` → `'free'|'starter'|'pro'`
  ([schema/index.ts:433](apps/auth-service/src/db/schema/index.ts#L433)).

## Backend changes

### auth-service
- **Modify:**
  - `src/db/seed.ts` — rewrite the 3 `planDefs` to the finalized table (below);
    delete the legacy `business` row before upserting; update the header
    comment. Prices in cents.
  - `src/db/schema/index.ts` — plan-key comment only.
  - `src/billing/billing.service.ts` — `listPlans()` unchanged (already filters
    `isPublic && active`); confirm it tolerates the new keys.

### core-service
- **Modify:**
  - `src/content/entries.service.ts` — after each `contentRevisions` insert
    (create ~L77, update ~L182, restore ~L288), prune that entry's oldest
    revisions beyond the workspace's `revisionsPerEntry` cap, **inside the same
    tx**:
    ```sql
    DELETE FROM core_svc.content_revisions
    WHERE entry_id = $1 AND id NOT IN (
      SELECT id FROM core_svc.content_revisions
      WHERE entry_id = $1 ORDER BY version DESC LIMIT $2
    );
    ```
  - `src/entitlements/core-entitlements.service.ts` — expose
    `revisionsPerEntry(workspaceId): Promise<number | null>` (resolves via the
    cached fail-open `limits()`; `null` = unlimited/skip).

### api-gateway
- **Create:**
  - `src/plans/plans.controller.ts` — `@Controller('plans')`, `@Get()` →
    `firstValueFrom(this.auth.send(BILLING_PATTERNS.LIST_PLANS, {}))`. **No
    `JwtAuthGuard`** (public). CSRF guard short-circuits with no access cookie
    (same precedent as the Stripe webhook route), so no CSRF exemption needed.
- **Modify:**
  - `src/app/app.module.ts` — register `PlansController`.
  - `src/billing/billing.controller.ts` — no change (keeps its gated `/plans`
    under `/billing`).

### ai-service
- No changes (out of scope; AI limits are forward fields only).

## Frontend changes (apps/client)

- **Modify `src/app/pricing/page.tsx`** — remove the hardcoded `plans` +
  `comparisonRows` arrays; fetch via a new `usePublicPlans()` hook
  (`GET /api/v1/plans`); render the 3 real tiers; monthly/annual toggle reads
  `priceMonthly` / `priceYearly` (10% off — update the "Save 20%" badge to
  "Save 10%"). Build the comparison matrix from `PlanLimits`/`PlanFeatures`.
  Keep the existing layout/FAQ/CTA components.
- **Create `src/hooks/use-public-plans.ts`** — TanStack Query hook over the
  public catalog (no workspace header; plain `request('/plans')`).
- **Modify `src/lib/api.ts`** — add `plansApi.listPublic()` →
  `request<PlanView[]>('/plans')` (no `workspace: true`); fix the stale
  `free/pro/business` comment.
- **Modify `src/lib/types.ts`** — `CreateCheckoutInput.planKey` →
  `'starter' | 'pro'` (was `'pro' | 'business'`).
- **Modify `src/hooks/use-billing.ts`** — comment only (`free/starter/pro`).

## Files to create
- `apps/api-gateway/src/plans/plans.controller.ts`
- `apps/client/src/hooks/use-public-plans.ts`

## Files to modify
- `libs/shared/contracts/src/lib/types/admin.types.ts` (`PlanLimits` +3,
  `PlanFeatures` −`sso`)
- `libs/shared/contracts/src/lib/dto/billing.dto.ts` (`planKey` enum)
- `apps/auth-service/src/db/seed.ts` (rewrite 3 plans + delete business)
- `apps/auth-service/src/db/schema/index.ts` (comment)
- `apps/core-service/src/content/entries.service.ts` (revision prune ×3)
- `apps/core-service/src/entitlements/core-entitlements.service.ts` (cap accessor)
- `apps/api-gateway/src/app/app.module.ts` (register `PlansController`)
- `apps/client/src/app/pricing/page.tsx` (real data)
- `apps/client/src/lib/api.ts` + `src/lib/types.ts` + `src/hooks/use-billing.ts`
- `doc/api-reference.md`, `doc/conventions.md`, `doc/status.md`,
  `doc/market-readiness.md`, `doc/diagrams/05-billing.md` (tier names/numbers)

## New dependencies

None.

## Rules for implementation

Base (always include):
- Define shared DTOs/types/patterns/errors in `libs/shared/contracts`
  (`@wriven/contracts`) — check it before creating new ones.
- Store only R2 object **keys** in the DB; reconstruct URLs at runtime.
- Respect microservice boundaries — do not collapse auth/core/ai logic.
- Endpoints return the response envelope; use error codes from
  `@wriven/contracts/errors.ts`; never leak stack traces or DB errors.
- Use dot-namespaced patterns from `@wriven/contracts/messages.ts`, never
  hardcoded strings.
- Frontend (`apps/client`) and backend changes go in **separate commits**;
  stage selectively, never `git add -A` across both.
- Run tasks through `pnpm nx <target> <project>`. Commits are one-line
  Conventional Commits with no body. No AI co-author trailer.

Feature-specific:
- **Don't sell unbuilt features.** `scheduledPublishing`, `customRoles`,
  `auditLog` stay `false` on every plan; the `/pricing` matrix greys them with
  "(future)". `sso` is removed entirely.
- **Revision prune must be atomic + transactional** — run inside the same `tx`
  as the revision insert so a crash can't leave over-cap revisions. Prune is
  per-entry (`ORDER BY version DESC LIMIT cap`), never workspace-wide.
- **Public `/plans` leaks nothing.** Reuse `LIST_PLANS` which already filters
  `isPublic && active` and omits `stripe_*` columns (vs `AdminPlanView`). No
  per-customer overrides, no subscription state.
- **Plan-key reshuffle safety.** Before deleting `business`, assert no
  `subscriptions.plan_id` references it (pre-launch: none). The legacy `pro`
  row is overwritten in place to the new top-tier meaning; `starter` is new.
- **AI fields are forward-only.** Add them to `PlanLimits` + seed, but wire
  **no enforcement** (ai-service is a skeleton). Document as "coming" in the
  matrix.
- **`assetBandwidthGb=10` on free is a product gate, not a measured cap** —
  bandwidth is unmetered (specs/14); don't pretend it's enforced.

## Finalized plan numbers (the seed target)

| (cents where price) | free | starter | pro |
|---|---|---|---|
| priceMonthly | 0 | 1000 ($10) | 1800 ($18) |
| priceYearly (10% off) | 0 | 10800 ($108) | 16200 ($162) |
| members | 4 | 10 | 25 |
| projects | 2 | 5 | 15 ❓ |
| entries | 500 | 2,000 | 10,000 |
| revisionsPerEntry | 5 | 10 | 15 |
| contentTypes | 5 | 20 | 50 |
| storageMb | 100 | 1,000 | 5,000 |
| apiRequestsPerMonth | 100,000 | 500,000 | 2,000,000 ❓ |
| assetBandwidthGb | 10 | null | null |
| apiKeys | 2 | 10 | 25 |
| webhooks | 2 | 10 | 20 |
| aiTextRequestsPerMonth | 50 | 500 | 2,000 ❓ |
| aiImageRequestsPerMonth | 5 | 50 | 200 ❓ |
| locales / environments | 1 / 0 | 1 / 0 | 1 / 0 |
| features | previewApi ✓, revisionHistory –, supportTier=community | +revisionHistory ✓, email | +priority |

`❓` = proposed market-grounded default; confirm in plan mode.

## Definition of done

- [ ] `pnpm nx typecheck @wriven/contracts` passes; `PlanLimits` has the 3 new
      fields, `PlanFeatures` has no `sso`, `CreateCheckoutSessionDto.planKey`
      is `'starter'|'pro'`.
- [ ] `pnpm nx build @wriven/core-service` + `@wriven/api-gateway` +
      `@wriven/client` pass; `pnpm nx lint` clean on all three.
- [ ] `pnpm db:auth:seed` produces exactly 3 plans (free/starter/pro) with the
      finalized numbers; the `business` row is gone; no `subscriptions.plan_id`
      dangles (verified via `db:auth:studio` / a count query).
- [ ] `GET /api/v1/plans` (no auth) returns the 3 `PlanView`s with no Stripe
      ids; `GET /billing/plans` (authed) returns the same.
- [ ] Editing one entry `revisionsPerEntry + 1` times on a free workspace
      leaves exactly 5 revisions for that entry (oldest pruned), verified via
      the revisions list / DB.
- [ ] `/pricing` renders 3 real tiers from `GET /plans`; the monthly/annual
      toggle reflects `priceYearly` (10% off badge); the matrix matches the
      seed values; unbuilt features show "(future)".
- [ ] `POST /billing/checkout` with `planKey: 'business'` is rejected
      (validation); `'starter'` / `'pro'` are accepted.
- [ ] Docs updated (api-reference `/plans`, status, market-readiness,
      conventions, billing diagram, schema/seed comments).

## Open questions / decisions deferred (resolve in plan mode)

1. **Legacy `business` row + Stripe sandbox objects** — delete the row (seed)
   and leave the sandbox Product/Prices orphaned in Stripe (harmless), vs.
   actively archive them via Stripe MCP. Default: delete row, leave orphans.
2. **Confirm the ❓ defaults** — pro projects 15; API requests 100k/500k/2M;
   AI text 50/500/2,000; AI image 5/50/200.
3. **Plan-key reshuffle** — confirm `pro` (key) is repurposed middle→top and
   `starter` is new (vs. keeping old keys and only renaming). Default:
   repurpose (cleaner internal keys).
4. **Pricing page FAQ copy** — keep the existing marketing FAQ as-is, or
   update the "20% annual" / "AI credits" wording to match 10% + the new AI
   model. Default: keep copy, fix the discount %.
