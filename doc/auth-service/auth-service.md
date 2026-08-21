# Auth Service

NestJS TCP microservice (`:5001`) owning identity, sessions, and tenancy. Schema: `auth_svc`. All handlers are `@MessagePattern` (no HTTP) — the gateway exposes the HTTP routes (see [API Reference](../api-reference.md)). Detailed member endpoints: [members-api.md](./members-api.md).

## Schema (`auth_svc`)

### Identity

**users**
| column | type | notes |
|--------|------|-------|
| id | uuid PK | `gen_random_uuid()` |
| email | text | unique |
| name | text | |
| avatar | text | nullable |
| provider | text | `local` \| `google` (CHECK) |
| provider_id | text | Google id; nullable. `unique(provider, provider_id)` |
| password_hash | text | nullable (null for pure-OAuth users) |
| email_verified | boolean | default false |
| suspended_at | timestamptz | nullable; set → login/refresh return `FORBIDDEN` |
| created_at / updated_at | timestamptz | `updated_at` auto-bumps |

**refresh_tokens** — `token_hash` (unique, sha256), `user_id`→users (cascade), `expires_at`, `revoked`, `remember_me`, `created_at`.
**password_reset_tokens** — `token_hash` (unique), `user_id`, `expires_at`, `used`, `created_at`.
**email_verification_tokens** — reset-token shape plus OTP columns: `code_hash` (HMAC'd 6-digit code), `code_expires_at`, `attempts` (max 5).

### Tenancy

**workspaces** — id, name, `slug` (`unique(created_by, slug)` — unique per owner, not global), `created_by`→users, created_at, updated_at.
**workspace_members** — workspace_id→workspaces, user_id→users, `role` (`owner`\|`admin`\|`member`\|`guest` CHECK — `guest` is auto-seated for project-only invitees), `unique(workspace_id, user_id)`, `user_id` index.
**projects** — id, workspace_id→workspaces (cascade), name, slug, `created_by`→users (restrict), `unique(workspace_id, slug)`, `deleted_at` (soft delete).
**project_members** — project_id→projects (cascade), user_id→users (cascade), `role` (`admin`\|`editor`\|`viewer` CHECK), `unique(project_id, user_id)`, `user_id` index.

### Hierarchy

```
User ──< workspace_members >── Workspace ──< projects ── project_members >── User
   (a user can belong to many workspaces; signup creates the workspace but NO project —
   the user creates their first project in the UI. Only `WorkspacesService.create`
   seeds a "Default Project".)
```

## Tokens

- **Access token**: JWT (HS256), payload `{ sub, email }`, TTL `JWT_ACCESS_TTL` (default `15m`). Signed with `JWT_SECRET`. Validated locally by the gateway.
- **Refresh token**: opaque random (48 bytes hex), stored **sha256-hashed**. TTL `JWT_REFRESH_TTL` (`7d`) or `JWT_REFRESH_TTL_REMEMBER` (`30d`). Delivered to the client in an **HttpOnly cookie** (`refresh_token`, path `/v1/auth`, SameSite=lax, Secure in prod).
- Durations are human strings (`15m`/`7d`/`30d`/`1h`) parsed by `common/duration.ts`; `@nestjs/jwt` parses them natively for signing.

## Flows

### Register (single transaction)
`POST /auth/register { name, email, password, workspaceName? }` →
1. Reject if email exists (`EMAIL_ALREADY_EXISTS`; also caught on the unique constraint for races).
2. bcrypt hash (rounds `BCRYPT_ROUNDS`, default 12).
3. **One transaction:** insert user → workspace (name from optional `workspaceName`, else `"<name>'s Workspace"`; random-suffixed slug) → workspace_member `owner` → free `subscriptions` row → refresh token row. **No project** is created (no `Default Project` at signup); no verification email is auto-sent (on-demand per specs/18).
4. Issue access + refresh tokens.
5. TCP returns `{ accessToken, refreshToken, refreshExpiresAt, user, workspace }`; the gateway sets httpOnly cookies and returns `{ user, workspace, csrfToken }` over HTTP.

### Login
`POST /auth/login { email, password, rememberMe? }` → look up user, bcrypt compare. On missing email, runs a **dummy bcrypt compare** so timing doesn't leak existence. Generic `INVALID_CREDENTIALS` on any failure — except a **suspended** account, which returns `FORBIDDEN`. Issues tokens; returns `{ user, workspace, csrfToken }` (workspace only, no project).

### Refresh (mandatory rotation)
`POST /auth/refresh` (refresh cookie) → hash, look up row. If **revoked token is reused → theft**: revoke all of the user's tokens, reject. If valid: revoke old + issue new (rotation), return new access token + cookie.

### Logout
`POST /auth/logout` (refresh cookie) → revoke that token row, clear cookie. Always 200.

### Forgot password
`POST /auth/forgot-password { email }` → **always returns success** (no enumeration). If the user exists: invalidate prior unused reset tokens, issue a new one (TTL `RESET_TOKEN_TTL`, `1h`), email the link `${APP_URL}/reset-password?token=…`. Mail failure is caught/logged (so existing vs non-existing emails are indistinguishable).

### Reset password
`POST /auth/reset-password { token, newPassword }` → validate token (not used/expired). **One transaction:** update password hash, mark token used, **revoke ALL refresh tokens** (force re-login everywhere).

### Email verification
- On-demand (specs/18): no auto-send at signup; the client triggers sending from the profile page.
- `POST /auth/resend-verification` (JWT) → idempotent; invalidates prior tokens, re-issues one row carrying **both** credentials: a link token (TTL `EMAIL_VERIFY_TTL`, `24h`, `${APP_URL}/verify-email?token=…`) and a 6-digit OTP (TTL `OTP_TTL`, `10m`). The email shows the code plus the verify button.
- `POST /auth/verify-email { token }` (public) → mark `email_verified = true`, token used.
- `POST /auth/verify-email-code { code }` (JWT) → verifies the OTP. Wrong code increments the row's `attempts` (max 5, then the code is locked — the link still works). Expired / exhausted / no-active-code all return `INVALID_VERIFICATION_CODE` 400 with a distinguishing message. Idempotent when already verified.
- The code is stored as `HMAC-SHA256(code, OTP_PEPPER || JWT_SECRET)` — peppered, so DB dumps can't brute-force the 10^6 code space.
- Login is **not** blocked on unverified email (flag exposed via `/auth/me`).

### Google OAuth
- The **Passport Google strategy runs on the gateway** (auth-service has no public HTTP endpoint for Google to redirect to).
- `GET /auth/google` → redirect to Google. `GET /auth/google/callback` → gateway exchanges code for profile, sends it over TCP (`auth.googleLogin`), sets refresh cookie, redirects to a clean `${CLIENT_ORIGIN}/auth/callback` (tokens live in httpOnly cookies — no URL fragment).
- `googleLogin` resolution: find by `provider_id` → else link to existing local account by email (sets `provider_id`, `email_verified=true`) → else full signup transaction (`provider: 'google'`, verified).

### Mail templates

All outbound mail is rendered from typed templates in
[`apps/auth-service/src/mail/templates/`](../apps/auth-service/src/mail/templates/)
— one file per email (`password-reset`, `invitation`, `verification`) plus a
shared `layout.ts` holding the Wriven brand palette (emerald/eggshell tokens
from the tenant `global.css`), an `escapeHtml` helper, and the bulletproof
email shell (table layout, inline styles, Outlook VML CTA). Each template
exports a `render…` function returning `{ subject, text, html }`; the
`MailService` builds the link + expiry copy and hands the data over.
Expiry phrasing comes from the configured TTLs (`RESET_TOKEN_TTL`,
`EMAIL_VERIFY_TTL`) via `common/duration.ts`'s `durationToHuman`.

## Security hardening

- bcrypt rounds 12 (do not lower).
- Timing-safe login (dummy compare).
- Refresh rotation + revoked-reuse theft detection (revoke-all).
- Reset revokes all sessions; tokens stored hashed; raw tokens only in cookie/email.
- No email enumeration (login + forgot).
- Rate limits at the gateway (see [Conventions](../conventions.md)).
- Daily cron (`@nestjs/schedule`) prunes **expired** token rows (revoked-but-unexpired kept so reuse is still detectable within TTL).

## Session & listing

- `auth.getSession({ userId })` → `{ user, workspaces[], projects[] }` — backs `GET /auth/me`; lets the client restore full context after a page reload + silent refresh.
- `auth.listWorkspaces` → the user's workspaces with role — backs `GET /auth/workspaces`.

## Workspace & project management

`WorkspacesService` handles workspace CRUD (patterns `auth.{createWorkspace,getWorkspace,listWorkspaces,updateWorkspace,deleteWorkspace}` + `auth.workspace.stats` for dashboard counts, specs/17), exposed by the gateway under `/workspaces` and `/workspaces/:workspaceId`. `ProjectsService` handles project CRUD + project membership (patterns `auth.project.*` / `auth.createProject` etc.), exposed under `/workspaces/:workspaceId/projects` and `/projects/:projectId` (full detail: [members-api.md](./members-api.md)). Authorization is enforced here from the caller's role:

- **Workspace:** create/list = any authed user; update = owner/admin; delete = owner. Members: list = any member; add/update/remove = owner/admin. Only an owner manages the `owner` role; the workspace must keep ≥1 owner.
- **Project:** create = workspace owner/admin; list = any workspace member (`getProjectScope` — `guest` sees only assigned); update/delete = project admin. Members: list = any member; add/update/remove = project admin. Workspace owners/admins get project permissions via the **cascade** (resolved auth-service-side in `validateProjectMember` — the gateway no longer has a bypass). The project must keep ≥1 admin. Authorization is permission-based (`AuthorizationService.authorize`), not role-string checks.
- Creating a workspace (explicit `POST /workspaces`) seeds a "Default Project" and adds the creator as project admin — signup does not.
- Members are added by **email** (existing user) **or via the invitation flow** (specs/05 — `invitations` table, `InvitationsService`, patterns `auth.invitation.{create,list,revoke,resend,preview,accept}`, 7-day TTL, invite email, auto-claim of pending invites on signup).

## Cross-service handlers

- `auth.validateWorkspaceMember({ userId, workspaceId })` → `{ workspaceId, role, permissions }` or `FORBIDDEN`. Called by the gateway's `WorkspaceGuard`; `permissions` is the cascade-resolved set the gateway's `PermissionGuard` checks.
- `auth.validateProjectMember({ userId, projectId })` → `{ projectId, role, permissions }` or `FORBIDDEN`. The cascade (workspace owner/admin → all project perms, even with no `project_members` row) is resolved here, so the gateway needs no bypass. `role` is null when access is workspace-derived only.

## Billing (Stripe)

`BillingService` + `StripeWebhookService` own the payment path (patterns `auth.billing.*`). Entitlements/quotas already read the `subscriptions` row, so the integration changes **zero enforcement call sites** — it only keeps the row in sync with Stripe.

### Schema (`auth_svc`)
- **plans** — `key` (free/starter/pro), prices (cents, USD dollars in the DTO — converted auth-service-side), `currency`, `yearly_discount_percent` / `yearly_discount_amount`, `sort_order`, `is_public`, `active`, `stripe_product_id` / `stripe_price_id_monthly` / `stripe_price_id_yearly` (created alongside the row via the admin panel — Stripe-first, so a Stripe failure can't leave a half-linked plan), `trial_days` (0 — trials removed), `limits` + `features` (jsonb). Rows are managed from the admin Plans UI, not the seed.
- **subscriptions** — one row per workspace (created `free`/`active` on signup). Stripe linkage (`stripe_customer_id`, `stripe_subscription_id`), `status` (CHECK: active/trialing/past_due/canceled/paused/incomplete), `billing_cycle`, `current_period_start/end`, `trial_ends_at`, `cancel_at_period_end`, `canceled_at`, `stripe_event_created_at` (last applied event time — stale-event guard), `pending_change` (jsonb — deferred-downgrade hint, specs/16; surfaced as `SubscriptionView.pendingDowngrade`, cleared by the reconciler when phase 2 lands), `overrides` (admin per-customer limit bump), `updated_by`.
- **stripe_events** — webhook idempotency log: `event_id` (Stripe `evt_…`, unique dedupe key), `event_type`, `event_created_at` (Stripe's `event.created`), `payload` (raw, for debug/replay).

### Checkout / Portal / Swap
- `createCheckout` — free→paid only. Pre-checks the row: if a live Stripe subscription exists (`stripe_subscription_id` set, status ≠ canceled) → `SUBSCRIPTION_EXISTS` (use the Portal). Ensures a Customer (idempotent `customer:${workspaceId}`), creates a `subscription`-mode Checkout Session with `metadata.workspaceId`/`planKey`/`billingCycle` + `client_reference_id`. Gated by the `WORKSPACE_BILLING_MANAGE` permission (enforced here from `userId` via `AuthorizationService.authorize` — no role forwarded). Redirect URLs allowlisted to `APP_URL`.
- `createPortal` — Billing Portal session on the workspace's Customer. Same permission gate.
- `swapPlan` (`POST /billing/swap`, specs/16) — mutates an **existing** subscription directly (no redirect): upgrade/cycle-switch = immediate prorated invoice (`always_invoice`); **downgrade = deferred** via a 2-phase Subscription Schedule (`proration_behavior: 'none'`, target stored in `pending_change`, access unchanged until period end); `planKey:'free'` = `cancel_at_period_end`; targeting the current plan while a downgrade pends = reactivation (schedule release + clear). Any non-reactivation swap first releases a pending schedule. The api-gateway screens downgrades (`DOWNGRADE_BLOCKED` 409) against stock-resource limits before forwarding (specs/18).

### Invoices
- `listInvoices(workspaceId)` — read-only; resolves the workspace's `stripe_customer_id` (returns `[]` if none) and maps `stripe.invoices.list({ customer, limit: 20 })` to `InvoiceView` (`id`, `number`, `description`, `amountPaid`, `currency`, `status`, `createdAt`, nullable `url = hosted_invoice_url`). **Link-out / keys-only** — nothing invoice-related is stored; the download links to Stripe's hosted PDF.

### Admin plan sync (specs/11)
`AdminPlansService` (in `AdminModule`, shares `StripeModule`) keeps plan create /
retire two-way with Stripe — **prices are read-only after create** (Stripe owns
pricing; the app never pushes price edits). `admin.plans.*` return
`AdminPlanView` = `PlanView` + the Stripe ids (`stripeProductId`,
`stripePriceIdMonthly`, `stripePriceIdYearly`) so the admin can see the linkage
(the tenant `PlanView` deliberately omits them):
- `create()` (paid plan) — validates the plan has at least one price, then
  Stripe-first: creates the Product + monthly + yearly Prices, then inserts the
  plan row with the 3 ids. A paid plan with no price → `VALIDATION_ERROR`. Free
  plan skips Stripe. On Stripe failure → `STRIPE_SYNC_FAILED` (no half-linked row).
- `update({ active: false })` — **fail-loud**: archives the Stripe Product first; on
  Stripe failure throws `STRIPE_SYNC_FAILED` and leaves the DB row untouched. Other
  field changes (`name`/`limits`/…)
  are local-only.
- **Changing a price** is a manual ops task: create a new Price in Stripe →
  repoint the plan's `stripe_price_id_*` + update the stored amount. Existing
  subscribers stay grandfathered on the old price. Reactivation after retire
  does **not** revive deactivated Prices (irreversible) — re-link manually.
- Managed Payments: Stripe's 2025+ default demands a product `tax_code` + breaks the hosted page on an unprovisioned account; Checkout opts out via `managed_payments:{enabled:false}` unless `STRIPE_MANAGED_PAYMENTS=true` (enable only after Stripe Tax + product tax codes are configured).

### Webhook reconciliation (`StripeWebhookService`)
- The gateway forwards raw body + signature; auth-service verifies (`STRIPE_WEBHOOK_SECRET`) then reconciles in **one transaction**: insert `stripe_events` (`onConflictDoNothing` on `event_id` — conflict = already applied, true no-op) + update `subscriptions`.
- State is **payload-derived** (`event.data.object.status`), never event-type-derived — covers past_due→active, trialing→active, etc. without a branch per transition.
- **Ordering:** a per-workspace `pg_advisory_xact_lock` serializes concurrent events; a stale event (`event.created` strictly older than the last applied) is skipped; the UPDATE is guarded on `stripe_subscription_id` so a delayed event for an OLD subscription can't stomp a newer one.
- **Price→plan map** via `plans.stripe_price_id_monthly|yearly`; an unmapped price throws `INTERNAL_ERROR` (→ 5xx → Stripe retries) — never silently recorded as applied.
- Period fields come from `subscription.items.data[0].current_period_start/end` (they moved to `SubscriptionItem` in stripe@22).
- 400 on bad signature; 500 on any downstream failure (Stripe retries).

### Entitlements status policy
`EntitlementsService.resolveLimits` reads `subscriptions` + `plan.limits` + `overrides`; `shouldRestrictToFree` collapses to free limits when `status === 'canceled'`, or `past_due`/`incomplete` past `current_period_end + BILLING_GRACE_DAYS` (default 7). `active`/`trialing`/`paused` keep the row's plan.

### Event replay
`pnpm billing:replay [since]` — streams `stripe.events.list` through the same idempotent `handleEvent` (recovery for a down endpoint / after a price-id backfill fix). Exits non-zero if any event fails.

## Environment (`apps/auth-service/.env`)

```
PORT=5001
DATABASE_URL=...        # transaction pooler
DIRECT_URL=...          # session pooler (migrations)
JWT_SECRET=...          # MUST match api-gateway
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
JWT_REFRESH_TTL_REMEMBER=30d
BCRYPT_ROUNDS=12
RESET_TOKEN_TTL=1h
EMAIL_VERIFY_TTL=24h
OTP_TTL=10m              # 6-digit verification-code lifetime
OTP_PEPPER=              # HMAC pepper for code hashes; falls back to JWT_SECRET
MAIL_HOST= MAIL_PORT=587 MAIL_USER= MAIL_PASS= MAIL_FROM=
APP_URL=                # frontend base for reset/verify links + billing redirect allowlist
CLIENT_ORIGIN=          # used for invitation email links
R2_PUBLIC_URL=          # avatar URL reconstruction (profile photos)
# Admin platform console (admin JWTs are signed here; the gateway verifies)
ADMIN_JWT_SECRET=       # MUST match api-gateway
ADMIN_JWT_ACCESS_TTL= ADMIN_REFRESH_TTL=
ADMIN_SEED_EMAIL= ADMIN_SEED_PASSWORD= ADMIN_SEED_NAME=   # bootstrap admin (seed script)
# Stripe (billing)
STRIPE_SECRET_KEY=      # sk_test_… / sk_live_…
STRIPE_WEBHOOK_SECRET=  # whsec_… (auth-service verifies; gateway only forwards)
BILLING_GRACE_DAYS=7    # past_due grace before limits revert to free
STRIPE_MANAGED_PAYMENTS=false  # true opts into Managed Payments (needs tax_codes + Stripe Tax)
```

> Google OAuth credentials live on the **gateway**, not here (the strategy runs there).
