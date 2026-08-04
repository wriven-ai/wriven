# Plan: Frontend Billing & Stripe Checkout

> Status: drafted · Executes: spec 09 (`specs/09-billing-page-frontend.md`) · Supersedes: -

## Goal

Ship the real billing page: live plans + current subscription from the backend,
Upgrade via hosted Stripe Checkout, Manage via the Billing Portal — replacing
the hardcoded mock.

## Current state

Backend (specs/08) is **done + committed** (`84dfd25`, `2662641`, `23e5c75`):
- `GET /billing/plans`, `GET /billing/subscription`, `POST /billing/checkout`,
  `POST /billing/portal` all live + validated (read path + Checkout-session
  creation smoke-tested against the sandbox).
- Contracts exist in `@wriven/contracts`: `PlanView`, `SubscriptionView`,
  `CheckoutSessionView`, `PortalSessionView`, `PlanLimits`, `PlanFeatures`,
  `SubscriptionStatus`, `BillingCycle`, `CreateCheckoutSessionDto`,
  `CreatePortalSessionDto`, `SUBSCRIPTION_EXISTS`.
- Billing sidebar nav already wired
  (`components/sidebar/builders/build-workspace-nav.ts:42`, `BILLING_VIEW`).

Client foundations that exist + will be reused:
- `lib/api.ts` — `request()` helper handles envelope unwrap, `workspace:` /
  `project:` scope headers, CSRF (`X-CSRF-Token` on mutating calls), 401→refresh
  →retry. Modules mirror each other (e.g. `apiKeyApi`, `webhookApi`).
- `hooks/` — TanStack Query pattern: `useQuery({queryKey,queryFn,enabled})`
  (see `use-workspace-projects.ts`) + `useMutation` with `useQueryClient`
  invalidation + `ApiRequestError` surfacing (see `use-create-project.ts`).
- `hooks/use-current-workspace.ts` → `WorkspaceView | null` (includes `role`).
- `lib/types.ts` — `WorkspaceRole = 'owner'|'admin'|'member'|'guest'` already
  present; **no** plan/subscription types yet.
- The mock page `app/(dashboard)/w/[wsSlug]/billing/page.tsx` (hardcoded
  free/$19/$49, fake invoices + usage meters, disabled buttons) — to rewrite,
  keeping its Tailwind visual style.

Plan starts here — no backend work, no re-doing shipped pieces.

## Phases

### Phase 1 — Client types + `billingApi` module

- **Why here:** first — the hooks (Phase 2) and page (Phase 3) import both.
- **Files — modify:**
  - `apps/client/src/lib/types.ts` — mirror the billing/plan views from
    `@wriven/contracts` (the client mirrors, never imports): `PlanLimits`,
    `PlanFeatures`, `PlanView`, `SubscriptionStatus`, `BillingCycle`,
    `SubscriptionView`, `CheckoutSessionView`, `PortalSessionView`, plus input
    shapes `CreateCheckoutInput` (`{ planKey:'pro'|'business'; billingCycle:'monthly'|'yearly'; successUrl?: string; cancelUrl?: string }`)
    and `CreatePortalInput` (`{ returnUrl?: string }`).
  - `apps/client/src/lib/api.ts` — add a `billingApi` module (model on
    `apiKeyApi`/`webhookApi`); all calls `workspace: true` (billing is
    workspace-scoped, not project-scoped):
    - `listPlans()` → `GET /billing/plans` → `PlanView[]`
    - `getSubscription()` → `GET /billing/subscription` → `SubscriptionView`
    - `createCheckout(dto: CreateCheckoutInput)` → `POST /billing/checkout` → `CheckoutSessionView`
    - `createPortal(dto?: CreatePortalInput)` → `POST /billing/portal` → `PortalSessionView`
- **Shared contracts:** none new (all from specs/08); client-side mirrors only.
- **Verify:** `pnpm nx typecheck client` passes; `grep -n "billingApi" apps/client/src/lib/api.ts` shows the 4 methods.

