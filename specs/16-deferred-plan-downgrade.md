# Spec: Deferred Plan Downgrade

> Priority: P1 · Area: cross (auth + gateway + client + contracts) · Status: drafted

## Overview

Today a paid plan downgrade via `POST /billing/swap` takes effect **immediately** with a prorated credit (`proration_behavior: 'create_prorations'`) — the customer's access drops to the lower tier the moment they click, mid-period. The industry-standard downgrade (Stripe, Vercel, Linear, GitHub) is **deferred**: the customer keeps their current tier until the end of the billing period, then the new (lower) price applies at renewal — no mid-period access loss, no refund awkwardness, better retention.

This feature changes the downgrade path to use **Stripe Subscription Schedules** (a 2-phase schedule taken over the existing subscription: phase 1 = current price until `current_period_end`, phase 2 = lower price indefinite, `proration_behavior: 'none'`), and surfaces the "scheduled downgrade" state to the UI so the customer can see it pending and cancel (reactivate) before it lands. Upgrades, cycle switches, and cancel-to-free are unchanged (already best-practice). Maps to the Stripe billing P0 area in `doc/market-readiness.md` as a best-practice refinement of the P0 billing surface (not a new monetization blocker).

## Depends on

- [`specs/08-stripe-billing.md`](./08-stripe-billing.md) — Checkout + Billing Portal + the webhook reconciler (`StripeWebhookService`) that is the source of truth for the `subscriptions` row.
- [`specs/15-plan-revamp-and-pricing.md`](./15-plan-revamp-and-pricing.md) — the free/starter/pro catalog + `revisionsPerEntry`/AI limit fields.
- The `POST /billing/swap` endpoint + `BillingService.swapPlan` + `useSwapPlan` (added alongside specs/15; the direct plan-swap path this spec modifies).
- [`specs/09-billing-page-frontend.md`](./09-billing-page-frontend.md) — the billing page + `PlanCta` component.

## Tooling context (skills / MCP / plugins)

