API Reference

Base URL: `http://localhost:5000/api/v1` (gateway). All responses use the standard envelope (see [Conventions](./conventions.md)):

- Success: `{ "success": true, "data": <payload> }`
- Error: `{ "success": false, "error": { "code", "message", "statusCode" } }`

**Auth header:** `Authorization: Bearer <accessToken>` for protected routes.
**Workspace header:** `X-Workspace-Id: <workspaceId>` for workspace-scoped routes.
**Project header:** `X-Project-Id: <projectId>` for `/content/*` routes.
**Refresh cookie:** `refresh_token` (HttpOnly), set by register/login/refresh, scoped to `/api/v1/auth`.

---

## Auth

### POST `/auth/register`
Public. Body: `{ name, email, password, workspaceName? }` (password ≥ 8). Creates user + workspace + a "Default Project", sends verification email, sets refresh cookie. `workspaceName` names the created workspace (defaults to `"<name>'s Workspace"`).
→ `{ accessToken, user, workspace, project }`. Errors: `VALIDATION_ERROR` 422, `EMAIL_ALREADY_EXISTS` 409. Rate limit 5/min.

### POST `/auth/login`
Public. Body: `{ email, password, rememberMe? }`. Sets refresh cookie.
→ `{ accessToken, user, workspace, project }`. Error: `INVALID_CREDENTIALS` 401 (generic). Rate limit 10/min.

### POST `/auth/refresh`
Public (uses refresh cookie). Rotates the refresh token.
→ `{ accessToken }` + new cookie. Error: `INVALID_REFRESH_TOKEN` 401 (also revoke-all on reuse).

### POST `/auth/logout`
Public (uses refresh cookie). Revokes the token, clears cookie. → `{ success: true }`.

### POST `/auth/forgot-password`
Public. Body: `{ email }`. **Always** → `{ success: true }` (no enumeration). Sends reset email if user exists. Rate limit 3/min.

### POST `/auth/reset-password`
Public. Body: `{ token, newPassword }`. Updates password, revokes all sessions.
→ `{ success: true }`. Error: `INVALID_RESET_TOKEN` 400. Rate limit 5/min.

### POST `/auth/verify-email`
Public. Body: `{ token }`. → `{ success: true }`. Error: `INVALID_VERIFICATION_TOKEN` 400. Rate limit 10/min.

### POST `/auth/resend-verification`
**Protected** (JWT). Re-sends verification for the current user (idempotent). → `{ success: true }`. Rate limit 3/min.

### GET `/auth/me`
**Protected** (JWT). Full session for restoring client state. → `{ user, workspaces[], projects[] }` where `user = { id, email, name, avatar, provider, emailVerified, createdAt }`, each workspace `{ id, name, slug, createdBy, role }`, each project `{ id, workspaceId, name, slug, createdBy, createdAt, updatedAt, role }`. Error: `UNAUTHORIZED` 401.

### GET `/auth/workspaces`
**Protected** (JWT). The current user's workspaces. → `WorkspaceView[]`.

---

## Workspaces

All `/workspaces/*` routes are **protected** (JWT). Authorization is enforced in auth-service by the caller's role in the workspace.

### Workspace CRUD — `/workspaces`

| Method | Path | Body | → |
|--------|------|------|---|
| POST | `/workspaces` | `{ name, slug? }` | `{ workspace, project: { id } }` (creator becomes owner; seeds a Default Project) |
| GET | `/workspaces` | — | `WorkspaceView[]` |
| GET | `/workspaces/:workspaceId` | — | `WorkspaceView` |
| PATCH | `/workspaces/:workspaceId` | `{ name?, slug? }` | updated workspace (**owner/admin**) |
| DELETE | `/workspaces/:workspaceId` | — | `{ success: true }` (**owner** only; cascades to projects + members) |

### Workspace members — `/workspaces/:workspaceId/members`
Caller must be a workspace member to list; **owner/admin** to mutate.

| Method | Path | Body | → |
|--------|------|------|---|
| GET | `/workspaces/:workspaceId/members` | — | `WorkspaceMemberView[]` |
| POST | `/workspaces/:workspaceId/members` | `{ email, role }` role ∈ `admin\|member` | added member (adds an **existing** user by email) |
| PATCH | `/workspaces/:workspaceId/members/:userId` | `{ role }` role ∈ `owner\|admin\|member` | updated member |
| DELETE | `/workspaces/:workspaceId/members/:userId` | — | `{ success: true }` |

