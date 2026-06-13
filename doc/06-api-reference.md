# 06 — API Reference

Base URL: `http://localhost:5000/api/v1` (gateway). All responses use the standard envelope (see [07](./07-conventions.md)):

- Success: `{ "success": true, "data": <payload> }`
- Error: `{ "success": false, "error": { "code", "message", "statusCode" } }`

**Auth header:** `Authorization: Bearer <accessToken>` for protected routes.
**Workspace header:** `X-Workspace-Id: <workspaceId>` for `/content/*` routes.
**Refresh cookie:** `refresh_token` (HttpOnly), set by register/login/refresh, scoped to `/api/v1/auth`.

---

## Auth

### POST `/auth/register`
Public. Body: `{ name, email, password, orgName? }` (password ≥ 8). Creates user + org + workspace, sends verification email, sets refresh cookie. `orgName` names the created org (defaults to `"<name>'s Organization"`).
→ `{ accessToken, user, org, workspace }`. Errors: `VALIDATION_ERROR` 422, `EMAIL_ALREADY_EXISTS` 409. Rate limit 5/min.

### POST `/auth/login`
Public. Body: `{ email, password, rememberMe? }`. Sets refresh cookie.
→ `{ accessToken, user, org, workspace }`. Error: `INVALID_CREDENTIALS` 401 (generic). Rate limit 10/min.

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
**Protected** (JWT). Full session for restoring client state. → `{ user, orgs[], workspaces[] }` where `user = { id, email, name, avatar, provider, emailVerified, createdAt }`, each org `{ id, name, slug, role }`, each workspace `{ id, orgId, name, slug, role }`. Error: `UNAUTHORIZED` 401.

### GET `/auth/orgs`
**Protected** (JWT). The current user's organizations. → `OrgView[]`.

### GET `/auth/workspaces`
**Protected** (JWT). The current user's workspaces. → `WorkspaceView[]`.

---

## Members

All member routes are **protected** (JWT). Authorization is enforced in auth-service by the caller's role in the org/workspace.

### Org members — `/orgs/:orgId/members`
Caller must be an org member to list; **owner/admin** to mutate.

| Method | Path | Body | → |
|--------|------|------|---|
| GET | `/orgs/:orgId/members` | — | `OrgMemberView[]` |
| POST | `/orgs/:orgId/members` | `{ email, role }` role ∈ `admin\|member` | added member (adds an **existing** user by email) |
| PATCH | `/orgs/:orgId/members/:userId` | `{ role }` role ∈ `owner\|admin\|member` | updated member |
| DELETE | `/orgs/:orgId/members/:userId` | — | `{ success: true }` |

Rules: only an **owner** may grant/change/remove the `owner` role; the org must keep ≥1 owner (`CONFLICT` 409 otherwise). Errors: `FORBIDDEN` 403, `NOT_FOUND` 404 (no such user/member), `CONFLICT` 409 (already a member / last owner).

### Workspace members — `/workspaces/:workspaceId/members`
Caller must be a workspace member to list; **admin** to mutate.

| Method | Path | Body | → |
|--------|------|------|---|
| GET | `/workspaces/:workspaceId/members` | — | `WorkspaceMemberView[]` |
| POST | `/workspaces/:workspaceId/members` | `{ email, role }` role ∈ `admin\|editor\|viewer` | added member |
| PATCH | `/workspaces/:workspaceId/members/:userId` | `{ role }` | updated member |
| DELETE | `/workspaces/:workspaceId/members/:userId` | — | `{ success: true }` |

Rules: the workspace must keep ≥1 admin (`CONFLICT` 409). `OrgMemberView`/`WorkspaceMemberView` embed `user: { id, email, name, avatar }`.

### GET `/auth/google`
Public. Redirects (302) to Google consent.

### GET `/auth/google/callback`
Public (Google redirect). Exchanges code, sets refresh cookie, redirects to `${CLIENT_ORIGIN}/auth/callback#access_token=<jwt>`.

---

## Content (CMS)

All `/content/*` routes are **protected** (JWT) **and** require `X-Workspace-Id`. Missing header → `VALIDATION_ERROR` 422; non-member → `FORBIDDEN` 403.

### Content types

| Method | Path | Body | → |
|--------|------|------|---|
| POST | `/content/types` | `{ name, apiId, fields: FieldDef[] }` | created type |
| GET | `/content/types` | — | `ContentTypeView[]` |
| GET | `/content/types/:id` | — | type |
| PATCH | `/content/types/:id` | `{ name?, fields? }` | updated type |
| DELETE | `/content/types/:id` | — | `{ success: true }` (soft) |

Errors: `CONFLICT` 409 (duplicate `apiId`), `NOT_FOUND` 404, `VALIDATION_ERROR` 422.

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

`data` is validated against the content type's `fields` → `VALIDATION_ERROR` 422 on mismatch. Slug clash → `CONFLICT` 409. `NOT_FOUND` 404 if entry/type missing in the workspace. Pagination: `limit` default 20, max 100.

`ContentEntryView`: `{ id, workspaceId, contentTypeId, slug, status, data, authorId, publishedAt, createdAt, updatedAt }`.

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
# → { success:true, data:{ accessToken, user, org, workspace } }  (+ refresh cookie)

# Create a content type
curl -X POST http://localhost:5000/api/v1/content/types \
  -H "Authorization: Bearer $AT" -H "X-Workspace-Id: $WS" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Blog Post","apiId":"blog_post","fields":[
        {"key":"title","label":"Title","type":"text","required":true},
        {"key":"body","label":"Body","type":"richtext"}]}'

# Create an entry
curl -X POST http://localhost:5000/api/v1/content/entries \
  -H "Authorization: Bearer $AT" -H "X-Workspace-Id: $WS" \
  -H 'Content-Type: application/json' \
  -d '{"contentTypeId":"'$TID'","data":{"title":"Hello","body":"<p>hi</p>"}}'
```
