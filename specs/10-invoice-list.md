# Spec: In-App Invoice List

> Priority: P2 · Area: cross (auth + gateway + client) · Status: drafted

## Overview

Surface Stripe invoices in-app on the billing page. Stripe already generates an
invoice (PDF + amount + status) for every subscription charge; today the only way
to see them is the hosted Billing Portal. Add a thin read-only list
(`GET /billing/invoices` → `stripe.invoices.list({ customer })`) so the billing
page's Invoice History card shows real rows with a download link (Stripe-hosted).
Keys-only: store nothing — link out to `hosted_invoice_url`.

## Depends on

- [specs/08-stripe-billing.md](./08-stripe-billing.md) — done. Provides the
  `subscriptions.stripe_customer_id` linkage + the Stripe client.
- [specs/09-billing-page-frontend.md](./09-billing-page-frontend.md) — done.
  Provides the billing page + `billingApi`/hooks the invoice table plugs into.

## Tooling context (skills / MCP / plugins)

- **Stripe MCP** (`plugin:stripe`) — checked, used to confirm the `Invoice`
  field names in stripe@22: `amount_paid`, `created`, `currency`, `status`
  (`draft|open|paid|uncollectible|void`), `number`, `hosted_invoice_url`,
  `invoice_pdf`. No create ops needed (read-only list).

## Scope

- In scope: `GET /billing/invoices` (workspace-scoped, member-readable) →
  `InvoiceView[]`; frontend table on the billing page replacing the empty state.
- Out of scope: invoice detail page (link to Stripe's hosted invoice instead);
  invoice creation/voiding (Stripe-internal); download hosting (Stripe hosts
  the PDF — we link out).

## API / endpoints

- `GET /billing/invoices` — last 20 Stripe invoices for the workspace's customer
  — **workspace-member**. Returns `[]` if no customer/subscription yet.

## Shared contracts (@wriven/contracts)

- `types/billing.types.ts` — add `InvoiceView`:
  `{ id, number, amountPaid (cents), currency, status, createdAt (ISO), description, url (hosted_invoice_url|null) }`.
- `messages.ts` — add `LIST_INVOICES: 'auth.billing.listInvoices'` to `BILLING_PATTERNS`.

## Database / schema

No schema changes.

## Backend changes

- **auth-service** (`billing.service.ts`) — `listInvoices(workspaceId)`: look up
  `subscriptions.stripe_customer_id`; if none → `[]`; else
  `stripe.invoices.list({ customer, limit: 20 })` → map to `InvoiceView`.
  `billing.controller.ts` — `@MessagePattern(LIST_INVOICES)` thin handler.
- **api-gateway** (`billing/billing.controller.ts`) — `GET /invoices` under
  `@Controller('billing')` (JWT + WorkspaceGuard) → forward `{ workspaceId }`.

## Frontend changes (apps/client)

- `lib/types.ts` — mirror `InvoiceView`.
- `lib/api.ts` — `billingApi.listInvoices()`.
- `hooks/use-billing.ts` — `useInvoices()` (`['billing','invoices']`).
- billing page — replace the empty Invoice History card with a table: number /
  date / amount / status badge / download (links to `url`). Empty state when none.

## Files to create

- `specs/10-invoice-list.md` (this spec)

## Files to modify

- `libs/shared/contracts/src/lib/types/billing.types.ts`
- `libs/shared/contracts/src/lib/messages.ts`
- `apps/auth-service/src/billing/billing.service.ts`
- `apps/auth-service/src/billing/billing.controller.ts`
- `apps/api-gateway/src/billing/billing.controller.ts`
- `apps/client/src/lib/types.ts`
- `apps/client/src/lib/api.ts`
- `apps/client/src/hooks/use-billing.ts`
- `apps/client/src/app/(dashboard)/w/[wsSlug]/billing/page.tsx`

## New dependencies

None.

## Rules for implementation

Base + feature-specific:
- **Keys-only / link-out:** store no invoice data; the download links to Stripe's
  `hosted_invoice_url` (Stripe hosts the PDF).
- **Read-only** — no invoice mutation; that's Stripe-internal.
- Map Stripe's nullable `status`/`number` defensively; filter out nothing
  (show paid/open/void/uncollectible; drafts rarely appear for subscriptions).

## Definition of done

- [ ] `pnpm nx typecheck` clean on touched backend files; `pnpm nx build client` +
      `lint` clean.
- [ ] `GET /billing/invoices` returns `[]` for a free workspace (no customer).
- [ ] After a paid subscription, `GET /billing/invoices` returns real Stripe
      invoices (number/amount/status/url).
- [ ] Billing page Invoice History card renders the table (or the empty state).
