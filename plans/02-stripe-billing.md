# Plan: Stripe Billing & Subscriptions (Backend) — v2

> Status: drafted · Executes: spec 08 (`specs/08-stripe-billing.md`) · Supersedes: v1 draft
> v2 changes: transaction-atomic webhook processing, event-payload-derived status
> (not event-type-derived), grace-period policy called out for explicit sign-off,
> sending-side idempotency keys, unknown-price alerting, webhook 5xx-on-downstream-failure,
> and a day-one event replay script.

## Goal

Wire Stripe (Checkout, Billing Portal, webhook → subscription reconciliation) to
the existing `plans`/`subscriptions` schema in `auth-service`, so a workspace
can actually upgrade and pay — entitlements/quotas already read the
`subscriptions` row, so the integration changes zero enforcement call sites.

## Current state

Already built (do not re-do):
- `auth_svc.plans` + `auth_svc.subscriptions` tables — migration `0008_good_captain_america.sql`;
  all Stripe columns present and nullable (`stripe_customer_id`,
  `stripe_subscription_id`, `status`, `billing_cycle`, period/trial/cancel cols,
  `overrides`, `updated_by`). `apps/auth-service/src/db/schema/index.ts:430-518`.
- 3 seeded plans `free`/`pro`/`business` — `apps/auth-service/src/db/seed.ts:24-118`
  (prices in cents; seed `onConflictDoUpdate` deliberately omits `stripe_*` cols).
- Free `subscriptions` row auto-created on workspace create —
  `auth.service.ts:136` (register), `:433` (googleLogin), `workspaces.service.ts:75`.
- Entitlements resolver `apps/auth-service/src/auth/entitlements.service.ts:46`
  `resolveLimits` — reads `subscriptions`+`plan.limits`+`overrides`; enforcement
  (`assertProjectQuotaTx`/`assertMemberQuotaTx`, core-side soft caps) already calls it.
- Contracts: `PlanLimits`/`PlanFeatures`/`WorkspaceEntitlements`/`PlanView`
  (`types/admin.types.ts`), `PLAN_LIMIT_REACHED` error (`errors.ts`),
  `auth.entitlements.resolve` + `admin.workspaces.setPlan` + `admin.plans.*`
  patterns (`messages.ts`).
- Admin plan assignment `PUT /admin/workspaces/:id/plan` → `AdminPlansService.assign`
  (atomic upsert on `subscriptions.workspaceId`) — reused as-is.
- Gateway guard stack + `firstValueFrom(this.auth.send(PATTERN, {…}))` TCP pattern
  (`apps/api-gateway/src/members/workspaces.controller.ts`), `ConfigModule` global
  (`envFilePath: 'apps/<svc>/.env'`), per-app `package.json`.

Not present (this plan builds it): `stripe` SDK, `BILLING_PATTERNS`, billing
DTOs/types, `STRIPE_WEBHOOK_INVALID` code, `stripe_events` idempotency table,
billing module (auth-service), billing + webhook controllers (gateway),
`rawBody` on the gateway, status→limits policy, day-one event replay script.

## Phases

### Phase 1 — Shared contracts

- **Why here:** first — every service imports from `@wriven/contracts`; nothing
  else compiles until the patterns/DTOs/types exist.
