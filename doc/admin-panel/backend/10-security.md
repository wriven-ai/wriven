# Admin Panel — Security Checklist

Enforce in code + review. Each item is a gate, not a suggestion.

- [ ] Admin identity, JWT secret, and cookies fully separate from tenant
      ([03-auth.md](./03-auth.md)).
- [ ] RBAC checked **server-side** on every endpoint; `member` = read-only.
- [ ] Every mutating endpoint has `@Audit`; audit log is append-only
      ([04-audit.md](./04-audit.md)).
- [ ] CORS allowlist is the exact admin origin, `credentials: true`, no `*`.
- [ ] Cookies `httpOnly; Secure; SameSite=None`; CSRF guard on mutations.
- [ ] Cross-tenant access only through explicit `admin.*` RPC (tenant handlers
      untouched — [05-rpc.md](./05-rpc.md)).
- [ ] No raw secrets returned (api-key tokens / webhook secrets are hash/once-only;
      admin sees prefixes/metadata).
- [ ] Destructive ops are role-gated + audited. (A `reason` capture was once
      specced for audit metadata — **unimplemented**: no admin DTO accepts a
      reason and no handler sets `req.auditMeta`, so metadata is always `{}`.
      Add it if the requirement stands.)
- [ ] Admin tokens carry `typ:'admin'`; `AdminJwtGuard` rejects non-admin tokens.
- [ ] Last-active-`admin` + self-deactivate/delete guards on admin-user mgmt.
- [ ] Plan quotas enforced inside create tx under advisory lock (TOCTOU-safe);
      limits fail closed to free defaults if unseeded ([09-plans.md](./09-plans.md)).
- [x] Rate limit on the admin login (`@Throttle` 10/min). Rest of `/admin/*` is
      unrated (global limiter only) — per-route limits still open.
- [ ] TOTP for `admin` (recommended-required) — schema column only, no runtime.
- [x] Support ticketing admin surface (`/admin/support/*`) shipped — role-gated
      `[admin|moderator]` + `@Audit`, same rules as other admin writes.

**Deferred hardening:** TOTP/MFA (schema only), IP allowlist, per-`/admin/*`
rate limits beyond login, ~~CORS origin allowlist~~ (**done** — `CORS_ORIGINS`),
metrics/media-usage caching at scale, audit reason-capture (above).
