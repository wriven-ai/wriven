# Spec: Stripe Billing & Subscriptions (Backend)

> Priority: P0 · Area: cross (auth + gateway + contracts) · Status: drafted

## Overview

Wire Stripe to the billing/entitlements scaffolding that already exists in
`auth-service`. The schema and quota-enforcement are done — `plans` and
`subscriptions` tables (migration `0008`), `PlanLimits`/`PlanFeatures`/
`WorkspaceEntitlements` contracts, `PLAN_LIMIT_REACHED` error code, and an
entitlements resolver (`auth.entitlements.resolve`) that every enforcement
call site already reads from. What is missing is the **payment path**:
Checkout, Customer Portal, and Stripe webhook → subscription reconciliation.
This is the #1 item under P0 in `doc/market-readiness.md` ("Billing
integration (Stripe) — XL", "you cannot charge anyone … every workspace is
effectively free"). **Backend only** in this spec; frontend wiring (Checkout
redirect, portal link, replacing the mock billing page) is a separate spec.

The key insight (verified in code): `EntitlementsService.resolveLimits` reads
**only** the `subscriptions` row + `plans.limits` + `subscriptions.overrides`.
Therefore the Stripe integration needs **zero changes to any enforcement call
site** — it only has to keep the `subscriptions` row in sync with Stripe, and
limits/quotas update automatically.

## Depends on

None (greenfield wiring over existing, already-migrated scaffolding):
- `auth_svc.plans` + `auth_svc.subscriptions` — created in migration
  `apps/auth-service/src/db/migrations/0008_good_captain_america.sql`.
- Entitlements resolver + quota enforcement — already live
  (`doc/admin-panel/backend.md`, `PLAN_LIMIT_REACHED`).

## Tooling context (skills / MCP / plugins)

- **Stripe MCP** (`plugin:stripe`) — checked, **used**. Mapped the exact
  resources/operations + webhook lifecycle via `stripe_api_search` (customer,
  subscription, price, product, webhook endpoint, invoice) and
  `search_stripe_documentation` (subscription lifecycle, Checkout for
  subscriptions, Customer Portal). Surfaced API version `2026-06-24.dahlia`.
  Note: `stripe_api_search` did **not** surface the Checkout-Session *create*
  or Subscription *create* ops (only list/retrieve/update) — both `POST`
  endpoints exist and are documented; use them directly via the SDK.
- **Supabase MCP** — available, read-only for DDL; migrations go through
  `pnpm db:auth:*` (session pooler `DIRECT_URL`), not the MCP. Not used for
  changes here.
- **Nx MCP** — for build/lint/typecheck/targets. Used during implementation,
  not for this draft.

## Scope

- In scope (backend):
  - Stripe SDK integration in `auth-service` (Customer, Checkout Session,
    Billing Portal Session, read Subscription).
  - Customer-facing billing endpoints on `api-gateway` → `auth-service` over
    TCP: list plans, get current subscription, create Checkout session,
    create Billing Portal session.
  - Public Stripe webhook receiver on `api-gateway` (raw body + signature
    verify) → forwards typed event to `auth-service` over TCP.
  - Webhook → `subscriptions` reconciliation (status, period, trial,
    Stripe IDs, plan via price-id mapping), idempotent + out-of-order safe.
  - New shared contracts: `BILLING_PATTERNS`, billing DTOs/types,
    `STRIPE_WEBHOOK_INVALID` error code.
  - One new table `stripe_events` (webhook idempotency log) in `auth_svc`.
  - Entitlements policy hook: map subscription `status` to effective limits
    (canceled → free; past_due grace configurable).
  - Backfill plan Stripe Product/Price IDs (setup task, not a migration).
- Out of scope:
  - Frontend (`apps/client`) — Checkout redirect, portal link, replacing the
    mock billing page (`apps/client/src/app/(dashboard)/w/[wsSlug]/billing/page.tsx`).
    Separate spec/commit.
  - Admin-panel SPA (separate repo) plan/subscription moderation — the admin
    `PUT /admin/workspaces/:id/plan` already exists and is reused as-is.
  - Usage-based metering (CDA requests/bandwidth/AI credits) —
    `PlanLimits` defines the ceilings but no counter pipeline exists; deferred.
  - Tax/VAT, multi-currency, coupons, overage billing, invoice PDF hosting.
  - Metered (usage-type) Stripe prices — v1 is flat per-tier `licensed` prices.
  - Core-side 30s entitlements cache invalidation on plan change (accepted
    eventual consistency; flagged as a known limitation).

