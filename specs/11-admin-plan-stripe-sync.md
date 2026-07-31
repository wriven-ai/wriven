# Spec: Admin Plan Create/Delete ↔ Stripe Sync

> Priority: P2 · Area: cross (auth + admin + contracts) · Status: drafted

## Overview

Make admin plan **create** and **delete** two-way with Stripe — and **nothing
else**. Creating a paid plan also creates the Stripe Product + monthly/yearly
Prices and stores their ids; retiring a plan (`active:false`) archives the Stripe
Product + deactivates its Prices. Prices are **read-only** after create (the
industry-standard model: Stripe owns pricing; the app doesn't push price edits).
This closes the two real gaps from [specs/08](./08-stripe-billing.md): a new
admin plan is immediately purchasable (no manual Dashboard + SQL backfill), and
retiring a plan also retires it on Stripe.

## Depends on

- [specs/08-stripe-billing.md](./08-stripe-billing.md) — **done**. Provides the
  Stripe client (`STRIPE_CLIENT`), the `plans.stripe_product_id` /
  `stripe_price_id_monthly` / `stripe_price_id_yearly` columns, and the price +
  currency fields.

## Tooling context (skills / MCP / plugins)

- **Stripe MCP** (`plugin:stripe`) — checked, **used** (specs/08/10). Confirmed
  ops: `PostProducts` (create), `PostPrices` (create; needs `product`,
  `currency`, `unit_amount`, `recurring.interval`, `usage_type:'licensed'`),
  `PostProductsId` (`active:false` **archives** the product), `PostPricesPrice`
  (`active:false` **deactivates** a price). Constraint: **Stripe Prices are
  immutable** — which is exactly why this spec makes them read-only rather than
  editable.

## Scope

- In scope:
  - **Create plan** (paid) → create Stripe Product + monthly + yearly Prices →
    store the 3 ids on the row. (Free plan: no Stripe objects.)
  - **Retire plan** (`PATCH active:false`) → archive the Stripe Product +
    deactivate its Prices. (`active:true` reactivates the DB row; it does **not**
    revive deactivated Stripe Prices — they're irreversible; a retired plan
    that's reactivated must be re-linked to prices manually, documented.)
  - **Prices read-only after create** — remove `priceMonthly` / `priceYearly`
    from `UpdatePlanDto` so the backend rejects price edits (admin SPA is a
    separate repo; it will simply not offer the field).
  - Other update fields (`name`/`description`/`limits`/`features`) → **local
    only**, no Stripe sync (cosmetic: the Stripe Product name/description may
    drift from the DB; acceptable + documented).
- Out of scope:
  - **Price changes** — not supported via admin (Stripe Prices are immutable;
    changing a price = create a new Price in Stripe + manually repoint the plan's
    `stripe_price_id_*` + update the stored amount). Manual ops task, documented.
  - A hard `DELETE /admin/plans/:id` route — retirement is via `active:false`
    (soft). Add later if a hard delete is wanted.
  - Reading/mirroring prices FROM Stripe (webhook `price.*` sync) — not needed;
    the amount is set at create and frozen.
  - Subscriber migration, currency change, trials, metered prices, tax_code
    management, admin SPA UI (separate repo).

## API / endpoints

No new endpoints — extends the existing admin routes (RBAC-gated, admin-token):
- `POST /admin/plans` (create) — now also creates Stripe Product + Prices.
- `PATCH /admin/plans/:id` — `active:false` now archives on Stripe; price fields
  no longer accepted; other fields local-only.

## Shared contracts (@wriven/contracts)

- `errors.ts` — add `STRIPE_SYNC_FAILED` →
  `{ code: 'STRIPE_SYNC_FAILED', statusCode: 500 }` (a Stripe call failed; the
  DB write is skipped so the row isn't left half-linked).
- `dto/admin.dto.ts` — remove `priceMonthly` / `priceYearly` from `UpdatePlanDto`
  (kept on `CreatePlanDto` — set once at create).

## Database / schema

No schema changes — reuses the existing `plans.stripe_*` columns (specs/08).

## Backend changes

### auth-service
- **Modify `admin/admin-plans.service.ts`** — inject `STRIPE_CLIENT`:
  - `create()` — for paid plans (`key !== 'free'`), **Stripe-first**: create
    Product + monthly + yearly Prices, then insert the plan row with the 3 ids
    (and the amounts from the create DTO). Free plan inserts as today.
  - `update()` — if `active` is being set to `false` and the row has a
    `stripe_product_id`: archive the Product (`active:false`) + deactivate both
    Prices. Other field changes: local patch only (no Stripe). Price fields are
    no longer in the DTO, so they can't arrive here.
  - On Stripe failure → `throw rpcError('STRIPE_SYNC_FAILED', …)`; for create,
    throw before the DB insert (no half-linked row).
- **Stripe provider DI** — `STRIPE_CLIENT` is declared in `BillingModule` and
  not exported. Make it reachable from `AdminModule` by extracting a shared
  `StripeModule` (provider + `exports: [STRIPE_CLIENT]`) that both
  `BillingModule` and `AdminModule` import.
- **Modify `admin/admin.module.ts`** — `imports: [StripeModule]`.
- **Modify `billing/billing.module.ts`** — drop the inline `stripeClientProvider`,
  `imports: [StripeModule]`.

### api-gateway
- No changes — forwards to the existing `admin.plans.*` patterns unchanged.

## Frontend changes (apps/client)

None — the admin panel is a separate repo. The backend sync is transparent
(unchanged request/response shapes). The admin SPA will separately stop offering
price edits on the update form (`priceMonthly`/`priceYearly` rejected by the
backend) + may surface `STRIPE_SYNC_FAILED`.

## Files to create

- `apps/auth-service/src/billing/stripe.module.ts` — shared Stripe provider
  module.

## Files to modify

- `apps/auth-service/src/admin/admin-plans.service.ts` — create + retire sync.
- `apps/auth-service/src/admin/admin.module.ts` — import `StripeModule`.
- `apps/auth-service/src/billing/billing.module.ts` — import `StripeModule`
  (drop inline provider).
- `libs/shared/contracts/src/lib/errors.ts` — add `STRIPE_SYNC_FAILED`.
- `libs/shared/contracts/src/lib/dto/admin.dto.ts` — drop price fields from
  `UpdatePlanDto`.
- `doc/auth-service/auth-service.md` + `doc/admin-panel/backend.md` — document
  create/retire sync, read-only prices, the manual price-change procedure.

## New dependencies

None — `stripe` is already in `apps/auth-service`.

## Rules for implementation

Base:
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
  Conventional Commits with no body.

Feature-specific:
- **Stripe owns pricing; the app never pushes price edits.** Prices are set once
  at create; read-only after.
- **Sync only on create + retire.** Update of name/limits/features is local-only
  (Stripe Product name may drift cosmetically — accepted).
- **Stripe-first on create** — create Product + Prices, capture ids, then write
  the DB row, so a Stripe failure can't leave a half-linked plan.
- **Retire = archive, not hard-delete** — `active:false` archives the Stripe
  Product + deactivates Prices; reactivation doesn't revive deactivated Prices
  (irreversible) — re-link manually.
- **Free plan never touches Stripe** (`key === 'free'`).
- To **change a price** (not via admin): create a new Price in Stripe, manually
  repoint the plan's `stripe_price_id_*` + update the stored amount. Existing
  subscribers are grandfathered on the old price. Documented; out of scope here.

## Definition of done

- [ ] `pnpm nx typecheck` clean on touched backend files; `pnpm nx lint` clean.
- [ ] `POST /admin/plans` for a paid plan → Stripe Product + 2 Prices created,
      row's `stripe_product_id` / `stripe_price_id_monthly` /
      `stripe_price_id_yearly` populated; free plan skips Stripe.
- [ ] `PATCH /admin/plans/:id` with `priceMonthly`/`priceYearly` → rejected
      (read-only).
- [ ] `PATCH /admin/plans/:id` `active:false` → Stripe Product archived + Prices
      deactivated; `/billing/checkout` for it then fails until re-linked.
- [ ] A Stripe failure mid-create → `STRIPE_SYNC_FAILED` (500), no half-linked row.
- [ ] `doc/auth-service/auth-service.md` + `doc/admin-panel/backend.md` document
      the sync + the read-only-price + manual-price-change procedure.
