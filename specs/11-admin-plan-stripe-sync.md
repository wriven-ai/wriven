# Spec: Admin Plan ↔ Stripe Sync

> Priority: P2 · Area: cross (auth + admin + contracts) · Status: drafted

## Overview

Make admin plan management **two-way**: creating / updating / deactivating a
plan in the admin panel creates / updates / archives the corresponding Stripe
**Product + Prices**, so the local `auth_svc.plans` row and Stripe never drift.
Today `AdminPlansService` is local-DB-only — it sets nothing on Stripe, so a new
plan can't be purchased (`stripe_price_id_*` empty → `INTERNAL_ERROR`), editing a
price changes the displayed amount but not what Stripe **charges** (drift:
advertise $25, bill $29), and deactivating a plan leaves the Stripe Product/Price
live (existing subs keep billing). This closes that gap and ties to the billing
module shipped in [specs/08](./08-stripe-billing.md).

## Depends on

- [specs/08-stripe-billing.md](./08-stripe-billing.md) — **done**. Provides the
  Stripe client (`STRIPE_CLIENT`), the `plans.stripe_product_id` /
  `stripe_price_id_monthly` / `stripe_price_id_yearly` columns, and the
  `currency`/`price_monthly`/`price_yearly` fields.

## Tooling context (skills / MCP / plugins)

- **Stripe MCP** (`plugin:stripe`) — checked, **used** (during specs/08 + 10).
  Confirmed the exact ops + Stripe constraints this spec relies on:
  `PostProducts` (create), `PostPrices` (create, needs `product`, `currency`,
  `unit_amount`, `recurring.interval`, `usage_type:'licensed'`), `PostProductsId`
  (update name/description; `active:false` **archives** the product),
  `PostPricesPrice` (`active:false` **deactivates** a price). **Critical
  constraints:** Stripe **Prices are immutable** — `unit_amount` cannot be
  changed, so a price change = create a new Price + repoint the plan's
  `stripe_price_id_*` + deactivate the old; **deactivating a Price is
  irreversible** (cannot be reactivated — reactivating a plan needs new Prices).

## Scope

- In scope:
  - **Create plan** → create a Stripe Product + monthly + yearly Prices (for
    paid plans) → store the 3 IDs on the plan row. (Free plan: no Stripe
    objects — `key === 'free'` skips sync.)
  - **Update plan** → sync to Stripe:
    - `name` / `description` → update the Stripe Product.
    - `priceMonthly` / `priceYearly` changed → create a **new** Price, repoint
      the column, deactivate the old Price (immutability).
    - `active` → archive (`false`) / un-archive (`true`) the Product; on archive,
      deactivate its Prices; on un-archive after prices were deactivated, create
      **new** Prices (deactivation is irreversible).
    - `limits` / `features` → local only (no Stripe equivalent).
  - **No hard-delete** — there is no delete route today; deactivation
    (`active:false`) is the retirement path.
- Out of scope:
  - Migrating **existing subscribers** to a new price when the amount changes
    (Stripe keeps each subscription on the Price it was created at — intentional;
    admin can use the Customer Portal / `stripe.subscriptions.update` later).
  - Currency change (fixed `usd` for v1; currency is set at Price creation).
  - Trials (removed in specs/08), metered/tiered prices, tax_code management
    (already set on the products), metering.
  - Admin-panel SPA UI changes — **separate repo**; the backend sync is
    transparent to it (same request/response shapes; it just surfaces
    `STRIPE_SYNC_FAILED` on errors).

## API / endpoints

No new endpoints — extends the existing admin routes (RBAC-gated, admin-token):
- `POST /admin/plans` (create) — now also creates Stripe Product + Prices.
- `PATCH /admin/plans/:id` (update) — now also syncs Stripe per changed field.

## Shared contracts (@wriven/contracts)