## API / endpoints

Customer-facing (new, gateway → TCP `auth.billing.*`):
- `GET /api/v1/billing/plans` — list public+active plans (catalog for the
  billing page) — **workspace-member**
- `GET /api/v1/billing/subscription` — current workspace's subscription
  (plan, status, cycle, period, trial, cancel flag) — **workspace-member**
- `POST /api/v1/billing/checkout` — create a Stripe Checkout Session for an
  upgrade (body: `planKey`, `billingCycle`) → `{ url }` — **workspace-member**
  (owner/admin enforced server-side)
- `POST /api/v1/billing/portal` — create a Stripe Billing Portal session →
  `{ url }` (manage card, upgrade/downgrade, cancel) — **workspace-member**
  (owner/admin enforced server-side)

Inbound webhook (new, public):
- `POST /api/v1/webhooks/stripe` — Stripe-signed webhook receiver. **public**
  (no `JwtAuthGuard`; auth = `stripe.webhooks.constructEvent` over the raw
  body + `stripe-signature` header + `STRIPE_WEBHOOK_SECRET`). Verifies,
  returns 200 immediately, forwards the typed event to `auth.billing.stripeWebhook`.

No changes to existing endpoints. `auth.entitlements.resolve` and the admin
plan endpoints are reused unchanged.

## Shared contracts (@wriven/contracts)

New/changed (all in `libs/shared/contracts/src/lib/`):

- **`messages.ts`** — new `BILLING_PATTERNS` block (auth-service owns it,
  consistent with the `auth.entitlements.resolve` precedent; dot-namespaced):
  ```ts
  export const BILLING_PATTERNS = {
    LIST_PLANS: 'auth.billing.listPlans',
    GET_SUBSCRIPTION: 'auth.billing.getSubscription',
    CREATE_CHECKOUT: 'auth.billing.createCheckout',
    CREATE_PORTAL: 'auth.billing.createPortal',
    STRIPE_WEBHOOK: 'auth.billing.stripeWebhook',
  } as const;
  ```
- **`dto/billing.dto.ts`** (new; class-validator, model on `dto/admin.dto.ts`):
  - `CreateCheckoutSessionDto { planKey: 'pro'|'business'; billingCycle: 'monthly'|'yearly'; successUrl?: string; cancelUrl?: string }`
  - `CreatePortalSessionDto { returnUrl?: string }`
- **`types/billing.types.ts`** (new; interface-only, model on `types/admin.types.ts`):
  - `SubscriptionStatus = 'active'|'trialing'|'past_due'|'canceled'|'paused'|'incomplete'`
    (promote out of the inline `@IsIn` literal on `AssignPlanDto`; have
    `AssignPlanDto.status` and `AdminWorkspaceRow.subscriptionStatus` import it).
  - `SubscriptionView { planKey; planName; status: SubscriptionStatus; billingCycle: 'monthly'|'yearly'|null; currentPeriodStart: string|null; currentPeriodEnd: string|null; trialEndsAt: string|null; cancelAtPeriodEnd: boolean; hasPaymentMethod: boolean }`
  - `CheckoutSessionView { url: string; sessionId: string }`
  - `PortalSessionView { url: string }`
  - Reuse existing `PlanView` for the catalog (it already carries prices,
    limits, features).
- **`errors.ts`** — add `STRIPE_WEBHOOK_INVALID` → `{ code: 'STRIPE_WEBHOOK_INVALID', statusCode: 400 }`
  (signature verification failure). Also document the already-existing
  `PLAN_LIMIT_REACHED` in `doc/conventions.md` (it is in `errors.ts` but
  missing from the doc table — "code wins", fix the doc).
- **`src/index.ts`** (barrel) — add:
  ```ts
  export * from './lib/dto/billing.dto';
  export * from './lib/types/billing.types';
  ```

## Database / schema

- **New table `auth_svc.stripe_events`** (webhook idempotency + ordering log;
  Stripe delivers at-least-once, possibly duplicated/out-of-order). Add to
  `apps/auth-service/src/db/schema/index.ts` alongside `subscriptions`:
  ```ts
  export const stripeEvents = authSchema.table('stripe_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: text('event_id').notNull().unique(),   // Stripe evt_… — dedupe key
    eventType: text('event_type').notNull(),         // e.g. customer.subscription.updated
    payload: jsonb('payload'),                       // raw event (debug/replay)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }, (t) => [ index('stripe_events_type_idx').on(t.eventType) ]);
  ```
- **Migration**: `pnpm db:auth:generate` (produces `0009_*.sql`) →
  `pnpm db:auth:migrate` (applies via `DIRECT_URL`).