- **Files — create:**
  - `libs/shared/contracts/src/lib/dto/billing.dto.ts` — `CreateCheckoutSessionDto`
    (`planKey: 'pro'|'business'`, `billingCycle: 'monthly'|'yearly'`,
    optional `successUrl`/`cancelUrl`), `CreatePortalSessionDto` (optional
    `returnUrl`). class-validator decorators; model on `dto/admin.dto.ts`.
  - `libs/shared/contracts/src/lib/types/billing.types.ts` —
    `SubscriptionStatus` union (promote out of `AssignPlanDto`'s inline `@IsIn`),
    `SubscriptionView`, `CheckoutSessionView { url, sessionId }`,
    `PortalSessionView { url }`. Reuse existing `PlanView` for the catalog.
- **Files — modify:**
  - `libs/shared/contracts/src/lib/messages.ts` — add `BILLING_PATTERNS`:
    `LIST_PLANS='auth.billing.listPlans'`, `GET_SUBSCRIPTION='auth.billing.getSubscription'`,
    `CREATE_CHECKOUT='auth.billing.createCheckout'`, `CREATE_PORTAL='auth.billing.createPortal'`,
    `STRIPE_WEBHOOK='auth.billing.stripeWebhook'`.
  - `libs/shared/contracts/src/lib/errors.ts` — add
    `STRIPE_WEBHOOK_INVALID: { code:'STRIPE_WEBHOOK_INVALID', statusCode:400 }`.
  - `libs/shared/contracts/src/lib/dto/admin.dto.ts` — `AssignPlanDto.status`
    imports shared `SubscriptionStatus` (remove inline literal).
  - `libs/shared/contracts/src/index.ts` — barrel: `export * from './lib/dto/billing.dto'`
    + `export * from './lib/types/billing.types'`.
- **Shared contracts:** (this phase *is* the contracts).
- **Verify:** `pnpm nx typecheck shared-contracts` (confirm project name via
  `pnpm nx show projects | grep contract`); `grep -n "BILLING_PATTERNS\|STRIPE_WEBHOOK_INVALID" libs/shared/contracts/src/index.ts` resolves through the barrel.

### Phase 2 — Schema: `stripe_events` idempotency table

- **Why here:** webhook handler (Phase 3) needs the dedupe table; migration is
  independent of code but must land before e2e.
- **Files — modify:**
  - `apps/auth-service/src/db/schema/index.ts` — add `stripeEvents` table:
    - `id` uuid PK
    - `eventId` text unique — Stripe's `event.id`
    - `eventType` text — indexed
    - `eventCreatedAt` timestamptz — **new in v2**: Stripe's `event.created`
      (unix timestamp → timestamptz), used to reject stale/out-of-order events
      against the current `subscriptions` row (see Phase 3 ordering guard)
    - `payload` jsonb
    - `createdAt` timestamptz (row insert time, distinct from `eventCreatedAt`)
- **Files — create:**
  - `apps/auth-service/src/db/migrations/0009_*.sql` — **generated**, not hand-written.
- **Verify:** `pnpm db:auth:generate` → confirm the generated SQL adds **only**
  `stripe_events` (no drift on `plans`/`subscriptions`); `pnpm db:auth:migrate`
  applies cleanly; `pnpm db:auth:studio` (or Supabase `list_tables`) shows
  `auth_svc.stripe_events`.

### Phase 3 — auth-service billing module

- **Why here:** depends on Phase 1 contracts + Phase 2 table; produces the TCP
  handlers the gateway (Phase 4) calls.
- **Files — create:**
  - `apps/auth-service/src/billing/stripe-client.provider.ts` — `{ provide: 'STRIPE' }`.
    **Fail-fast at boot:** ConfigModule has no Joi schema, so guard here — read
    `cfg.get('STRIPE_SECRET_KEY')`; if `!key` throw
    `new Error('STRIPE_SECRET_KEY is not set')`. Then
    `new Stripe(key, { apiVersion: '<pinned stable>' })`. **v2: pin the same
    version string on the Stripe Dashboard webhook endpoint config** (Workbench →
    webhook → API version), not just the SDK client — these are independently
    configurable and drift silently if only one is set.
  - `apps/auth-service/src/billing/billing.service.ts` —
    `listPlans()` (active+public), `getSubscription(workspaceId)` → `SubscriptionView`,
    `createCheckout({workspaceId, userId, email, planKey, billingCycle, successUrl, cancelUrl})`
    — find/create Customer with `metadata.workspaceId`; `mode:'subscription'`;
    `line_items:[{price: plan.stripePriceIdMonthly|Yearly}]`;
    `subscription_data.trial_period_days: plan.trialDays`; `client_reference_id: workspaceId`;
    `subscription_data.metadata.{workspaceId,planKey,billingCycle}`.
    **v2: pass a deterministic `Idempotency-Key`** on the `stripe.checkout.sessions.create`
    call, e.g. `checkout:${workspaceId}:${planKey}:${billingCycle}:${dayBucket}` —
    protects against duplicate sessions from double-click / client retry. Stripe
    SDK supports this as `{ idempotencyKey }` in the request options arg.
    `createPortal({workspaceId, returnUrl})` (portal session on the workspace's
    `stripe_customer_id`). Owner/admin gate on mutations via `workspaceRole`
    (**confirm owner-only vs owner/admin before Phase 5** — still an open question,
    see Risks).
  - `apps/auth-service/src/billing/stripe-webhook.service.ts` —
    `handleEvent(event)`, **v2: rewritten for transaction atomicity and
    payload-derived state:**
    1. Open a single DB transaction for the whole handler.
    2. Insert `event.id` into `stripe_events` inside that transaction. On unique
       conflict → `ROLLBACK`/return early (already processed, true no-op — no
       partial writes possible either way since nothing else has happened yet).
    3. Extract the actual Stripe object status from `event.data.object.status`
       (subscription status) or the invoice/session equivalent — **never branch
       subscription status by `event.type` alone**. E.g. for
       `customer.subscription.updated`, write `status` as whatever
       `event.data.object.status` says (`active`, `past_due`, `trialing`,
       `canceled`, `unpaid`), not a hardcoded value per event type. This
       naturally covers `past_due → active` (retry succeeded),
       `trialing → active` (trial converted), etc. without a branch per
       transition.
    4. **Ordering guard:** before writing, compare `event.created` (the event's
       own timestamp, not receipt time) against the current
       `subscriptions.stripe_event_created_at` (or reuse `updatedAt` if you'd
       rather not add a column) for that workspace/subscription. If the incoming
       event is older than the last-applied event, skip the state write (but
       still record it in `stripe_events` for the audit trail) — protects
       against out-of-order delivery re-applying stale state.
    5. Map `price.id` → plan via `plans.stripe_price_id_monthly|yearly`. Upsert
       `subscriptions` (`onConflictDoUpdate` target `workspaceId`) setting
       `planId`, `status` (from step 3), `billing_cycle`,
       `current_period_start/end`, `trial_ends_at`, `cancel_at_period_end`,
       `canceled_at`, `stripe_customer_id`, `stripe_subscription_id`,
       `updated_by: null`.
    6. Commit transaction. If any step after the `stripe_events` insert throws,
       the whole transaction rolls back — including the idempotency insert —
       so Stripe's retry will genuinely reprocess instead of silently no-op'ing
       on a half-applied event. **This is the core v1→v2 fix: insert and apply
       must be one atomic unit, not insert-then-apply.**
    - **Unknown price ID:** log **and** alert (Sentry/Slack/whatever's wired up)
      — do not silently no-op. A paying customer stuck on free limits due to
      price-ID misconfig is a revenue-impacting, invisible failure otherwise.
      No-op the DB write, but the alert is mandatory.
  - `apps/auth-service/src/billing/stripe-event-replay.script.ts` — **new in
    v2, day-one deliverable, not deferred:** small CLI script —
    `stripe.events.list({ type, created: { gte } })` → loop → call the same
    `handleEvent` used by the webhook controller. Safe to run because handlers
    are idempotent (step 2 above). This is the recovery path for "webhook
    endpoint was down / auth-service was down for N minutes" — write it now,
    not during an actual incident.
  - `apps/auth-service/src/billing/billing.controller.ts` —
    `@MessagePattern(BILLING_PATTERNS.*)` thin handlers (model on
    `auth.controller.ts` `ENTITLEMENTS_RESOLVE`); inject `BillingService` +
    `StripeWebhookService`. **v2:** the webhook handler pattern must propagate
    failures as errors (not swallow them) so the gateway (Phase 4) can return a
    5xx and trigger Stripe's automatic retry — see Phase 4 note.
  - `apps/auth-service/src/billing/billing.module.ts` — imports/exports per
    `auth.module.ts` shape; provides service + webhook service + `'STRIPE'` provider.
- **Files — modify:**
  - `apps/auth-service/src/app/app.module.ts` — `imports: […, BillingModule]`.
  - `apps/auth-service/src/auth/entitlements.service.ts` — in `resolveLimits`,
    after fetching `sub`, add status policy (**v2: confirm this exact policy
    with product before implementing — see Risks**): if `sub?.status === 'canceled'`
    (grace elapsed via `BILLING_GRACE_DAYS`) → set `baseLimits = null` + clear
    `planKey` so the existing free-fallback path resolves free limits.
    (`sub.status` is already selected — no query change.)
  - `apps/auth-service/.env` — `STRIPE_SECRET_KEY`, `BILLING_GRACE_DAYS=7`.
  - `apps/auth-service/.env.example` — add commented placeholders:
    `STRIPE_SECRET_KEY=sk_test_…` (+ note test/live split) and
    `# past_due grace days before limits revert to free` / `BILLING_GRACE_DAYS=7`.
- **Shared contracts:** consumes Phase 1 (`BILLING_PATTERNS`, billing DTOs/types).
- **New deps:** `stripe` → `apps/auth-service/package.json` (`pnpm --filter
  @wriven/auth-service add stripe`, or edit + `pnpm install`). Pin `apiVersion`.
- **Verify:** `pnpm nx typecheck auth-service` + `pnpm nx lint auth-service` +
  `pnpm nx build auth-service` pass; unit tests for: price→plan mapping, webhook
  replay is a true no-op (second insert conflicts on `event_id`, and a forced
  mid-transaction failure on the *first* attempt leaves no `stripe_events` row —
  test this explicitly, it's the atomicity fix), stale/out-of-order event is
  skipped for state write but still recorded, canceled-status resolves free
  limits, unknown price ID triggers the alert path. Manually run the replay
  script against a handful of test-mode events to confirm it works end to end.
  (Project name: `pnpm nx show projects | grep auth`.)

### Phase 4 — api-gateway billing + webhook endpoints

- **Why here:** depends on Phase 1 contracts + Phase 3 TCP handlers existing.
- **Files — create:**
  - `apps/api-gateway/src/billing/billing.controller.ts` — `@Controller('billing')`,
    `@UseGuards(JwtAuthGuard, WorkspaceGuard)`; `@Inject(AUTH_SERVICE)`;
    `GET /plans`, `GET /subscription`, `POST /checkout` (DTO
    `CreateCheckoutSessionDto`), `POST /portal` (DTO `CreatePortalSessionDto`).
    Forward `{ userId, workspaceId, workspaceRole, dto }` (or `returnUrl`) to
    `BILLING_PATTERNS.*` via `firstValueFrom`. Model exactly on
    `members/workspaces.controller.ts`.
  - `apps/api-gateway/src/billing/stripe-webhook.controller.ts` —
    `@Controller('webhooks/stripe')` `@Post()`; **no** `JwtAuthGuard`; **no** DTO
    (`ValidationPipe`'s `forbidNonWhitelisted` would reject the Stripe payload);
    read raw body via `@Req() req` (`req.rawBody`) + `stripe-signature` header;
    `stripe.webhooks.constructEvent(rawBody, sig, secret)` → on throw, return
    `rpcError('STRIPE_WEBHOOK_INVALID')` (→ 400); else
    `firstValueFrom(auth.send(BILLING_PATTERNS.STRIPE_WEBHOOK, { event }))`.
    **v2: distinguish failure modes on the response** — bad signature → 400 as
    before; but if the TCP call to auth-service throws (timeout, auth-service
    down, unhandled error inside `handleEvent`) → return **500**, not 200. A 200
    tells Stripe "handled, don't retry" — swallowing a downstream failure into
    200 silently drops the event forever. Only return 200 once `handleEvent`
    has actually completed (or was a genuine idempotent no-op).
    `@SkipThrottle()` so Stripe retries aren't throttled.
- **Files — modify:**
  - `apps/api-gateway/src/main.ts` — `NestFactory.create(AppModule, { rawBody: true })`.
  - `apps/api-gateway/src/app/app.module.ts` — add `BillingController` +
    `StripeWebhookController` to `controllers[]`.
  - `apps/api-gateway/.env` — `STRIPE_WEBHOOK_SECRET` (`whsec_…`).
  - `apps/api-gateway/.env.example` — `# Stripe webhook signing secret (whsec_…).
    Local dev: \`stripe listen --forward-to localhost:5000/api/v1/webhooks/stripe\`.`
    + `STRIPE_WEBHOOK_SECRET=`.
- **Shared contracts:** consumes Phase 1.
- **New deps:** `stripe` → `apps/api-gateway/package.json` (for `constructEvent`).
- **Verify:** `pnpm nx typecheck api-gateway` + `pnpm nx lint api-gateway` +
  `pnpm nx build api-gateway` pass; `GET /api/v1/billing/plans` (with workspace
  cookie/header) returns 3 plans; `GET /api/v1/billing/subscription` returns the
  free sub; `POST /api/v1/webhooks/stripe` with a bad signature → 400
  `STRIPE_WEBHOOK_INVALID`; with a signed test event → 200; **v2: with auth-service
  killed mid-request → 500, not 200** (confirm Stripe's retry actually re-fires
  in the CLI logs).

### Phase 5 — Stripe setup + end-to-end smoke (test mode)

- **Why here:** gated on Phases 1–4 running + real Stripe test-mode config.
- **Tasks (not files):**
  - Create Stripe Products + Prices: `pro` (monthly + yearly), `business`
    (monthly + yearly). `free` has no Stripe price. Use the Dashboard or the
    connected **Stripe MCP** (`PostProducts`, `PostPrices`) if available.
  - Backfill `plans.stripe_product_id` / `stripe_price_id_monthly` /
    `stripe_price_id_yearly` via `admin.plans.update` (or a one-off SQL update).
  - Register the webhook endpoint in Stripe → `https://<gateway>/api/v1/webhooks/stripe`,
    `enabled_events`: `checkout.session.completed`, `customer.subscription.created`,
    `customer.subscription.updated`, `customer.subscription.deleted`,
    `invoice.payment_failed`, `invoice.paid`. Copy `whsec_…` → gateway `.env`.
    **v2: set the endpoint's API version explicitly to match the SDK pin** (see
    Phase 3 note) — don't leave it on "latest."
  - `.env`: `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET=whsec_…`.
- **Verify (manual e2e, test card `4242…`):** checkout → complete →
  `checkout.session.completed` → `subscriptions` row flips to `pro`/`active` with
  Stripe IDs + period; `auth.entitlements.resolve` now returns pro limits; portal
  session URL opens; cancel → `customer.subscription.deleted` (after grace) →
  `resolveLimits` reverts to free; replayed webhook event (via CLI resend, and
  via the Phase 3 replay script) is a true no-op; decline card `4000…0341` →
  `invoice.payment_failed` → status `past_due`; **v2: double-click "Upgrade" fast
  twice → confirm only one Checkout Session is created** (idempotency-key check);
  **v2: manually simulate an out-of-order webhook (resend an older event after a
  newer one) → confirm state is not stomped backwards.**

### Phase 6 — Docs

- **Why here:** last; `CLAUDE.md` doc-maintenance rule. Must reflect shipped code.
- **Files — modify:**
  - `doc/conventions.md` — document `PLAN_LIMIT_REACHED` (currently missing) +
    `STRIPE_WEBHOOK_INVALID`.
  - `doc/api-reference.md` — add `GET/POST /billing/*` + `POST /webhooks/stripe`.
  - `doc/auth-service/auth-service.md` — new billing module section, including
    the replay script and the atomic-transaction webhook design.
  - `doc/api-gateway/api-gateway.md` — add `BillingController`/`StripeWebhookController`,
    note the 400-vs-500 response contract.
  - `doc/status.md` + `doc/market-readiness.md` — mark Stripe billing done
    (resolve the "schema-ready, unbuilt" row).
- **Verify:** docs grep clean for the new endpoints/codes; no stale "unbuilt" claim.

## Risks / open questions

- **`rawBody: true` global side-effects** — enabling raw-body capture app-wide is
  safe (only read where needed) but must be smoke-tested against existing routes
  (auth, content upload) before merge.
- **Stripe API version pin** — pin a **stable** version on both the SDK client
  **and** the webhook endpoint config in the Dashboard, so payloads don't shift
  independently between the two.
- **Webhook race** — `customer.subscription.created` may arrive before
  `checkout.session.completed` (or before the Customer is persisted). Reconciler
  derives state from each event's own payload (not prior row state) and maps
  workspace via `client_reference_id` / `metadata.workspaceId`. The v2 ordering
  guard (compare `event.created`) further protects against a late-arriving stale
  event overwriting a newer one.
- **Status policy is a product decision — blocking, needs sign-off before Phase 3
  is implemented, not just before Phase 5:** v1 default is `canceled`
  (post-grace) → free; `past_due` keeps plan during `BILLING_GRACE_DAYS`. Confirm:
  is `BILLING_GRACE_DAYS` meant to run *on top of* Stripe's own Smart Retries
  dunning window (double grace), or replace it? Is post-cancellation grace meant
  to be "keep Pro access until `current_period_end`" — if so, that's normally
  modeled via `cancel_at_period_end` staying `active` until period end, not a
  timer that starts after Stripe's terminal `subscription.deleted` fires. Also
  still open: dunning terminal outcome (cancel vs `unpaid`), over-quota-on-downgrade
  (block/allow/warn), proration policy.
- **Core 30s entitlements cache** — a downgrade takes up to 30s to bite on
  core-side creates; accepted for v1 (no cache-invalidation hook).
- **`updated_by` for webhook writes** = `null` (column nullable; no admin actor).
- **Mutation auth level** — owner/admin assumed; confirm owner-only vs owner/admin.
- **Trial abuse** — nothing currently stops cancel-and-resubscribe to repeat a
  trial. Not blocking for v1; note it and revisit if it becomes a real problem
  (would need a check against Stripe customer history before granting
  `trial_period_days`).

## Out of scope

- Frontend (`apps/client`) Checkout redirect / portal link / replacing the mock
  billing page — separate spec/commit.
- Admin-panel SPA (separate repo) plan moderation — `PUT /admin/workspaces/:id/plan` reused.
- Usage-based metering (CDA requests/bandwidth/AI credits) — no counter pipeline yet.
- Tax/VAT, multi-currency, coupons, overage billing, invoice PDF hosting.
- Metered Stripe prices (v1 = flat `licensed` prices).
- Core-side cache invalidation on plan change.
- Trial-abuse prevention (see Risks — deferred, not blocking).

## Definition of done

- [ ] Phase 1: `@wriven/contracts` typechecks; `BILLING_PATTERNS`,
      `STRIPE_WEBHOOK_INVALID`, billing DTOs/types exported from the barrel.
- [ ] Phase 2: `pnpm db:auth:generate` yields only `stripe_events` (with
      `eventCreatedAt`); migration applies; table visible in `auth_svc`.
- [ ] Phase 3: auth-service typecheck/lint/build green; unit tests pass
      (price→plan, atomic webhook — forced mid-transaction failure leaves zero
      partial state, stale-event skip, canceled→free, unknown-price alert fires);
      `stripe-client.provider` throws when `STRIPE_SECRET_KEY` unset; replay
      script runs successfully against test-mode events; `apps/auth-service/.env.example`
      documents `STRIPE_SECRET_KEY` + `BILLING_GRACE_DAYS`.
- [ ] Phase 4: api-gateway typecheck/lint/build green; `GET /billing/plans`
      returns 3 plans; bad-sig webhook → 400 `STRIPE_WEBHOOK_INVALID`; signed
      event → 200; downstream auth-service failure → 500 (not 200);
      `apps/api-gateway/.env.example` documents `STRIPE_WEBHOOK_SECRET`.
- [ ] Phase 5 e2e: checkout completes → `subscriptions` updated → entitlements
      reflect paid plan; cancel+grace → reverts to free per confirmed policy;
      replayed event no-op; decline → `past_due`; double-click checkout →
      single session; out-of-order webhook doesn't stomp newer state.
- [ ] Phase 5 setup: Stripe Products/Prices created; `plans.stripe_*` backfilled;
      webhook endpoint registered with the minimal `enabled_events` and matching
      API version pin.
- [ ] Phase 6: `doc/conventions.md`, `doc/api-reference.md`,
      `doc/auth-service/`, `doc/api-gateway/`, `doc/status.md`,
      `doc/market-readiness.md` updated.