# Plan: Deferred Plan Downgrade

> Status: drafted · Executes: spec 16 (`specs/16-deferred-plan-downgrade.md`) · Supersedes: -

## Goal
Make paid plan downgrades defer to the end of the billing period (Stripe Subscription Schedules) instead of taking effect immediately, and surface the pending/scheduled state in the UI with a cancel option.

## Current state
- `POST /billing/swap` + `BillingService.swapPlan` exist; downgrade uses `proration_behavior: 'create_prorations'` (immediate + credit) at `apps/auth-service/src/billing/billing.service.ts:288`.
- `StripeWebhookService.syncSubscription` reconciles `customer.subscription.updated` → flips `planId`/`billingCycle`/period from the price; idempotent + ordered by `event.created`.
- `SubscriptionView` (contracts + client `lib/types.ts`) exists; no `pendingDowngrade` field.
- `PlanCta` + the confirm → updating → success flow exist on the billing page (`apps/client/src/app/(dashboard)/w/[wsSlug]/billing/page.tsx`); `PlanActionKind` + `confirmContent`/`successContent` helpers present.
- auth-service migrations are at `0009`; next is `0010`. Commands: `pnpm db:auth:generate` / `pnpm db:auth:migrate`.

## Phases

### Phase 1 — Contracts + schema (foundation)
- **Why here** — the column + the shared type unblock both the backend write (Phase 2) and the client read (Phase 4).
- **Files — modify:**
  - `apps/auth-service/src/db/schema/` (the `subscriptions` table) — add `pendingChange: jsonb('pending_change')` nullable column.
  - `libs/shared/contracts/src/lib/types/billing.types.ts` — add to `SubscriptionView`:
    ```ts
    pendingDowngrade?: {
      planKey: string; planName: string;
      billingCycle: BillingCycle; effectiveAt: string;
    } | null;
    ```
- **Shared contracts** — `SubscriptionView.pendingDowngrade` (above). No new patterns/error codes.
- **Verify:**
  - `pnpm db:auth:generate` → review the generated `apps/auth-service/src/db/migrations/0010_*.sql` (only `ALTER TABLE auth_svc.subscriptions ADD COLUMN pending_change jsonb`).
  - `pnpm db:auth:migrate` applies clean.
  - `pnpm nx lint @wriven/contracts` (if a target exists) or import-check — 0 errors.

### Phase 2 — Backend: schedule on downgrade, release on reactivate
- **Why here** — depends on the Phase 1 column to persist `pending_change`.
- **Files — modify:** `apps/auth-service/src/billing/billing.service.ts`
  - `swapPlan` downgrade branch (`tierDelta < 0`): replace `subscriptions.update({ … 'create_prorations' })` with:
    1. `stripe.subscriptions.retrieve(subId)` → current item `price.id` + `current_period_end`.
    2. `stripe.subscription_schedules.create({ from_subscription: subId, proration_behavior: 'none', phases: [ { items:[{ price: currentPriceId }], end_date: currentPeriodEnd }, { items:[{ price: targetPriceId }] } ] })`.
    3. Write `pending_change = { planKey, planName, billingCycle, effectiveAt: periodEndIso, scheduleId }` on the row.
  - If a schedule is already attached → `stripe.subscription_schedules.update(...)` phase 2 instead of create (Stripe rejects a 2nd `from_subscription`).
  - Reactivation (pending set + `planKey === currentPlanKey`): `stripe.subscription_schedules.release(scheduleId)` + clear `pending_change`.
  - Upgrade/cycle-switch path: if `pending_change` is set, **release the schedule first** (a scheduled sub blocks `subscriptions.update`), then proceed with `always_invoice`.
  - `getSubscription`: map `pending_change` → `pendingDowngrade` in the returned view.
- **Shared contracts** — none new.
- **Verify:**
  - `pnpm nx serve @wriven/auth-service` boots clean (no DI/compile error); `BillingModule dependencies initialized`.
  - Manual (test mode): call `/billing/swap` with a lower plan → Stripe Dashboard shows a schedule attached to the sub; DB row `pending_change` populated.

### Phase 3 — Reconciler clears pending on the phase-2 flip
- **Why here** — depends on Phase 1 column + Phase 2 writing it; closes the loop at period end.
- **Files — modify:** `apps/auth-service/src/billing/stripe-webhook.service.ts`
  - In `syncSubscription`, after resolving the plan from the new price: if `existing.pendingChange?.planKey === plan.key`, include `pendingChange: null` in the `update(subscriptions).set({...})` (clears the hint exactly when the deferred downgrade lands).
  - No change to the idempotency/ordering guards.
- **Shared contracts** — none.
- **Verify:**
  - `pnpm nx serve @wriven/auth-service` boots clean.
  - End-to-end flip verified in Phase 5 smoke (needs the listener + a period advance).

