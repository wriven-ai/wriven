# Admin Panel — Auth Model (cross-origin, separate identity)

How admin sessions are issued and verified. Separate identity, separate secret,
separate cookies from the tenant side — an admin token must never satisfy a tenant
guard or vice-versa.

---

## 1. Tokens & cookies
- **Separate secret** `ADMIN_JWT_SECRET` (distinct from tenant `JWT_SECRET`).
- Access token: short-lived JWT, payload `{ sub: adminUserId, email, role, typ:'admin' }`.
- Refresh token: random, stored **hashed** in `admin_refresh_tokens` (mirror the
  existing `refresh_tokens` flow in auth-service).
- **Separate cookies:** `admin_access_token`, `admin_refresh_token`. An admin
  session must never satisfy a tenant guard or vice-versa.

---

## 2. Cross-origin cookie settings (separate-repo SPA)
The SPA runs on a different origin (`admin.wriven.com`) than the API
(`api.wriven.com`). For the browser to send admin cookies:
- Cookies: **`httpOnly; Secure; SameSite=None`** (SameSite=None requires Secure;
  Lax/Strict would block cross-site sending). In dev, fall back to `SameSite=Lax`.
- Gateway CORS: allow exactly `ADMIN_PANEL_ORIGIN`, `credentials: true`, allow the
  CSRF header. Configure in [main.ts](../../../apps/api-gateway/src/main.ts) — add the
  admin origin alongside the existing tenant origin (don't use `*` with credentials).
- Keep the existing **`CsrfGuard`** on admin mutations (double-submit token), same
  as tenant side.

> **Alternative (bearer token):** issue the access token in the login JSON body,
> store it in SPA memory (not localStorage), send `Authorization: Bearer`. Simpler
> CORS, but you lose httpOnly protection and must handle refresh manually.
> **Default to cookies** unless cross-origin cookie setup is blocked by the host.

---

## 3. `AdminJwtGuard`
Clone [jwt-auth.guard.ts](../../../apps/api-gateway/src/auth/jwt-auth.guard.ts):
read the `admin_access_token` cookie, `jwt.verify` with `ADMIN_JWT_SECRET`, attach
`req.adminUser = { adminUserId: payload.sub, email, role }`. On failure throw
`UNAUTHORIZED` (reuse `ERROR_CODES`).

**Defence-in-depth:** reject anything that isn't an admin-typed token, even if a
misconfiguration ever made `ADMIN_JWT_SECRET` match the tenant secret —
`if (payload.typ !== 'admin' || !payload.role) throw unauthorized`.

---

## 4. `AdminRolesGuard` + `@AdminRoles`
```ts
@AdminRoles('admin')                  // only admin
@AdminRoles('admin', 'moderator')     // admin or moderator
// (no decorator) => any authenticated admin, incl. member (read-only routes)
```
The guard reads the route's required roles (via `Reflector`) and checks
`req.adminUser.role`. `member` passes only on routes with no decorator (reads).
Throw `FORBIDDEN` otherwise.

| Role | Can |
|------|-----|
| **`admin`** | Everything: manage admin_users, define/assign plans, platform settings, all moderation, all destructive ops. |
| **`moderator`** | Tenant oversight + moderation. **Cannot** manage admin_users, define plans, or change platform settings. |
| **`member`** | **Read-only** across the entire panel. No writes. |

---

## 5. TOTP (MFA)
If `admin_users.totpSecret` is set, `/admin/auth/login` returns a
`{ mfaRequired: true, challengeId }` step; a second call `/admin/auth/login/totp`
verifies the 6-digit code before issuing cookies. Recommended-required for `admin`.

> Status: TOTP is **deferred** to a later slice (see [01-overview.md §4](./01-overview.md)).