- **No change** to `plans` / `subscriptions` — every column the integration
  needs already exists (`stripe_customer_id`, `stripe_subscription_id`,
  `status`, `billing_cycle`, `current_period_start/end`, `trial_ends_at`,
  `cancel_at_period_end`, `canceled_at`, `overrides`, `updated_by`).
- **Setup (not a migration)** — backfill `plans.stripe_product_id` /
  `stripe_price_id_monthly` / `stripe_price_id_yearly` after creating the
  Products/Prices in Stripe (Dashboard, or via the connected Stripe MCP).
  Can be set through the existing `admin.plans.update` flow; the seed's
  `onConflictDoUpdate` deliberately omits these columns so reseeds won't
  clobber them.

## Backend changes

### api-gateway
- **Create:**
  - `apps/api-gateway/src/billing/billing.controller.ts` — customer-facing
    endpoints (`GET /billing/plans`, `GET /billing/subscription`,
    `POST /billing/checkout`, `POST /billing/portal`).
    `@UseGuards(JwtAuthGuard, WorkspaceGuard)`; inject `AUTH_SERVICE`; forward
    `{ userId, workspaceId, workspaceRole, dto }` to `BILLING_PATTERNS.*`.
    Model on `apps/api-gateway/src/members/workspaces.controller.ts`.
  - `apps/api-gateway/src/billing/stripe-webhook.controller.ts` —
    `POST /webhooks/stripe`, **no** `JwtAuthGuard` (public); reads
    `req.rawBody` via `@Req()` (no DTO — must not pass through `ValidationPipe`),
    verifies with `stripe.webhooks.constructEvent(rawBody, signature, secret)`,
    returns 200, forwards the typed event to `BILLING_PATTERNS.STRIPE_WEBHOOK`.
    Add `@SkipThrottle()` so legit Stripe retries aren't rate-limited.
- **Modify:**
  - `apps/api-gateway/src/main.ts` — `NestFactory.create(AppModule, { rawBody: true })`
    so `req.rawBody` is available for signature verification. (CSRF guard
    already short-circuits when no `access_token` cookie is present, so the
    unauthenticated webhook passes automatically — do not add it to
    `CSRF_EXEMPT`.)
  - `apps/api-gateway/src/app/app.module.ts` — register the two new controllers.
  - `apps/api-gateway/.env` — add `STRIPE_WEBHOOK_SECRET` (`whsec_…`).

### auth-service
- **Create:**
  - `apps/auth-service/src/billing/billing.module.ts`
  - `apps/auth-service/src/billing/billing.controller.ts` —
    `@MessagePattern(BILLING_PATTERNS.*)` handlers (listPlans,
    getSubscription, createCheckout, createPortal, stripeWebhook).
  - `apps/auth-service/src/billing/billing.service.ts` — Stripe SDK calls
    (create/retrieve Customer, create Checkout Session with
    `mode: 'subscription'`, create Billing Portal Session), reads/writes the
    `subscriptions` row. Owner/admin gating for mutations via `workspaceRole`
    from the payload.
  - `apps/auth-service/src/billing/stripe-client.provider.ts` — configured
    `Stripe` instance (reads `STRIPE_SECRET_KEY`, pinned `apiVersion`).
  - `apps/auth-service/src/billing/stripe-webhook.service.ts` — reconciles
    `subscriptions` from a verified event: maps `price.id` → plan via
    `plans.stripe_price_id_monthly|yearly`; upserts `subscriptions`
    (`status` from Stripe status, `billing_cycle`, period timestamps,
    `trial_ends_at`, `stripe_customer_id`, `stripe_subscription_id`,
    `cancel_at_period_end`); dedupes by inserting `event_id` into
    `stripe_events` (unique → conflict = already processed, no-op); handles
    events out of order by always re-deriving state from the event payload.
  - `apps/auth-service/.env` — add `STRIPE_SECRET_KEY` (`sk_test_…`/`sk_live_…`),
    `STRIPE_WEBHOOK_SECRET` (if auth also needs to verify a forwarded event —
    otherwise gateway-only), `BILLING_GRACE_DAYS` (past_due grace, default 7).
- **Modify:**
  - `apps/auth-service/src/app/app.module.ts` — import `BillingModule`.
  - `apps/auth-service/src/auth/entitlements.service.ts` (`resolveLimits`) —
    add a small status policy: if the subscription `status` is `canceled`
    (and grace elapsed) → resolve to the `free` plan's limits; `trialing` /
    `active` / `past_due` (within grace) / `paused` → the row's plan limits.
    Keeps the existing `plan.limits ⊕ overrides` composition; only the
    *which-plan* step gains a status check.