Rules: only an **owner** may grant/change/remove the `owner` role; the workspace must keep ≥1 owner (`CONFLICT` 409). Errors: `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409.

---

## Projects

All project routes are **protected** (JWT).

### Project CRUD

| Method | Path | Body | → |
|--------|------|------|---|
| POST | `/workspaces/:workspaceId/projects` | `{ name, slug? }` | `ProjectView` (workspace **owner/admin**; creator becomes project admin) |
| GET | `/workspaces/:workspaceId/projects` | — | `ProjectView[]` (any workspace member) |
| GET | `/projects/:projectId` | — | `ProjectView` |
| PATCH | `/projects/:projectId` | `{ name?, slug? }` | updated project (project **admin**) |
| DELETE | `/projects/:projectId` | — | `{ success: true }` (soft; project **admin**) |

### Project members — `/projects/:projectId/members`
Caller must be a project member to list; **admin** to mutate. (Workspace owners/admins implicitly access all projects — enforced by the gateway `ProjectGuard`.)

| Method | Path | Body | → |
|--------|------|------|---|
| GET | `/projects/:projectId/members` | — | `ProjectMemberView[]` |
| POST | `/projects/:projectId/members` | `{ email, role }` role ∈ `admin\|editor\|viewer` | added member |
| PATCH | `/projects/:projectId/members/:userId` | `{ role }` | updated member |
| DELETE | `/projects/:projectId/members/:userId` | — | `{ success: true }` |

Rules: the project must keep ≥1 admin (`CONFLICT` 409). `WorkspaceMemberView`/`ProjectMemberView` embed `user: { id, email, name, avatar }`.

### GET `/auth/google`
Public. Redirects (302) to Google consent.

### GET `/auth/google/callback`
Public (Google redirect). Exchanges code, sets refresh cookie, redirects to `${CLIENT_ORIGIN}/auth/callback#access_token=<jwt>`.

---

## Content (CMS)

All `/content/*` routes are **protected** (JWT), require `X-Workspace-Id`, **and** require `X-Project-Id`. Missing header → `VALIDATION_ERROR` 422; non-member → `FORBIDDEN` 403.

### Content types

| Method | Path | Body | → |
|--------|------|------|---|
| POST | `/content/types` | `{ name, apiId, fields: FieldDef[] }` | created type |
| GET | `/content/types` | — | `ContentTypeView[]` |
| GET | `/content/types/:id` | — | type |
| PATCH | `/content/types/:id` | `{ name?, fields? }` | updated type |
| DELETE | `/content/types/:id` | — | `{ success: true }` (soft) |

Errors: `CONFLICT` 409 (duplicate `apiId` within the project), `NOT_FOUND` 404, `VALIDATION_ERROR` 422.

`FieldDef`: `{ key, label, type, required?, unique?, multiple?, options?, refTypeId? }` where `type ∈ text|richtext|number|boolean|date|media|select|reference`.

### Entries

| Method | Path | Body / Query | → |
|--------|------|-------------|---|
| POST | `/content/entries` | `{ contentTypeId, slug?, status?, data }` | created entry |
| GET | `/content/entries` | `?contentTypeId&status&page&limit` | `{ items, page, limit, total }` |
| GET | `/content/entries/:id` | — | entry |
| PATCH | `/content/entries/:id` | `{ slug?, status?, data? }` | updated entry (merges data) |
| POST | `/content/entries/:id/publish` | — | published entry |
| DELETE | `/content/entries/:id` | — | `{ success: true }` (soft) |
| GET | `/content/entries/:id/revisions` | — | `RevisionView[]` (newest first) |
| POST | `/content/entries/:id/revisions/:version/restore` | — | entry restored to that version (records a new revision) |

`data` is validated against the content type's `fields` → `VALIDATION_ERROR` 422 on mismatch. Slug clash → `CONFLICT` 409 (project-scoped). A field marked `unique` whose value already exists → `CONFLICT` 409. `NOT_FOUND` 404 if entry/type missing in the project. Pagination: `limit` default 20, max 100. On publish/unpublish/delete the entry's CDN cache tags are purged and any matching **webhooks** fire (see below).

`ContentEntryView`: `{ id, workspaceId, projectId, contentTypeId, slug, status, data, authorId, publishedAt, createdAt, updatedAt }`.
`RevisionView`: `{ id, entryId, version, status, data, createdBy, createdAt }`.

> A starter **Post** content type is auto-seeded on project creation (idempotent).

### Media library

R2-backed; presigned **direct** upload (browser PUTs to R2). Keys-only. See specs/03.

