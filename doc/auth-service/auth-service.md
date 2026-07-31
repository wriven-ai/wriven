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
| created_at / updated_at | timestamptz | `updated_at` auto-bumps |

**refresh_tokens** — `token_hash` (unique, sha256), `user_id`→users (cascade), `expires_at`, `revoked`, `remember_me`, `created_at`.
**password_reset_tokens** — `token_hash` (unique), `user_id`, `expires_at`, `used`, `created_at`.
**email_verification_tokens** — same shape as reset tokens.

### Tenancy

**workspaces** — id, name, `slug` (globally unique), `created_by`→users, created_at, updated_at.
**workspace_members** — workspace_id→workspaces, user_id→users, `role` (`owner`\|`admin`\|`member` CHECK), `unique(workspace_id, user_id)`, `user_id` index.
**projects** — id, workspace_id→workspaces (cascade), name, slug, `created_by`→users (restrict), `unique(workspace_id, slug)`, `deleted_at` (soft delete).
**project_members** — project_id→projects (cascade), user_id→users (cascade), `role` (`admin`\|`editor`\|`viewer` CHECK), `unique(project_id, user_id)`, `user_id` index.

### Hierarchy

```
User ──< workspace_members >── Workspace ──< projects ── project_members >── User
   (a user can belong to many workspaces; signup auto-creates one workspace + one "Default Project")
```

## Tokens

- **Access token**: JWT (HS256), payload `{ sub, email }`, TTL `JWT_ACCESS_TTL` (default `15m`). Signed with `JWT_SECRET`. Validated locally by the gateway.
- **Refresh token**: opaque random (48 bytes hex), stored **sha256-hashed**. TTL `JWT_REFRESH_TTL` (`7d`) or `JWT_REFRESH_TTL_REMEMBER` (`30d`). Delivered to the client in an **HttpOnly cookie** (`refresh_token`, path `/api/v1/auth`, SameSite=lax, Secure in prod).
- Durations are human strings (`15m`/`7d`/`30d`/`1h`) parsed by `common/duration.ts`; `@nestjs/jwt` parses them natively for signing.

## Flows

### Register (single transaction)
`POST /auth/register { name, email, password, workspaceName? }` →
1. Reject if email exists (`EMAIL_ALREADY_EXISTS`; also caught on the unique constraint for races).
2. bcrypt hash (rounds `BCRYPT_ROUNDS`, default 12).
3. **One transaction:** insert user → workspace (name from optional `workspaceName`, else `"<name>'s Workspace"`; random-suffixed slug) → workspace_member `owner` → project (`Default Project`, slug `default`) → project_member `admin` → refresh token row.
4. Issue access + refresh tokens; send verification email (failure logged, never blocks).
5. Return `{ accessToken, user, workspace, project }` + refresh cookie.

### Login
`POST /auth/login { email, password, rememberMe? }` → look up user, bcrypt compare. On missing email, runs a **dummy bcrypt compare** so timing doesn't leak existence. Generic `INVALID_CREDENTIALS` on any failure. Issues tokens + returns primary workspace/project.

### Refresh (mandatory rotation)
`POST /auth/refresh` (refresh cookie) → hash, look up row. If **revoked token is reused → theft**: revoke all of the user's tokens, reject. If valid: revoke old + issue new (rotation), return new access token + cookie.

### Logout
`POST /auth/logout` (refresh cookie) → revoke that token row, clear cookie. Always 200.

### Forgot password
`POST /auth/forgot-password { email }` → **always returns success** (no enumeration). If the user exists: invalidate prior unused reset tokens, issue a new one (TTL `RESET_TOKEN_TTL`, `1h`), email the link `${APP_URL}/reset-password?token=…`. Mail failure is caught/logged (so existing vs non-existing emails are indistinguishable).

### Reset password
`POST /auth/reset-password { token, newPassword }` → validate token (not used/expired). **One transaction:** update password hash, mark token used, **revoke ALL refresh tokens** (force re-login everywhere).

### Email verification
- Register issues a verification token (TTL `EMAIL_VERIFY_TTL`, `24h`) and emails `${APP_URL}/verify-email?token=…`.
- `POST /auth/verify-email { token }` → mark `email_verified = true`, token used.
- `POST /auth/resend-verification` (JWT) → idempotent; invalidates prior tokens, re-issues. Login is **not** blocked on unverified email (flag exposed via `/auth/me`).

### Google OAuth
- The **Passport Google strategy runs on the gateway** (auth-service has no public HTTP endpoint for Google to redirect to).
- `GET /auth/google` → redirect to Google. `GET /auth/google/callback` → gateway exchanges code for profile, sends it over TCP (`auth.googleLogin`), sets refresh cookie, redirects to `${CLIENT_ORIGIN}/auth/callback#access_token=…` (token in URL fragment).
- `googleLogin` resolution: find by `provider_id` → else link to existing local account by email (sets `provider_id`, `email_verified=true`) → else full signup transaction (`provider: 'google'`, verified).

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

