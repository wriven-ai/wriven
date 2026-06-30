# Admin Panel — Tenant Oversight (users / workspaces / projects)

Cross-tenant, unscoped read/write over tenant identity data. Lives in
auth-service `admin-tenancy.service.ts`, exposed via `admin.*` RPC
([05-rpc.md](./05-rpc.md)) and the `/admin/users|workspaces|projects` endpoints
([06-endpoints.md](./06-endpoints.md)). Status: **Phase B (done)**.

---

## Users

- **list** — search/paginate ALL tenant `users`. Batched counts (workspace count
  per user) — **no N+1**.
- **get** — detail + memberships (workspaces + roles) + recent activity.
- **update** `[admin|moderator]` — suspend/reactivate, force-verify. Suspending
  sets `users.suspendedAt` **and revokes the user's refresh tokens** (kills active
  sessions, not just new logins; `auth.refresh` also rejects suspended accounts).
- **resendVerification** `[admin|moderator]`.
- **delete** `[admin]` — soft-delete / GDPR. FK-guarded: a `23503` violation maps
  to `CONFLICT` rather than a 500.

---

## Workspaces

- **list** — workspace + owner + member/project counts + storage + plan. Batched
  counts, no N+1.
- **get** — members, projects, storage, plan (gateway merges auth_svc identity
  with core_svc storage totals).
- **update / suspend** `[admin|moderator]` — rename / suspend.
- **setPlan** `[admin]` — assign plan + overrides (atomic upsert, see
  [09-plans.md](./09-plans.md)).

---

## Projects

- **list** — cross-workspace (counts: types/entries/keys/webhooks).
- **get** — detail; drills into the project's content/keys/webhooks (read-only
  oversight).
- **delete** `[admin]` — soft-delete. `and(inArray(...), isNull(deletedAt))` on
  active-project counts (Drizzle `and()`, not JS `&&`).

---

## Invariants

- Cross-tenant access **only** through explicit `admin.*` RPC — tenant handlers
  stay scoped/untouched.
- Every mutation is `@Audit`-wrapped ([04-audit.md](./04-audit.md)).
- All lists paginate + filter + sort; never unbounded.
