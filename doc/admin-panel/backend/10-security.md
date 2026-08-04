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
- [ ] Destructive ops require a reason (stored in audit metadata) + role gate.
- [ ] Admin tokens carry `typ:'admin'`; `AdminJwtGuard` rejects non-admin tokens.
- [ ] Last-active-`admin` + self-deactivate/delete guards on admin-user mgmt.
- [ ] Plan quotas enforced inside create tx under advisory lock (TOCTOU-safe);
      limits fail closed to free defaults if unseeded ([09-plans.md](./09-plans.md)).
- [ ] Optional: IP allowlist + rate limit on `/admin/*` in prod.
- [ ] TOTP for `admin` (recommended-required).

**Deferred hardening:** TOTP/MFA, IP allowlist + `/admin/*` rate-limit, CORS origin
allowlist (still `origin:true`), metrics/media-usage caching at scale.
