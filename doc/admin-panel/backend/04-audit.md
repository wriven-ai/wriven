# Admin Panel — Audit Logging

Mandatory on every admin write. Implement once, apply everywhere via decorator +
interceptor. Backed by `admin_audit_log` ([02-schema.md](./02-schema.md)).

---

## Decorator + interceptor

```ts
@Audit('user.suspend', { target: 'user' })   // action + target type
@Patch('users/:id')
suspendUser(@Param('id') id: string, ...) { ... }
```

`AuditInterceptor`:
- runs **after** the handler succeeds (no audit on failure unless you want
  attempted-action logging — out of scope for v1),
- resolves `adminUserId` from `req.adminUser`, `ip` from request,
- `targetId` from a configured route param (default `:id`, i.e. `req.params.id`)
  **or** the handler result (`result.id`) — for create routes where the id only
  exists after the handler runs,
- `metadata` from an optional `req.auditMeta` the handler can set (e.g. before/after,
  reason from the request body),
- calls auth-service `admin.audit.write` (TCP) to insert the row.

---

## Rule

**No mutating admin endpoint ships without `@Audit`.** PR review checks this.
The audit log is **append-only** — never updated or deleted.
