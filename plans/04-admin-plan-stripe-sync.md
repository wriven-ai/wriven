# Plan: Admin Plan Create/Delete ↔ Stripe Sync

> Status: drafted · Executes: spec 11 (`specs/11-admin-plan-stripe-sync.md`) · Supersedes: -

## Goal

Admin **create** of a paid plan creates the Stripe Product + Prices (and stores
their ids); **retire** (`active:false`) archives them on Stripe. Prices are
read-only after create. No price-edit push, no Stripe→DB mirror — minimal,
industry-standard.

## Current state

- `AdminPlansService` (`apps/auth-service/src/admin/admin-plans.service.ts`) —
  `list` / `create` / `update` / `assign`; **local DB only, zero Stripe calls**.
  No delete route; retirement = `PATCH active:false`.
- `UpdatePlanDto` currently accepts `priceMonthly` / `priceYearly` — these will be
  removed (read-only after create).
- `STRIPE_CLIENT` provider lives in `BillingModule`, **not exported** —
  `AdminModule` can't inject it.
- `plans` schema already has `stripe_product_id` / `stripe_price_id_monthly` /
  `stripe_price_id_yearly` / `price_monthly` / `price_yearly` / `currency`
  (specs/08).
- Stripe ops confirmed via MCP (spec 11): `PostProducts`, `PostPrices`
  (`product`,`currency`,`unit_amount`,`recurring.interval`,`usage_type:'licensed'`),
  `PostProductsId` (`active:false` archives), `PostPricesPrice` (`active:false`
  deactivates). Prices immutable → hence read-only.

Plan starts here — no schema work, no frontend (admin SPA is separate repo).

## Phases

### Phase 1 — Shared Stripe module + error code + read-only prices

- **Why here:** first — Phase 2/3 need `STRIPE_CLIENT` in `AdminPlansService`
  (not reachable today); the DTO change is a 1-line gate.
- **Files — create:**
  - `apps/auth-service/src/billing/stripe.module.ts` —
    `@Module({ providers: [stripeClientProvider], exports: [STRIPE_CLIENT] })`.
- **Files — modify:**
  - `apps/auth-service/src/billing/billing.module.ts` — drop inline
    `stripeClientProvider`, `imports: [StripeModule]`.
  - `apps/auth-service/src/admin/admin.module.ts` — `imports: [StripeModule]`.
  - `libs/shared/contracts/src/lib/errors.ts` — add
    `STRIPE_SYNC_FAILED: { code:'STRIPE_SYNC_FAILED', statusCode: 500 }`.
  - `libs/shared/contracts/src/lib/dto/admin.dto.ts` — remove `priceMonthly` +
    `priceYearly` from `UpdatePlanDto` (keep on `CreatePlanDto`).
- **Shared contracts:** `STRIPE_SYNC_FAILED`; `UpdatePlanDto` price fields dropped.
- **Verify:** `pnpm nx typecheck @wriven/contracts @wriven/auth-service` clean on
  touched files; `AdminPlansService` can `@Inject(STRIPE_CLIENT)` and boot
  (`pnpm dev:auth`); `PATCH /admin/plans/:id` with `priceMonthly` → rejected.

### Phase 2 — `create()` syncs Stripe Product + Prices

- **Why here:** depends on Phase 1 (Stripe client in scope).
- **Files — modify:**
  - `apps/auth-service/src/admin/admin-plans.service.ts`:
    - `@Inject(STRIPE_CLIENT) private readonly stripe: Stripe`.
    - `create()` — for paid plans (`key !== 'free'`), **Stripe-first**: create
      Product (`name`,`description`,`metadata:{planKey}`) → monthly Price
      (`product`,`currency`,`unit_amount: priceMonthly`,
      `recurring:{interval:'month',usage_type:'licensed'}`) → yearly Price
      (interval `'year'`, `priceYearly`) → then insert the plan row **with the 3
      ids + amounts**. Free plan: insert as today.
    - On any Stripe failure → `throw rpcError('STRIPE_SYNC_FAILED', …)` before
      the DB insert.
    - Add a private `createPrices(product, currency, monthly, yearly)` helper
      returning `{ monthlyId, yearlyId }`.