- `errors.ts` — add `STRIPE_SYNC_FAILED` →
  `{ code: 'STRIPE_SYNC_FAILED', statusCode: 500 }` (a Stripe call failed
  mid-sync; the DB write is skipped so the row isn't left half-linked).
- DTOs unchanged (`CreatePlanDto` / `UpdatePlanDto` already carry the price +
  active fields; `stripe_*` IDs stay system-managed, never client-set).

## Database / schema

No schema changes — reuses the existing `plans.stripe_product_id` /
`stripe_price_id_monthly` / `stripe_price_id_yearly` columns (specs/08).

## Backend changes

### auth-service
- **Modify `admin/admin-plans.service.ts`** — inject `STRIPE_CLIENT`; in:
  - `create()` — after the DB insert (or before, to capture IDs): for paid plans,
    create Product + monthly/yearly Prices, then write the 3 IDs back onto the
    row. Free plan skips Stripe.
  - `update()` — for each changed field, perform the matching Stripe op (see
    Scope). Do **Stripe-first** for ID-producing ops (new price) so the DB only
    commits on success; deactivate-old is best-effort after the repoint.
  - On any Stripe failure → `throw rpcError('STRIPE_SYNC_FAILED', …)` and do not
    persist the DB patch (keep the row consistent with Stripe).
- **Stripe provider DI** — `STRIPE_CLIENT` currently lives in `BillingModule`
  (not exported). Make it available to `AdminModule`: either export it from
  `BillingModule` and have `AdminModule` import `BillingModule`, **or** extract
  `stripe-client.provider.ts` into a small shared `StripeModule` both import
  (cleaner — recommended). Decision in plan mode.
- **Modify `admin/admin.module.ts`** — import the Stripe provider module.

### api-gateway
- No changes — the gateway only forwards to the existing `admin.plans.*`
  patterns.

## Frontend changes (apps/client)

None — the admin panel is a separate repo. The backend sync is transparent
(unchanged request/response shapes). The admin SPA may later surface
`STRIPE_SYNC_FAILED` and confirm price-change/deactivation (separate-repo
concern, not in scope here).

## Files to create

- (optional) `apps/auth-service/src/billing/stripe.module.ts` — shared Stripe
  provider module, if the extract option is chosen.

## Files to modify

- `apps/auth-service/src/admin/admin-plans.service.ts` — Stripe sync in
  create/update.
- `apps/auth-service/src/admin/admin.module.ts` — import the Stripe provider.
- `apps/auth-service/src/billing/billing.module.ts` — export `STRIPE_CLIENT`
  (if the export option is chosen instead of a shared module).
- `libs/shared/contracts/src/lib/errors.ts` — add `STRIPE_SYNC_FAILED`.
- `doc/auth-service/auth-service.md` + `doc/admin-panel/backend.md` — document
  the two-way sync + the immutability/irreversibility constraints.

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
- **Stripe is the source of truth for charge amounts.** The DB `price_*` is
  display-only until synced; never let them diverge silently.
- **Prices are immutable.** An amount change = create a new Price + repoint the
  `stripe_price_id_*` column + deactivate the old. Never try to update a Price's
  `unit_amount`.
- **Price deactivation is irreversible.** Deactivating a plan deactivates its
  Prices; reactivating must create **new** Prices (the old ids are dead).
- **Existing subscribers are not auto-migrated** when a price changes — they stay
  on the Price they subscribed at (Stripe behavior). Intentional; document it.
- **Stripe-first for ID-producing ops.** Create the Stripe object, capture the id,
  then write the DB row — so a Stripe failure can't leave a half-linked plan.
- **Free plan never touches Stripe** (`key === 'free'` — no Product/Price).
- **Admin-only + irreversible** — these routes are already admin-RBAC-gated; the
  irreversibility of price/deactivation changes means the (separate-repo) admin
  UI should confirm before applying (flagged, not built here).

## Definition of done

- [ ] `pnpm nx typecheck` clean on touched backend files; `pnpm nx lint` clean.
- [ ] `POST /admin/plans` for a paid plan → Stripe Product + 2 Prices created,
      and the plan row's `stripe_product_id` / `stripe_price_id_monthly` /
      `stripe_price_id_yearly` populated (visible via `admin.plans.list`).
- [ ] `PATCH /admin/plans/:id` `name` → Stripe Product name updates.
- [ ] `PATCH /admin/plans/:id` `priceMonthly` → a **new** Stripe Price is created,
      `stripe_price_id_monthly` repointed, old Price deactivated; existing
      subscriptions remain on the old price.
- [ ] `PATCH /admin/plans/:id` `active:false` → Product archived + Prices
      deactivated; `/billing/checkout` for that plan then refuses
      (`INTERNAL_ERROR` / not linked) until reactivated.
- [ ] A Stripe API failure mid-sync → `STRIPE_SYNC_FAILED` (500) and the DB row
      is **not** left half-linked.
- [ ] `doc/auth-service/auth-service.md` + `doc/admin-panel/backend.md` document
      the sync + the immutability / irreversibility constraints.