- Reused unchanged: `auth.service.ts` / `workspaces.service.ts` already
  insert the free `subscriptions` row on workspace create.

### core-service
- **No changes.** Enforcement already calls `auth.entitlements.resolve`.
  Known limitation: core caches limits for 30s
  (`apps/core-service/src/entitlements/core-entitlements.service.ts`), so a
  Stripe-driven downgrade takes up to 30s to start blocking core-side creates.
  Acceptable for v1; cache-invalidation hook deferred.

### ai-service
- No changes (out of scope; AI metering deferred).

## Frontend changes (apps/client)

No frontend changes in this spec (backend-only). The mock billing page at
`apps/client/src/app/(dashboard)/w/[wsSlug]/billing/page.tsx` (currently
`free/pro/team` hardcoded cards) is replaced in a later frontend spec that
consumes `GET /billing/plans`, `GET /billing/subscription`,
`POST /billing/checkout`, `POST /billing/portal`.

## Files to create
- `libs/shared/contracts/src/lib/dto/billing.dto.ts`
- `libs/shared/contracts/src/lib/types/billing.types.ts`
- `apps/api-gateway/src/billing/billing.controller.ts`
- `apps/api-gateway/src/billing/stripe-webhook.controller.ts`
- `apps/auth-service/src/billing/billing.module.ts`
- `apps/auth-service/src/billing/billing.controller.ts`
- `apps/auth-service/src/billing/billing.service.ts`
- `apps/auth-service/src/billing/stripe-client.provider.ts`
- `apps/auth-service/src/billing/stripe-webhook.service.ts`
- `apps/auth-service/src/db/migrations/0009_*.sql` (generated)

## Files to modify
- `libs/shared/contracts/src/lib/messages.ts` (add `BILLING_PATTERNS`)
- `libs/shared/contracts/src/lib/errors.ts` (add `STRIPE_WEBHOOK_INVALID`)
- `libs/shared/contracts/src/lib/dto/admin.dto.ts` (import shared `SubscriptionStatus`)
- `libs/shared/contracts/src/index.ts` (barrel exports)
- `apps/api-gateway/src/main.ts` (`rawBody: true`)
- `apps/api-gateway/src/app/app.module.ts` (register billing controllers)
- `apps/auth-service/src/app/app.module.ts` (import `BillingModule`)
- `apps/auth-service/src/auth/entitlements.service.ts` (status policy)
- `apps/auth-service/src/db/schema/index.ts` (add `stripeEvents` table)
- `apps/auth-service/.env` + `apps/api-gateway/.env` (Stripe secrets)
- `doc/conventions.md` (document `PLAN_LIMIT_REACHED`; add billing codes)
- `doc/api-reference.md` (add `/billing/*` + `/webhooks/stripe`)
- `doc/auth-service/auth-service.md` (new billing module)
- `doc/status.md` + `doc/market-readiness.md` (mark billing in progress / done)

## New dependencies

- `stripe` (Node SDK, ships its own types) — added to **both** `api-gateway`
  (webhook `constructEvent`) and `auth-service` (Customer/Checkout/Portal
  API). Exact version pinned at install; configure `apiVersion` to match the
  account. No pip packages.

## Rules for implementation

Base (always include):
- Define shared DTOs/types/patterns/errors in `libs/shared/contracts`
  (`@wriven/contracts`) — check it before creating new ones.
- Store only R2 object **keys** in the DB; reconstruct URLs at runtime.
- Respect microservice boundaries — do not collapse auth/core/ai logic.
  Billing lives in `auth-service` (no new service, no new schema).
- Endpoints return the response envelope; use error codes from
  `@wriven/contracts/errors.ts`; never leak stack traces, internal service
  names, or DB errors.
- Use dot-namespaced patterns from `@wriven/contracts/messages.ts`, never
  hardcoded strings.
- Frontend (`apps/client`) and backend changes go in **separate commits**;
  stage selectively, never `git add -A` across both.
- Run tasks through `pnpm nx <target> <project>`. Commits are one-line
  Conventional Commits with no body. No AI co-author trailer.

Feature-specific:
- **Webhook auth ≠ JWT.** The Stripe route is public; its only auth is
  `stripe.webhooks.constructEvent` over the **raw** body + `stripe-signature`
  header + `STRIPE_WEBHOOK_SECRET`. Never put `JwtAuthGuard` on it.
