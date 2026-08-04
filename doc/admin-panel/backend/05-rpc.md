# Admin Panel — Cross-tenant `admin.*` RPC

Tenant message patterns are scoped to the calling user's memberships. Admin needs
unscoped, cross-tenant reads/writes. **Add new `admin.*` message patterns** in
auth-service and core-service rather than loosening tenant handlers (keeps god-mode
explicit and greppable).

Patterns are declared in
[libs/shared/contracts/src/lib/messages.ts](../../../libs/shared/contracts/src/lib/messages.ts)
as `ADMIN_PATTERNS`. Add to the existing TCP controllers (or a new
`admin.controller.ts` per service). Name them `admin.<area>.<action>`.

---

## auth-service (`admin.controller.ts`)

```
admin.auth.login / admin.auth.totp / admin.auth.refresh / admin.auth.logout / admin.auth.me
admin.adminUsers.list / .get / .create / .update / .delete
admin.audit.write / admin.audit.list
admin.users.list (search/paginate ALL tenant users) / .get / .update / .delete / .resendVerification
admin.workspaces.list (+owner, member/project counts, plan) / .get / .update / .suspend
admin.workspaces.setPlan
admin.projects.list / .get / .delete
admin.invitations.list
admin.plans.list / .create / .update
admin.metrics.overview (counts + growth from auth_svc)
```

Plus `auth.entitlements.resolve` (`AUTH_PATTERNS.ENTITLEMENTS_RESOLVE`) — resolves
effective plan limits + usage for a workspace (used by core-side enforcement, see
[09-plans.md](./09-plans.md)).

---

## core-service (`admin.controller.ts`)

```
admin.content.list (cross-tenant, filter ws/project/type/status) / .get / .takedown
admin.media.usageByWorkspace / .list / .purge
admin.apiKeys.list / .revoke
admin.webhooks.list / .disable
admin.metrics.content (entry/media/key counts + storage totals)
```

---

## Gateway fan-out

Gateway controllers fan out to whichever service owns the data; for screens that
need both identity and content (e.g. workspace detail with storage), the gateway
calls both and merges — same pattern the tenant side already uses across the
`auth_svc`/`core_svc` no-FK boundary.

All list endpoints: **paginate + filter + sort** (match the tenant list contract
in [06](../../06-api-reference.md)). Never return unbounded result sets.