### Phase 2 — Billing hooks (`use-billing.ts`)

- **Why here:** depends on Phase 1; the page (Phase 3) consumes these.
- **Files — create:**
  - `apps/client/src/hooks/use-billing.ts`:
    - `usePlans()` → `useQuery({ queryKey: ['billing','plans'], queryFn: billingApi.listPlans })`.
    - `useSubscription()` → `useQuery({ queryKey: ['billing','subscription'], queryFn: billingApi.getSubscription })`.
    - `useCheckout()` → `useMutation({ mutationFn: billingApi.createCheckout })`; on
      `onSuccess` do `window.location.href = data.url` (leave the page to
      Stripe). Expose `error` (`ApiRequestError`) so the page can branch on
      `SUBSCRIPTION_EXISTS`.
    - `usePortal()` → `useMutation({ mutationFn: billingApi.createPortal })`; on
      `success` redirect to `data.url`.
    - Export a `invalidateBilling(queryClient)` helper
      (`['billing','subscription']`) for the success-redirect refetch.
- **Shared contracts:** none.
- **Verify:** `pnpm nx typecheck client` passes; the 4 hooks are exported from `hooks/use-billing.ts`.

### Phase 3 — Rewrite the billing page

- **Why here:** depends on Phases 1–2.
- **Files — modify:**
  - `apps/client/src/app/(dashboard)/w/[wsSlug]/billing/page.tsx` — rewrite the
    mock. Keep the existing Tailwind classes / layout DNA; drive everything from
    the hooks:
    - **Header badge** from `useSubscription()` (`planName`, `status`).
    - **Plan cards** from `usePlans()`: real `name`, price (format
      `priceMonthly`/`priceYearly` cents → `$29` / `$290` via a small
      `formatPrice(cents)` helper), `description`, feature list derived from
      `limits` + `features`; a monthly/yearly toggle that swaps the displayed
      price + the `billingCycle` sent to checkout.
    - **Active plan** highlight = `subscription.planKey`; show
      `currentPeriodStart`/`End`, `cancelAtPeriodEnd` when present.
    - **CTA logic** (read `role` from `useCurrentWorkspace()`; `canManage = role==='owner'||'admin'`; `hasPaidSub = subscription.planKey !== 'free'`):
      - `!hasPaidSub` + `canManage` → **Upgrade** → `useCheckout({ planKey, billingCycle, successUrl, cancelUrl })` where the URLs are `${origin}/w/${wsSlug}/billing?checkout=success|cancelled`.
      - `hasPaidSub` → **Manage in Portal** → `usePortal({ returnUrl: \`${origin}/w/${wsSlug}/billing\` })` (proration/cancel handled by Stripe). If a checkout is attempted anyway, the backend returns `SUBSCRIPTION_EXISTS` (409) → swap the CTA to "Manage in Portal".
      - `!canManage` → disable Upgrade/Manage, show "ask a workspace owner/admin".
    - **Redirect handling:** read `?checkout=success|cancelled` via
      `useSearchParams` (**inside a `<Suspense>` boundary**); on `success` →
      success toast/banner +
      `invalidateBilling` (refetch — the webhook is the real source of truth,
      may lag by a second); on `cancelled` → info toast; then `router.replace`
      to strip the query param.
    - **Error states:** plans load failure / `INTERNAL_ERROR` (a plan not linked
      to a Stripe price) → friendly message.
    - **Remove** the mock invoice table + fake usage meters (no backing endpoints).
- **Shared contracts:** none.
- **Verify:** `pnpm nx typecheck client` + `pnpm nx lint client` +
  `pnpm nx build client` all pass; `pnpm dev:client` → logged in, the billing
  page shows the 3 real plans + the workspace's current (free) subscription;
  non-admin sees disabled CTAs.

### Phase 4 — End-to-end smoke (hosted Checkout round-trip)

- **Why here:** last — proves the real money flow; gated on the Stripe account
  being renderable.