- **Stripe MCP server** (`mcp__plugin_stripe_stripe__*`) — checked, available; used earlier this branch for Products/Prices. Usable to verify Subscription Schedules API shapes (`subscription_schedules.create`/`.update`/`.release`) and to inspect test-mode schedules during smoke.
- **Stripe docs (WebFetch)** — checked, used: confirmed `proration_behavior: 'none'` flips the price immediately (only disables the financial proration), so deferral genuinely requires Subscription Schedules; confirmed `create_prorations` issues a credit but still downgrades now. Sources: [change-price](https://docs.stripe.com/billing/subscriptions/change-price), [prorations](https://docs.stripe.com/billing/subscriptions/prorations), [subscription-schedules](https://docs.stripe.com/billing/subscriptions/subscription-schedules).
- No DB / search / email tools relevant.

## Scope

- In scope:
  - Downgrade path in `BillingService.swapPlan` switches from `subscriptions.update` (`create_prorations`) to **Subscription Schedules** (2-phase, `none`).
  - Persist a **pending downgrade** on the `subscriptions` row (target plan, target cycle, effective date, schedule id) so the UI can show it without a per-read Stripe call.
  - Reconciler clears the pending state when phase 2 lands at period end (`customer.subscription.updated` with the lower price).
  - Reactivation ("cancel the scheduled downgrade") = release the schedule + clear pending state.
  - `SubscriptionView` exposes the pending downgrade; `PlanCta` renders a "Scheduled" target card + a "Cancel downgrade" action on the current card.
- Out of scope:
  - Changes to upgrade, cycle-switch, or cancel-to-free timing (already best-practice).
  - Scheduled **upgrades** (future date) — only deferred downgrades.
  - Migration of any existing live subscriptions onto schedules (greenfield: no live customers yet).
  - Admin-panel UI for schedules (ops can use Stripe Dashboard).

## API / endpoints

No new endpoint. `POST /billing/swap` behavior changes (existing, `workspace-member` w/ `WORKSPACE_BILLING_MANAGE`):

- `planKey` lower than current + paid workspace → **schedule** the downgrade (was: immediate `create_prorations`). Returns `SubscriptionView` including the pending downgrade.
- Same endpoint also handles **reactivation**: when a pending downgrade exists for the workspace, a swap targeting the *current* plan key releases the schedule + clears pending state (mirrors how cancel-to-free reactivation clears `cancel_at_period_end`).

No change to auth level or the DTO shape (`SwapPlanDto`).

## Shared contracts (@wriven/contracts)

- `SubscriptionView` — add a pending-downgrade block:
  ```ts
  pendingDowngrade?: {
    planKey: string;        // target plan key ('starter' | 'pro' | 'free' …)
    planName: string;       // for direct UI display
    billingCycle: BillingCycle;
    effectiveAt: string;    // ISO date — the period end when phase 2 lands
  } | null;
  ```
- No new TCP pattern (reuses `BILLING_PATTERNS.SWAP_PLAN` + `GET_SUBSCRIPTION`).
- No new error codes — reuse `SUBSCRIPTION_NOT_FOUND` (no active sub), `INTERNAL_ERROR` (Stripe schedule failure / price unlinked). If a schedule already exists on the sub and can't be updated, map to `CONFLICT` 409.

## Database / schema

`auth_svc.subscriptions` — add one column to hold the pending downgrade (jsonb keeps the shape flexible + avoids a 4th FK + date column):

- `pending_change jsonb null` — shape:
  ```jsonc
  { "planKey": "starter", "planName": "Starter", "billingCycle": "monthly",
    "effectiveAt": "2026-09-01T00:00:00.000Z", "scheduleId": "sub_sched_…" }
  ```
  `null` when no downgrade is pending.

Migration: `apps/auth-service/src/db/migrations/0010_<auto>.sql` (generated). Run:
```bash
pnpm db:auth:generate   # drizzle-kit generate → review the 0010 SQL
pnpm db:auth:migrate    # apply
```
Drizzle schema edit in `apps/auth-service/src/db/schema/` (the `subscriptions` table def).

## Backend changes

### auth-service
- **Modify `BillingService.swapPlan`** (`apps/auth-service/src/billing/billing.service.ts`):
  - Downgrade branch (`target.sortOrder < current.plan.sortOrder`): instead of `stripe.subscriptions.update(... 'create_prorations')`, fetch the current item price + `current_period_end`, then `stripe.subscription_schedules.create({ from_subscription: subId, proration_behavior: 'none', phases: [ { items:[{price: currentPriceId}], end_date: currentPeriodEnd }, { items:[{price: targetPriceId}] } ] })`. Persist `pending_change` (target + `effectiveAt` = period end + `scheduleId`) on the row. Return `getSubscription(...)`.
  - If a schedule is already attached (a downgrade already pending) → `stripe.subscription_schedules.update` the existing schedule's phase 2 (don't create).
  - Reactivation: detect `pending_change` set + target plan key === current plan key → `stripe.subscription_schedules.release(scheduleId)` + clear `pending_change`.
  - Upgrade/cycle-switch branch unchanged (`always_invoice`), **but** if `pending_change` is set it must release the schedule first (a scheduled sub blocks direct `subscriptions.update`).
- **Modify `StripeWebhookService.syncSubscription`** (`apps/auth-service/src/billing/stripe-webhook.service.ts`): when flipping the row to a plan whose key matches `pending_change.planKey`, clear `pending_change` to `null` in the same update (the deferred downgrade has landed). On schedule **release** (sub reverts to current price, no plan change) the price is unchanged → no flip → `pending_change` was already cleared by `swapPlan` at release time.
- **`getSubscription`**: include `pendingDowngrade` (derived from the `pending_change` row) in the returned view.

### api-gateway
- No change (already forwards `SWAP_PLAN`; the enriched `SubscriptionView` passes through unchanged).

### core-service / ai-service
- No changes.

## Frontend changes (apps/client)

- `lib/types.ts` — `SubscriptionView` gains `pendingDowngrade` (mirror the contract).
- `app/(dashboard)/w/[wsSlug]/billing/page.tsx`:
  - `PlanCta` new states driven by `subscription.pendingDowngrade`:
    - Target (lower) plan card → disabled **"Scheduled"** badge + the effective date.
    - Current plan card → **"Cancel downgrade"** button (calls `onSelect(currentPlan, currentCycle, 'cancel-downgrade')`) when a downgrade is pending; distinct from cancel-to-free reactivation.
    - Active badge already amber; show "Downgrade scheduled" hint.
  - `confirmContent` / `successContent` — add a `'cancel-downgrade'` kind: confirm "Cancel the scheduled downgrade?" → success "Downgrade cancelled — you're staying on {plan}".
  - `handleConfirm` routes `'cancel-downgrade'` to the swap reactivation path.