- **Shared contracts:** none new.
- **Verify:** typecheck clean; `POST /admin/plans` (paid) → `admin.plans.list`
  shows populated `stripe_*` ids; Stripe dashboard / MCP `GetProducts`+`GetPrices`
  shows the new Product + 2 Prices. Free plan create skips Stripe. Stripe
  failure → `STRIPE_SYNC_FAILED`, no row.

### Phase 3 — retire (`active:false`) archives on Stripe

- **Why here:** depends on Phase 1.
- **Files — modify:**
  - `apps/auth-service/src/admin/admin-plans.service.ts` — `update()`:
    - If `d.active === false` and the row has `stripe_product_id` →
      `stripe.products.update(id, { active: false })` +
      `stripe.prices.update(monthlyId, { active:false })` +
      `stripe.prices.update(yearlyId, { active:false })` (best-effort; collect
      errors, throw `STRIPE_SYNC_FAILED` if any hard-fails). Then apply the DB
      patch.
    - Other field changes (`name`/`description`/`limits`/`features`/`active:true`)
      → local DB patch only, **no Stripe sync** (documented cosmetic drift on
      product name; `active:true` does not revive deactivated prices).
- **Shared contracts:** none.
- **Verify:** typecheck clean; `PATCH /admin/plans/:id { active:false }` →
  Stripe Product `active:false` + both Prices `active:false` (MCP); `/billing/checkout`
  for it then fails. Reactivating (`active:true`) flips the DB row but leaves
  Stripe prices deactivated (documented).

### Phase 4 — Docs

- **Why here:** last — doc-maintenance rule.
- **Files — modify:**
  - `doc/auth-service/auth-service.md` — Billing section: create/retire sync,
    read-only prices, manual price-change procedure (new Stripe price + repoint).
  - `doc/admin-panel/backend.md` — plan create creates Stripe objects; retire
    archives; prices read-only; `STRIPE_SYNC_FAILED`.
- **Shared contracts:** none.
- **Verify:** docs grep for the new behavior; no stale "local-only" claim.

## Risks / open questions

- **Reactivation asymmetry** — retiring deactivates Stripe Prices (irreversible);
  reactivating the DB row does NOT revive them. A retired-then-reactivated plan
  can't be purchased until manually re-linked. Documented; acceptable for "rare
  admin op." If true revive is wanted later, create new prices on `active:true`
  (deferred).
- **Stripe create isn't idempotent** — if the DB insert fails after Stripe
  create, a retry makes duplicate Stripe objects. Mitigated by Stripe-first +
  `STRIPE_SYNC_FAILED`; admin-only + rare. Optional `idempotencyKey` deferred.
- **Cosmetic product-name drift** — update name is local-only; the Stripe
  Product name stays as-created. Only affects receipt wording; accepted. (Could
  sync name cheaply later if wanted.)
- **No Stripe→DB price mirror** — the stored amount is set at create and frozen;
  changing a price is a manual ops task (new Stripe price + repoint + amount
  update). Intentional per the "keep it simple" decision.

## Out of scope

- Admin SPA UI (separate repo).
- Price editing via admin (read-only by design).
- Stripe→DB price mirror / `price.*` webhook sync.
- Hard `DELETE /admin/plans/:id` (retire = `active:false`).
- Reactivation creating new prices; subscriber migration; currency change;
  trials; metered prices; tax_code management.

## Definition of done

- [ ] Phase 1: shared `StripeModule`; `BillingModule` + `AdminModule` import it;
      `STRIPE_SYNC_FAILED` added; `UpdatePlanDto` price fields removed; typecheck
      clean; boot OK; price PATCH rejected.
- [ ] Phase 2: `POST /admin/plans` (paid) creates Stripe Product + 2 Prices +
      stores ids; free skips; Stripe failure → `STRIPE_SYNC_FAILED`, no row.
- [ ] Phase 3: `PATCH active:false` archives Stripe Product + deactivates Prices;
      other fields local-only.
- [ ] Phase 4: `doc/auth-service/auth-service.md` + `doc/admin-panel/backend.md`
      document sync + read-only prices + manual price-change procedure.