| Method | Path | Body / Query | → |
|--------|------|-------------|---|
| POST | `/content/media/presign` | `{ filename, contentType, size? }` | `{ uploadUrl, key }` |
| POST | `/content/media` | `{ key, kind, mime?, size?, width?, height?, alt?, originalFilename? }` | `MediaView` |
| GET | `/content/media` | `?page&limit` | `{ items, page, limit, total }` |
| GET | `/content/media/:id` | — | `MediaView` |
| DELETE | `/content/media/:id` | — | `{ success: true }` (soft + best-effort R2 delete) |

Limits (enforced at presign): 5 MB/image, 25 MB/other; 100 MB per workspace.

### Webhooks

Outgoing webhooks on entry events; signed with HMAC-SHA256. See specs/04.

| Method | Path | Body | → |
|--------|------|------|---|
| POST | `/webhooks` | `{ url, events? }` | `{ webhook, secret }` (secret shown once) |
| GET | `/webhooks` | — | `WebhookView[]` |
| PATCH | `/webhooks/:id` | `{ url?, events?, active? }` | `WebhookView` |
| DELETE | `/webhooks/:id` | — | `{ success: true }` |

Events: `entry.published` · `entry.unpublished` · `entry.deleted`.

---

## Billing (Stripe)

All `/billing/*` routes are **protected** (JWT) and require `X-Workspace-Id`. `POST` routes also require the `X-CSRF-Token` header (double-submit). Plan mutations (checkout/portal) are **owner/admin only** (enforced in auth-service from the forwarded `workspaceRole`).

| Method | Path | Body | → |
|--------|------|------|---|
| GET | `/billing/plans` | — | `PlanView[]` (public + active plans: free/pro/business, with prices/limits/features) |
| GET | `/billing/subscription` | — | `SubscriptionView` — the workspace's current plan/status/period |
| POST | `/billing/checkout` | `{ planKey: 'pro'\|'business', billingCycle: 'monthly'\|'yearly', successUrl?, cancelUrl? }` | `{ url, sessionId }` — Stripe Checkout URL (**owner/admin**; free→paid only) |
| POST | `/billing/portal` | `{ returnUrl? }` | `{ url }` — Stripe Billing Portal URL (**owner/admin**) |

`SubscriptionView`: `{ planKey, planName, status, billingCycle, currentPeriodStart, currentPeriodEnd, trialEndsAt, cancelAtPeriodEnd, hasPaymentMethod }` (timestamps ISO or null).

- Checkout creates a Stripe Customer on first call (idempotent per workspace) + a `subscription`-mode Checkout Session. Redirect URLs are allowlisted to the app origin (`APP_URL`) — cross-origin/malformed values fall back to the default.
- Errors: `SUBSCRIPTION_EXISTS` 409 (a live subscription already exists — use the Portal to change plans), `NOT_FOUND` 404 (plan/portal-customer missing), `FORBIDDEN` 403 (non owner/admin), `INTERNAL_ERROR` 500 (plan not linked to a Stripe price).
- Completing Checkout fires `checkout.session.completed` → the webhook reconciles the `subscriptions` row (plan from price id, status, period, Stripe ids); entitlements/quotas update automatically (no enforcement call site changes).

### POST `/webhooks/stripe`
**Public** — no JWT (CSRF guard short-circuits with no access cookie); `@SkipThrottle` so Stripe retries aren't rate-limited. Receives Stripe's raw body + `stripe-signature` header, forwards both to auth-service, which verifies with `STRIPE_WEBHOOK_SECRET` and reconciles (idempotent via `stripe_events`).
→ `{ received: true }` (200). Bad signature → `STRIPE_WEBHOOK_INVALID` 400. Downstream failure → 500 (so Stripe retries). Enabled events: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`.

---

## Health

### GET `/health`
Public. Pings auth + core over TCP. → `{ gateway, auth, core }`.

---

## Example

```bash
# Register
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ana","email":"ana@x.dev","password":"secret123"}'
# → { success:true, data:{ accessToken, user, workspace, project } }  (+ refresh cookie)

# Create a content type
curl -X POST http://localhost:5000/api/v1/content/types \
  -H "Authorization: Bearer $AT" -H "X-Workspace-Id: $WS" -H "X-Project-Id: $PID" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Blog Post","apiId":"blog_post","fields":[
        {"key":"title","label":"Title","type":"text","required":true},
        {"key":"body","label":"Body","type":"richtext"}]}'

# Create an entry
curl -X POST http://localhost:5000/api/v1/content/entries \
  -H "Authorization: Bearer $AT" -H "X-Workspace-Id: $WS" -H "X-Project-Id: $PID" \
  -H 'Content-Type: application/json' \
  -d '{"contentTypeId":"'$TID'","data":{"title":"Hello","body":"<p>hi</p>"}}'
```