`WorkspacesService` handles workspace CRUD (patterns `auth.{createWorkspace,getWorkspace,listWorkspaces,updateWorkspace,deleteWorkspace}`), exposed by the gateway under `/workspaces` and `/workspaces/:workspaceId`. `ProjectsService` handles project CRUD + project membership (patterns `auth.project.*` / `auth.createProject` etc.), exposed under `/workspaces/:workspaceId/projects` and `/projects/:projectId` (full detail: [members-api.md](./members-api.md)). Authorization is enforced here from the caller's role:

- **Workspace:** create/list = any authed user; update = owner/admin; delete = owner. Members: list = any member; add/update/remove = owner/admin. Only an owner manages the `owner` role; the workspace must keep ≥1 owner.
- **Project:** create = workspace owner/admin; list = any workspace member; update/delete = project admin. Members: list = any member; add/update/remove = project admin (workspace owners/admins have implicit access via the gateway `ProjectGuard`). The project must keep ≥1 admin.
- Creating a workspace seeds a "Default Project" and adds the creator as project admin.
- Members are added by **email** and must be an existing user (no invitation flow yet).

## Cross-service handlers

- `auth.validateWorkspaceMember({ userId, workspaceId })` → `{ workspaceId, role }` or `FORBIDDEN`. Called by the gateway's `WorkspaceGuard` before forwarding workspace-scoped requests.
- `auth.validateProjectMember({ userId, projectId })` → `{ projectId, role }` or `FORBIDDEN`. Called by the gateway's `ProjectGuard` before forwarding project-scoped requests (content).

## Billing (Stripe)

`BillingService` + `StripeWebhookService` own the payment path (patterns `auth.billing.*`). Entitlements/quotas already read the `subscriptions` row, so the integration changes **zero enforcement call sites** — it only keeps the row in sync with Stripe.

### Schema (`auth_svc`)
- **plans** — `key` (free/pro/business), prices (cents), `stripe_product_id` / `stripe_price_id_monthly` / `stripe_price_id_yearly` (backfilled after creating Stripe Products/Prices; the seed's `onConflictDoUpdate` omits these so reseeds don't clobber them), `trial_days` (0 — trials removed), `limits` + `features` (jsonb).
- **subscriptions** — one row per workspace (created `free`/`active` on signup). Stripe linkage (`stripe_customer_id`, `stripe_subscription_id`), `status` (CHECK: active/trialing/past_due/canceled/paused/incomplete), `billing_cycle`, `current_period_start/end`, `trial_ends_at`, `cancel_at_period_end`, `canceled_at`, `stripe_event_created_at` (last applied event time — stale-event guard), `overrides` (admin per-customer limit bump), `updated_by`.
- **stripe_events** — webhook idempotency log: `event_id` (Stripe `evt_…`, unique dedupe key), `event_type`, `event_created_at` (Stripe's `event.created`), `payload` (raw, for debug/replay).

### Checkout / Portal
- `createCheckout` — free→paid only. Pre-checks the row: if a live Stripe subscription exists (`stripe_subscription_id` set, status ≠ canceled) → `SUBSCRIPTION_EXISTS` (use the Portal). Ensures a Customer (idempotent `customer:${workspaceId}`), creates a `subscription`-mode Checkout Session with `metadata.workspaceId`/`planKey`/`billingCycle` + `client_reference_id`. **owner/admin only** (role forwarded by the gateway). Redirect URLs allowlisted to `APP_URL`.
- `createPortal` — Billing Portal session on the workspace's Customer. owner/admin only.

### Invoices
- `listInvoices(workspaceId)` — read-only; resolves the workspace's `stripe_customer_id` (returns `[]` if none) and maps `stripe.invoices.list({ customer, limit: 20 })` to `InvoiceView` (`number`, `amountPaid`, `currency`, `status`, `createdAt`, `url = hosted_invoice_url`). **Link-out / keys-only** — nothing invoice-related is stored; the download links to Stripe's hosted PDF.
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
MAIL_HOST= MAIL_PORT=587 MAIL_USER= MAIL_PASS= MAIL_FROM=
APP_URL=                # frontend base for reset/verify links + billing redirect allowlist
# Stripe (billing)
STRIPE_SECRET_KEY=      # sk_test_… / sk_live_…
STRIPE_WEBHOOK_SECRET=  # whsec_… (auth-service verifies; gateway only forwards)
BILLING_GRACE_DAYS=7    # past_due grace before limits revert to free
STRIPE_MANAGED_PAYMENTS=false  # true opts into Managed Payments (needs tax_codes + Stripe Tax)
```

> Google OAuth credentials live on the **gateway**, not here (the strategy runs there).