- Hook/api: `useSwapPlan` + `billingApi.swapPlan` unchanged (same payload).

## Files to create

- `apps/auth-service/src/db/migrations/0010_<auto>.sql` (generated by drizzle-kit).

## Files to modify

- `apps/auth-service/src/db/schema/` — `subscriptions` table: + `pending_change` jsonb column.
- `apps/auth-service/src/billing/billing.service.ts` — `swapPlan` downgrade→schedule + reactivation + release-before-upgrade; `getSubscription` returns `pendingDowngrade`.
- `apps/auth-service/src/billing/stripe-webhook.service.ts` — clear `pending_change` on the phase-2 flip.
- `libs/shared/contracts/src/lib/types/billing.types.ts` (or wherever `SubscriptionView` lives) — + `pendingDowngrade`.
- `apps/client/src/lib/types.ts` — mirror `pendingDowngrade`.
- `apps/client/src/app/(dashboard)/w/[wsSlug]/billing/page.tsx` — `PlanCta` scheduled/cancel-downgrade states + confirm/success copy + routing.
- `doc/api-reference.md` — update `/billing/swap` downgrade semantics (deferred via schedules) + `SubscriptionView.pendingDowngrade`.
- `doc/status.md` — billing row note: deferred downgrade.

## New dependencies

No new dependencies. `stripe` SDK already supports `subscription_schedules.*`.

## Rules for implementation

Base:
- Define shared DTOs/types/patterns/errors in `libs/shared/contracts` (`@wriven/contracts`) — check it before creating new ones.
- Store only R2 object **keys** in the DB; reconstruct URLs at runtime.
- Respect microservice boundaries — do not collapse auth/core/ai logic.
- Endpoints return the response envelope; use error codes from `@wriven/contracts/errors.ts`; never leak stack traces or DB errors.
- Use dot-namespaced patterns from `@wriven/contracts/messages.ts`, never hardcoded strings.
- Frontend (`apps/client`) and backend changes go in **separate commits**; stage selectively, never `git add -A` across both.
- Run tasks through `pnpm nx <target> <project>`. Commits are one-line Conventional Commits with no body.

Feature-specific:
- The webhook reconciler is the source of truth — `swapPlan` only mutates Stripe (create/release schedule) + writes the pending hint; it must never set the effective `planId`/`billingCycle` itself for a downgrade (that flip happens at period end via `customer.subscription.updated`).
- Never leave `pending_change` set after the row has flipped to the target plan, nor after a release — both `swapPlan` (release) and the reconciler (flip) must clear it.
- If `subscriptions.update` would be blocked by an attached schedule (upgrade/cycle-switch while a downgrade is pending), release the schedule first inside the same `swapPlan` call.
- Phase 1 of the schedule must use the **current** price id (preserve the paid period); phase 2 the target price. `proration_behavior: 'none'` on the schedule so no mid-period charge/credit fires.
- Surface honest copy in the UI: "Downgrade scheduled for {date}" — never claim immediate downgrade.

## Definition of done

- [ ] `pnpm db:auth:generate` produces a clean `0010_*.sql` adding only `pending_change jsonb` to `auth_svc.subscriptions`; `pnpm db:auth:migrate` applies without error.
- [ ] `pnpm nx lint @wriven/client` — 0 errors.
- [ ] `pnpm nx serve @wriven/auth-service` + `@wriven/api-gateway` boot clean; `Mapped {/api/v1/billing/swap, POST}` still present.
- [ ] Smoke (Stripe **test** mode + `stripe listen --forward-to localhost:5000/api/v1/webhooks/stripe`): downgrade starter→pro-…→starter creates a schedule; `subscriptions.pending_change` is set with `effectiveAt` = period end; the starter card shows "Scheduled" + the current card shows "Cancel downgrade".
- [ ] At period end (advance the test clock or wait), `customer.subscription.updated` flips the row to the lower plan + clears `pending_change` — `GET /billing/subscription` reflects the new plan with no pending state.
- [ ] "Cancel downgrade" releases the schedule; `pending_change` cleared; sub stays on the current plan.
- [ ] Upgrade while a downgrade is pending releases the schedule then upgrades immediately (no Stripe "sub managed by schedule" error).
- [ ] `doc/api-reference.md` + `doc/status.md` updated to reflect deferred downgrade.