- **Tasks (not files):**
  - Confirm the Stripe account can render hosted Checkout: Dashboard →
    Developers → API keys (a `pk_test_` exists) + Settings → Managed Payments
    (provision or disable account-wide). Until then the hosted page errors
    `CheckoutInitError: apiKey is not set` (sandbox blocker from Phase 5 — not a
    client bug).
  - With `stripe listen --forward-to localhost:5000/api/v1/webhooks/stripe`
    running + both backend services up: on the billing page, click **Upgrade to
    Pro** → redirects to `checkout.stripe.com` → pay with `4242 4242 4242 4242`
    → Stripe redirects back to `/w/<wsSlug>/billing?checkout=success` → success toast +
    subscription refetches to pro/active once the webhook lands.
  - On the now-pro workspace: **Manage in Portal** → opens the Stripe Billing
    Portal; a second Upgrade attempt surfaces `SUBSCRIPTION_EXISTS` → Portal CTA.
- **Verify:** the round-trip above completes; the subscription flips to
  pro/active in the UI (and in `auth_svc.subscriptions` via the webhook — the
  deferred Phase-5 H1 proof lands here).

## Risks / open questions

- **Hosted Checkout page won't render on the sandbox** until the account has a
  publishable key + Managed Payments configured (Phase 4 prerequisite). Client
  code is unaffected; it surfaces as the Stripe page failing to load.
- **Webhook is the source of truth, not the `success_url` redirect.** The client
  must not assume the plan flipped the instant `?checkout=success` arrives — it
  only invalidates `useSubscription`; the flip lands when
  `checkout.session.completed` reconciles (sub-second, but async).
- **Toast lib:** confirm the client's toast mechanism (sonner / shadcn toast)
  before Phase 3 — if none is wired, use a simple inline banner for the
  success/cancel notice (don't add a dep just for this).
- **Redirect URLs — client MUST pass them explicitly.** The backend default
  (`APP_URL/billing?checkout=success`) omits the `/w/[wsSlug]` segment and 404s
  (there's no top-level `/billing` route). The page builds
  `${window.location.origin}/w/${wsSlug}/billing?checkout=success|cancelled`
  (checkout) and `…/billing` (portal `returnUrl`) from `useParams().wsSlug`.
- **`useSearchParams` needs a `<Suspense>` boundary** (Next.js build errors
  otherwise). Wrap the page body, or read `?checkout=` in a child component.
- **CSRF after the Stripe redirect-back** is already handled — the in-memory
  token is lost on full reload, but `Providers` silent-restore (`authApi.me()`)
  repopulates it before any mutation. No client change needed.
- **Price formatting:** cents → display is client-only; keep it in a tiny helper
  (no i18n/multi-currency — USD only for v1).

## Out of scope

- Backend changes (specs/08 — done).
- Invoice history UI (no invoice-list endpoint yet — mock table removed, not wired).
- Usage metering bars (no usage pipeline — fake meters removed).
- Custom in-app plan change / proration UI (the Billing Portal owns that).
- Trials (removed in `2662641`).
- A Stripe account-config fix (Dashboard work — called out as a Phase 4 prerequisite,
  not code).

## Definition of done

- [ ] Phase 1: `billingApi` (4 methods) + billing/plan types mirrored;
      `pnpm nx typecheck client` green.
- [ ] Phase 2: `use-billing.ts` exports `usePlans`, `useSubscription`,
      `useCheckout`, `usePortal`; typecheck green.
- [ ] Phase 3: `pnpm nx typecheck` + `lint` + `build client` green; billing page
      renders 3 real plans + current subscription; non-admin CTAs disabled; mock
      invoices + usage meters gone.
- [ ] Phase 4 (manual e2e, gated on Stripe account config): Upgrade → hosted
      Checkout → pay `4242` → `?checkout=success` → subscription refetches to
      pro/active (webhook reconciles); Manage → Portal; `SUBSCRIPTION_EXISTS` →
      Portal CTA.