- **Raw body is mandatory.** Enable `{ rawBody: true }` on the gateway;
  the webhook handler must read `req.rawBody` and **not** declare a DTO
  (`ValidationPipe` with `forbidNonWhitelisted` would reject the Stripe
  payload).
- **Never provision from the `success_url` redirect** (user can hit it
  directly or close the tab). Provision only from the
  `checkout.session.completed` webhook.
- **Idempotency + ordering.** Persist `event.id` in `stripe_events`
  (unique); conflict = no-op. Re-derive subscription state from each event
  payload so out-of-order delivery is safe.
- **Plan mapping via price id.** Map Stripe `price.id` → plan through
  `plans.stripe_price_id_monthly|yearly` (never hardcode plan keys in the
  webhook). Unknown price id → log + no-op (don't crash the webhook).
- **`updated_by` for webhook writes** = `null` (column is nullable; webhooks
  have no admin user).
- **Secrets per service `.env`** — `STRIPE_SECRET_KEY` on auth-service,
  `STRIPE_WEBHOOK_SECRET` on the gateway (and auth-service if it verifies).
  Never commit secrets; separate test/live keys.
- **Test mode.** Use `sk_test_…` + `whsec_…` (sandbox); test card
  `4242 4242 4242 4242` (success), `4000 0000 0000 0341` (decline) for
  dunning. Pin `apiVersion` on the client and the webhook endpoint.
- **Acknowledge fast.** Webhook returns 200 before heavy work; reconciliation
  is cheap/synchronous here but must stay sub-second so Stripe doesn't retry.

## Definition of done

- [ ] `pnpm nx typecheck shared-contracts` (or `@wriven/contracts` target)
      passes; `BILLING_PATTERNS`, billing DTOs/types, `STRIPE_WEBHOOK_INVALID`
      exported from the barrel.
- [ ] `pnpm db:auth:generate` produces **only** the `stripe_events` table
      (no drift on `plans`/`subscriptions`); `pnpm db:auth:migrate` applies
      cleanly.
- [ ] `pnpm nx build api-gateway` + `pnpm nx build auth-service` pass;
      `pnpm nx lint` + `pnpm nx typecheck` clean on both.
- [ ] `GET /api/v1/billing/plans` returns the 3 seeded plans
      (`free`/`pro`/`business`) with prices/limits/features.
- [ ] `GET /api/v1/billing/subscription` returns the workspace's current
      (free) subscription.
- [ ] `POST /api/v1/billing/checkout` (test mode) returns a Stripe Checkout
      `url`; completing it (test card) fires `checkout.session.completed`.
- [ ] `POST /api/v1/webhooks/stripe` rejects a bad signature with
      `STRIPE_WEBHOOK_INVALID` (400); accepts a signed event and updates the
      `subscriptions` row (status, period, `stripe_subscription_id`,
      `stripe_customer_id`, plan from price id).
- [ ] Replayed/duplicated webhook event is a no-op (`stripe_events.event_id`
      unique conflict).
- [ ] After a paid subscription, `auth.entitlements.resolve` returns the new
      plan's limits (quota enforcement reflects the upgrade); after
      `customer.subscription.deleted` + grace, it reverts to free limits.
- [ ] `POST /api/v1/billing/portal` returns a Billing Portal `url`.
- [ ] Plans' `stripe_product_id` / `stripe_price_id_monthly|yearly` backfilled
      (visible via `admin.plans.list`).
- [ ] `doc/conventions.md`, `doc/api-reference.md`, `doc/auth-service/`,
      `doc/status.md` updated (doc-maintenance rule).

## Open questions / decisions deferred (resolve in plan mode)

1. **Customer creation timing** — eager (at workspace create, $0 customer) vs
   lazy (first Checkout via `customer_email`). Default: lazy.
2. **Dunning outcome** — after Smart Retries exhaust: cancel, mark `unpaid`
   (keep data, block access), or leave open. Affects the status policy.
3. **Over-quota on downgrade** — workspace on `business` (unlimited projects)
   downgrading to `pro` (10) while holding 25 projects: block / allow-overage
   / soft-warn. Not enforced today.
4. **Proration policy** — `always_invoice` (charge now) vs
   `create_prations` (defer) on mid-cycle changes via Portal.
5. **Auth level for mutations** — owner-only vs owner/admin for checkout +
   portal. Default: owner/admin (server-side via `workspaceRole`).
6. **Portal vs custom plan management** — default to Stripe Customer Portal
   (least code); custom in-app upgrade UI is a frontend-spec concern.
