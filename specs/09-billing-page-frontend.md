# Spec: Frontend Billing & Stripe Checkout

> Priority: P0 · Area: client · Status: drafted

## Overview

Replace the mock billing page at
`apps/client/src/app/(dashboard)/w/[wsSlug]/billing/page.tsx` (hardcoded
free/$19/$49 plans, fake invoices + usage, disabled buttons) with the real
backend built in [specs/08](./08-stripe-billing.md): list real plans from
`GET /billing/plans`, show the workspace's live subscription from
`GET /billing/subscription`, start a paid plan via Stripe hosted **Checkout**
(`POST /billing/checkout` → redirect to the returned `url`), and expose the
Stripe **Billing Portal** (`POST /billing/portal` → redirect) for card / plan /
cancel management. This is the frontend half of the P0 "Billing integration"
gap in [doc/market-readiness.md](../doc/market-readiness.md) and unblocks the
live Stripe e2e (Checkout → webhook → entitlements) deferred from Phase 5.

**Key decision: hosted Checkout only.** The backend already creates
`mode:'subscription'` Checkout Sessions and returns a hosted `url`. The client
does a full-page redirect to that URL — **no `@stripe/stripe-js`, no Payment
Element, no client-side card handling**. The Billing Portal is likewise hosted.
This keeps the frontend thin and keeps all payment-card data on Stripe's
domain.

## Depends on

- [specs/08-stripe-billing.md](./08-stripe-billing.md) — **done** (committed
  `84dfd25` + `2662641`). Provides `GET /billing/plans`, `GET /billing/subscription`,
  `POST /billing/checkout`, `POST /billing/portal`, and the contracts
  (`PlanView`, `SubscriptionView`, `CheckoutSessionView`, `PortalSessionView`,
  `CreateCheckoutSessionDto`, `CreatePortalSessionDto`, `SUBSCRIPTION_EXISTS`).
- Billing sidebar nav already wired —
  `apps/client/src/components/sidebar/builders/build-workspace-nav.ts:42`
  (`href: \`${base}/billing\``, `permission: 'BILLING_VIEW'`). No nav change.

## Tooling context (skills / MCP / plugins)

- **Stripe MCP** (`plugin:stripe`) — checked, **used** during backend Phase 5 to
  create the Products/Prices and confirm Checkout Session shapes
  (`managed_payments`, `payment_method_types`, `success_url`/`cancel_url`,
  `status`). Confirmed hosted Checkout returns a `url` for full-page redirect
  and that the Billing Portal returns a `url` — no client SDK required.
- **No domain tools needed client-side.** Hosted Checkout + Portal mean no
  `@stripe/stripe-js` integration to design against.

## Scope

- In scope:
  - Real billing page: plan catalog (from `/billing/plans`), current
    subscription summary (from `/billing/subscription`), Upgrade → Checkout
    redirect, Manage → Billing Portal redirect.
  - `billingApi` client module + TanStack Query hooks.
  - Client-side type mirrors for the billing views.
  - `?checkout=success|cancelled` redirect handling (toast + refetch).
  - `SUBSCRIPTION_EXISTS` (409) → "manage via Portal" CTA; owner/admin role
    gating on the mutation buttons.
- Out of scope:
  - Backend changes (all in specs/08 — done).
  - A custom in-app plan-change UI / proration calculator (the Stripe Billing
    Portal handles upgrades/downgrades/cancellation with proration).
  - Invoice history UI backed by real data (no invoice-list endpoint exists
    yet; the mock invoice table is removed, not wired — deferred).
  - Usage metering bars (no usage pipeline yet — `apiRequestsPerMonth` /
    `assetBandwidthGb` are unmeasured per market-readiness; remove the fake
    meters rather than fake them).
  - Trials (removed in `2662641` — no trial UI).

## API / endpoints

No new endpoints — all consumed from specs/08:

- `GET /billing/plans` — plan catalog — **workspace-member**
- `GET /billing/subscription` — current subscription — **workspace-member**
- `POST /billing/checkout` — `{ planKey:'pro'|'business', billingCycle:'monthly'|'yearly', successUrl?, cancelUrl? }` → `{ url, sessionId }` — **owner/admin**
- `POST /billing/portal` — `{ returnUrl? }` → `{ url }` — **owner/admin**

(`POST /webhooks/stripe` is backend-only — Stripe calls it; the client never
hits it.)

## Shared contracts (@wriven/contracts)

No new contracts — all exist from specs/08. The client mirrors them into
`apps/client/src/lib/types.ts` (the established pattern — the client mirrors
`@wriven/contracts`, it does not import it):

- `PlanLimits`, `PlanFeatures`, `PlanView` (from `types/admin.types.ts`)
- `SubscriptionStatus`, `BillingCycle`, `SubscriptionView`,
  `CheckoutSessionView`, `PortalSessionView` (from `types/billing.types.ts`)
- Input shapes for the two POSTs (mirror `CreateCheckoutSessionDto` /
  `CreatePortalSessionDto`).

## Database / schema

No schema changes — frontend only.

## Backend changes

No backend code changes. **Operational prerequisite (not code):** before the
hosted Checkout *page* renders, the Stripe account must have a publishable key
and Managed Payments provisioned (or disabled account-wide). On the current
sandbox the hosted page errors `CheckoutInitError: apiKey is not set` until
this is resolved — see
[memory: stripe-phase5-e2e-deferred](../../apps/auth-service). The frontend
code is independent of this; it surfaces as the Stripe-hosted page failing to
load, not a client bug.

## Frontend changes (apps/client)

- **API client** (`src/lib/api.ts`) — add a `billingApi` module mirroring
  `apiKeyApi`/`webhookApi`, all `workspace: true` (billing is workspace-scoped,
  not project-scoped):
  - `listPlans()` → `GET /billing/plans`
  - `getSubscription()` → `GET /billing/subscription`
  - `createCheckout(dto)` → `POST /billing/checkout`
  - `createPortal(dto?)` → `POST /billing/portal`
  - CSRF + scope headers + 401-refresh are handled by the existing `request()`
    helper — nothing manual.
- **Types** (`src/lib/types.ts`) — add the billing/plan view + input mirrors
  listed above.
- **Hooks** (`src/hooks/use-billing.ts`) — TanStack Query:
  - `usePlans()` → `useQuery(['billing','plans'], billingApi.listPlans)`
  - `useSubscription()` → `useQuery(['billing','subscription'], billingApi.getSubscription)`
  - `useCheckout()` → `useMutation(billingApi.createCheckout)` → on success
    `window.location.href = data.url`
  - `usePortal()` → `useMutation(billingApi.createPortal)` → redirect to `data.url`
  - Invalidates `['billing','subscription']` after a checkout redirect / on
    `?checkout=success`.
