# 05 — Billing (Stripe)

Payments lifecycle: Checkout (free→paid), the direct `/billing/swap` mutation (paid→paid changes), + Billing Portal for management — the webhook reconciler as source of truth, and entitlements that read off the `subscriptions` row.

![Billing flow](./05-billing.svg)

## Checkout (upgrade)
client → `POST /billing/checkout` (gateway `PermissionGuard` = `WORKSPACE_BILLING_MANAGE`) → auth-service `BillingService` (re-`authorize()`) → Stripe Checkout Session → redirect to hosted page → back to `successUrl`. Portal is the same shape for managing an existing subscription.

## Webhook → reconciler (source of truth)
Stripe events → `POST /webhooks/stripe` (gateway, `rawBody: true`, **no JWT** — public) → auth-service `StripeWebhookService` verifies the HMAC signature and **idempotently** reconciles the `subscriptions` row (status, period, plan-from-price-id). The gateway never writes subscription state — Stripe events drive it. An event-replay script exists for recovery.

## Entitlements
`EntitlementsService` **reads** the `subscriptions` row → enforces plan limits (projects, members, entries, content types, api keys, webhooks, storage). Because enforcement reads the row, plan changes need **zero** enforcement code — the reconciler rewrites the row (immediately for upgrades/cycle-switches, at period end for deferred downgrades).

## Direct plan changes (`/billing/swap`)
Checkout only handles free→paid (a second Checkout would create a second sub + double-charge). For an **already-paid** workspace, `POST /billing/swap` mutates the existing Stripe subscription directly (no redirect). All variants only touch Stripe + the `pending_change` hint — the reconciler stays the source of truth (no cron):

> **Downgrade guard (specs/18):** before forwarding a *downgrade* (lower paid tier, or → free) to auth-service, the **api-gateway** screens it — if the workspace holds more of any stock resource (projects, members, content types, entries, API keys, webhooks, storage) than the target plan allows, the swap is rejected with `DOWNGRADE_BLOCKED` 409 (error `details` lists each over-limit dimension). The user must trim below the target limits first. Upgrades / cycle-switches / reactivation are never screened. The client also previews this eagerly from `useWorkspaceStats` + plan limits (the gateway check is the authoritative backstop for races / direct API use).
- **Upgrade / cycle switch** → `subscriptions.update`, `proration_behavior: 'always_invoice'` (charge the prorated difference now; access flips immediately).
- **Downgrade (lower paid tier)** → **deferred** ([specs/16](../../specs/16-deferred-plan-downgrade.md)): a 2-phase **Subscription Schedule** (`proration_behavior: 'none'`) holds the current price until `current_period_end`, then applies the lower price at renewal — the customer keeps access through the paid period. The pending target is stored on `subscriptions.pending_change`; surfaced as `SubscriptionView.pendingDowngrade`. At period end phase 2 lands → `customer.subscription.updated` → the reconciler flips the row + clears `pending_change`.
- **Cancel → free** → `cancel_at_period_end` (deferred; access until period end).
- **Reactivate** (target === current plan while a downgrade is pending) → `subscription_schedules.release` + clear `pending_change`.

Any non-reactivation swap first releases a pending schedule (a scheduled sub blocks `subscriptions.update`).

## Usage metering (specs/14)
Limits like `apiRequestsPerMonth` / `storageMb` are advertised by the plan but only bite once **measured**. core-service owns the counter (`usage_buckets`) + composes a `UsageView` (requests used + storage SUM + the limits above); the gateway batches Delivery-request increments off the hot path. Read at `GET /usage` + shown on the dashboard Usage page. Soft overage gate (`USAGE_ENFORCE`, default off). See [diagram 09](./09-usage-metering.md). `assetBandwidthGb` stays unmeasured for now.

## Plans + status
- `plans` (free/starter/pro @ $0/$10/$18, 10% annual): limits + features JSON, sized to free-tier infra; `business` tier + `sso` removed (specs/15). AI text/image + `revisionsPerEntry` limit fields are forward (enforced when ai-service ships / on every write respectively). `stripePriceId` to be re-linked for the new tiers in the Stripe sandbox setup task.
- Subscription states: `active / past_due / canceled / paused / incomplete`.
- Trials removed (no trial system). Managed Payments dunning outcome (cancel vs `unpaid`) is an open product decision.

## Status
Backend done ([specs/08](../../specs/08-stripe-billing.md) + `/billing/swap` + [specs/16](../../specs/16-deferred-plan-downgrade.md) deferred downgrades). Live e2e pending sandbox account config (publishable key + Managed Payments) + the client billing page.

## Source
[`05-billing.svg`](./05-billing.svg) · code: [`apps/auth-service/src/billing/`](../../apps/auth-service/src/billing/)