### Phase 4 — Frontend: scheduled + cancel-downgrade states
- **Why here** — depends on Phase 1's `pendingDowngrade` field being on the view. Separate commit (frontend).
- **Files — modify:** `apps/client/src/app/(dashboard)/w/[wsSlug]/billing/page.tsx` + `apps/client/src/lib/types.ts`
  - `lib/types.ts` — mirror `SubscriptionView.pendingDowngrade`.
  - `PlanCta`: accept `pendingDowngrade`; render
    - target (lower) card → disabled **"Scheduled"** pill + `effectiveAt` date.
    - current card → **"Cancel downgrade"** button when `pendingDowngrade` is set (calls `onSelect(currentPlan, currentCycle, 'cancel-downgrade')`).
  - `PlanActionKind` + `confirmContent`/`successContent` — add `'cancel-downgrade'`:
    - confirm: "Cancel the scheduled downgrade?" / "You'll stay on {current plan}." / variant `accent`.
    - success: "Downgrade cancelled" / "You're staying on {plan}."
  - `handleConfirm` — route `'cancel-downgrade'` to the swap (reactivation) path (paid workspace, so it already goes through `swap.mutate`).
- **Shared contracts** — none.
- **Verify:** `pnpm nx lint @wriven/client` — 0 errors. Manual: billing page shows "Scheduled" on the target card + "Cancel downgrade" on the current card when a downgrade is pending.

### Phase 5 — Docs + end-to-end smoke
- **Why here** — last; proves the DoD.
- **Files — modify:** `doc/api-reference.md` (rewrite the `/billing/swap` downgrade bullet to "deferred via Subscription Schedules; `pendingDowngrade` on the view") + `doc/status.md` (billing row note).
- **Verify (Stripe **test** mode + listener):**
  - `stripe listen --forward-to localhost:5000/api/v1/webhooks/stripe` (use its `whsec_` as `STRIPE_WEBHOOK_SECRET`, restart auth-service).
  - Schedule: downgrade starter→…→lower → `pending_change` set; UI shows Scheduled + Cancel downgrade.
  - Land: advance the test clock to period end (or Stripe Dashboard "advance clock") → `customer.subscription.updated` flips the row + clears `pending_change`; `GET /billing/subscription` shows the new plan, no pending.
  - Cancel: "Cancel downgrade" → schedule released, `pending_change` cleared, sub stays on current plan.
  - Edge: upgrade while pending → releases schedule then upgrades (no "sub managed by schedule" error).

## Risks / open questions
- **Schedule-already-attached**: a 2nd `from_subscription` throws — must `subscription_schedules.list({ subscription })` (or read `pending_change.scheduleId`) and `update` instead of `create`. Decide: reuse stored `scheduleId` (preferred) vs list.
- **`from_subscription` rejection** on `past_due`/`incomplete` subs → map to `CONFLICT` 409 (don't attempt the schedule).
- **Phase-1 `end_date`** must be the sub's `current_period_end` (unix seconds); verify the field path under stripe@22 (it moved to the item in some versions — the reconciler already reads `item.current_period_end`, mirror that).
- **Two pending states**: `cancel_at_period_end` (cancel-to-free) vs `pending_change` (paid downgrade). `swapPlan` must clear the other when setting one; `PlanCta` must pick the right reactivate label from which flag is set.
- **Reconciler match key**: clearing `pending_change` keys off `pendingChange.planKey === mappedPlanKey` — confirm plan keys are stable (no key renames mid-flight).
- **Test-clock**: local period-end needs a Stripe test clock (`stripe.testHelpers.testClocks.advance`) or Dashboard advance — pick one for the smoke step.

## Out of scope
- Scheduled **upgrades** (future-dated) — only deferred downgrades.
- Admin-panel UI for schedules (ops use Stripe Dashboard).
- Migrating any existing live subscriptions onto schedules (no live customers yet).
- Changing upgrade / cycle-switch / cancel-to-free timing (already best-practice).

## Definition of done
- [ ] `pnpm db:auth:generate` → `0010_*.sql` adds only `pending_change jsonb`; `pnpm db:auth:migrate` clean. (Phase 1)
- [ ] `pnpm nx lint @wriven/client` — 0 errors. (Phase 4)
- [ ] `pnpm nx serve @wriven/auth-service` + `@wriven/api-gateway` boot clean; `Mapped {/api/v1/billing/swap, POST}` present. (Phases 2–3)
- [ ] Smoke (test mode + listener): downgrade creates a schedule + sets `pending_change`; UI shows Scheduled + Cancel downgrade. (Phases 2–4)
- [ ] At period end the row flips to the lower plan + `pending_change` cleared. (Phase 3)
- [ ] Cancel downgrade releases the schedule; sub stays on current plan. (Phases 2–4)
- [ ] Upgrade while pending releases-then-upgrades with no Stripe schedule error. (Phase 2)
- [ ] `doc/api-reference.md` + `doc/status.md` updated. (Phase 5)