- **Billing page** (`src/app/(dashboard)/w/[wsSlug]/billing/page.tsx`) — rewrite:
  - Header: current plan badge from `useSubscription().planName`/`status`.
  - Plan cards from `usePlans()`: real name/price (format
    `priceMonthly`/`priceYearly` cents → `$29`/`$290`), description, feature
    list (derive from `limits` + `features`), monthly/yearly toggle.
  - Current-plan card: highlight the active plan (`subscription.planKey`),
    show period (`currentPeriodStart`/`End`), `cancelAtPeriodEnd`, trial/no-trial.
  - CTA logic per plan:
    - Free → paid, no active sub: **Upgrade** → `useCheckout({planKey,billingCycle})`.
    - Already on a paid plan: **Manage in Portal** → `usePortal()` (covers
      upgrade/downgrade/cancel with proration). Backend returns
      `SUBSCRIPTION_EXISTS` (409) if Checkout is attempted on an active sub —
      catch it and switch the CTA to "Manage in Portal".
    - Non owner/admin (`role` from `use-current-workspace`): disable
      Upgrade/Manage, show "ask a workspace owner/admin".
  - Remove the mock invoice table + fake usage meters (no backing endpoints).
  - `?checkout=success` → success toast/banner + `queryClient.invalidateQueries(['billing','subscription'])`;
    `?checkout=cancelled` → info toast; then `router.replace` the query off the URL.
  - Loading / error / empty states (plans not loaded, `INTERNAL_ERROR` if a plan
    isn't linked to a Stripe price yet).

## Files to create

- `apps/client/src/hooks/use-billing.ts`

## Files to modify

- `apps/client/src/lib/api.ts` — add `billingApi` module.
- `apps/client/src/lib/types.ts` — mirror billing/plan view + input types.
- `apps/client/src/app/(dashboard)/w/[wsSlug]/billing/page.tsx` — rewrite the
  mock to consume real data (keep the existing visual style / Tailwind classes).

## New dependencies

None. Hosted Checkout + Billing Portal need no client-side Stripe package.

## Rules for implementation

Base:
- Define shared DTOs/types/patterns/errors in `libs/shared/contracts`
  (`@wriven/contracts`) — check it before creating new ones; mirror (not import)
  into the client.
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
- **Hosted Checkout only.** Redirect to the `url` returned by
  `/billing/checkout` and `/billing/portal` via `window.location.href`. Never
  add `@stripe/stripe-js` or handle card data client-side.
- **The webhook is the source of truth, not the redirect.** Provisioning
  happens server-side from `checkout.session.completed`. On `?checkout=success`
  the client only invalidates `useSubscription` (refetch) and toasts — the plan
  flip may land a moment later via the webhook.
- **Owner/admin gating mirrors the backend.** Hide/disable Upgrade + Manage for
  `member`/`guest` (read the role from `use-current-workspace`); the backend
  enforces `FORBIDDEN` regardless.
- **Map billing error codes to UX:** `SUBSCRIPTION_EXISTS` (409) → Portal CTA;
  `FORBIDDEN` (403) → "ask an admin"; `NOT_FOUND` (portal with no customer) →
  "upgrade first"; `INTERNAL_ERROR` (plan not linked to a price) → generic.
- **Pass redirect URLs explicitly.** Checkout/portal must send
  `successUrl`/`cancelUrl`/`returnUrl` = `${origin}/w/${wsSlug}/billing?…`. The
  backend default (`APP_URL/billing`) omits the workspace segment and 404s
  (no top-level `/billing` route). "Has an active paid sub" = `subscription.planKey !== 'free'`.
- **No fake data.** Remove the mock invoices + usage meters rather than ship
  fabricated numbers; they return when the backing endpoints exist.

## Definition of done

- [ ] `pnpm nx typecheck client` + `pnpm nx lint client` + `pnpm nx build client`
      pass.
- [ ] `GET /billing/plans` renders the 3 real plans (free/pro/business) with
      correct prices + features; monthly/yearly toggle works.
- [ ] `GET /billing/subscription` shows the workspace's current plan/status/
      period on the billing page.
- [ ] On a free workspace, "Upgrade to Pro" → `POST /billing/checkout` →
      browser redirects to a `checkout.stripe.com` URL (hosted Checkout).
- [ ] On an active paid workspace, the Upgrade CTA is replaced by "Manage in
      Portal" → `POST /billing/portal` → redirects to the Stripe Billing Portal.
- [ ] `SUBSCRIPTION_EXISTS` (checkout on an active sub) surfaces the Portal CTA
      instead of an error.
- [ ] `?checkout=success` (Stripe redirect back) shows a success toast + refetches
      the subscription; `?checkout=cancelled` shows an info toast; the query is
      cleared from the URL.
- [ ] Non owner/admin members see disabled mutation CTAs ("ask an admin").
- [ ] No mock invoice table or fake usage meters remain.
