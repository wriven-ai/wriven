# Auth Service

NestJS TCP microservice (`:5001`) owning identity, sessions, and tenancy. Schema: `auth_svc`. All handlers are `@MessagePattern` (no HTTP) — the gateway exposes the HTTP routes (see [API Reference](../06-api-reference.md)). Detailed member endpoints: [members-api.md](./members-api.md).

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

**orgs** — id, name, `slug` (unique), `created_by`→users, created_at.
**org_members** — org_id→orgs, user_id→users, `role` (`owner`\|`admin`\|`member` CHECK), `unique(org_id, user_id)`, `user_id` index.
**workspaces** — id, org_id→orgs, name, slug, `unique(org_id, slug)`.
**workspace_members** — workspace_id→workspaces, user_id→users, `role` (`admin`\|`editor`\|`viewer` CHECK), `unique(workspace_id, user_id)`, `user_id` index.

### Hierarchy

```
User ──< org_members >── Org ──< workspaces ── workspace_members >── User
   (a user can belong to many orgs; signup auto-creates one org + one workspace)
```

## Tokens

- **Access token**: JWT (HS256), payload `{ sub, email }`, TTL `JWT_ACCESS_TTL` (default `15m`). Signed with `JWT_SECRET`. Validated locally by the gateway.
- **Refresh token**: opaque random (48 bytes hex), stored **sha256-hashed**. TTL `JWT_REFRESH_TTL` (`7d`) or `JWT_REFRESH_TTL_REMEMBER` (`30d`). Delivered to the client in an **HttpOnly cookie** (`refresh_token`, path `/api/v1/auth`, SameSite=lax, Secure in prod).
- Durations are human strings (`15m`/`7d`/`30d`/`1h`) parsed by `common/duration.ts`; `@nestjs/jwt` parses them natively for signing.

## Flows

### Register (single transaction)
`POST /auth/register { name, email, password }` →
1. Reject if email exists (`EMAIL_ALREADY_EXISTS`; also caught on the unique constraint for races).
2. bcrypt hash (rounds `BCRYPT_ROUNDS`, default 12).
3. **One transaction:** insert user → org (name from optional `orgName`, else `"<name>'s Organization"`; random-suffixed slug) → org_member `owner` → workspace (`Default Workspace`, slug `default`) → workspace_member `admin` → refresh token row.
4. Issue access + refresh tokens; send verification email (failure logged, never blocks).
5. Return `{ accessToken, user, org, workspace }` + refresh cookie.

### Login
`POST /auth/login { email, password, rememberMe? }` → look up user, bcrypt compare. On missing email, runs a **dummy bcrypt compare** so timing doesn't leak existence. Generic `INVALID_CREDENTIALS` on any failure. Issues tokens + returns primary org/workspace.

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
- Rate limits at the gateway (see [Conventions](../07-conventions.md)).
- Daily cron (`@nestjs/schedule`) prunes **expired** token rows (revoked-but-unexpired kept so reuse is still detectable within TTL).

## Session & listing

- `auth.getSession({ userId })` → `{ user, orgs[], workspaces[] }` — backs `GET /auth/me`; lets the client restore full context after a page reload + silent refresh.
- `auth.listOrgs` / `auth.listWorkspaces` → the user's orgs/workspaces with role — back `GET /auth/orgs` and `GET /auth/workspaces`.

## Member management

`MembersService` handles org & workspace membership CRUD (patterns `auth.org.*` / `auth.workspace.*`), exposed by the gateway under `/orgs/:orgId/members` and `/workspaces/:workspaceId/members` (full detail: [members-api.md](./members-api.md)). Authorization is enforced here from the caller's role:

- **Org:** list = any member; add/update/remove = owner/admin. Only an owner manages the `owner` role; the org must keep ≥1 owner.
- **Workspace:** list = any member; add/update/remove = admin. The workspace must keep ≥1 admin.
- Members are added by **email** and must be an existing user (no invitation flow yet).

## Cross-service handler

`auth.validateWorkspaceMember({ userId, workspaceId })` → `{ workspaceId, role }` or `FORBIDDEN`. Called by the gateway's WorkspaceGuard before forwarding workspace-scoped requests to core-service.

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
APP_URL=                # frontend base for reset/verify links
```

> Google OAuth credentials live on the **gateway**, not here (the strategy runs there).
