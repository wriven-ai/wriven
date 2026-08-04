# 07 — Admin Panel (Platform Console)

The operational console for Wriven staff — cross-tenant. **Separate identity and a separate RBAC axis** from tenant RBAC.

![Admin panel](./07-admin-panel.svg)

## Identity + guards
- **admin_users** — distinct from tenant `users`. Roles: `super_admin / admin / support / viewer`.
- **AdminAuthGuard** — separate admin JWT → sets `req.adminUser`.
- **AdminRolesGuard** + `@AdminRoles(...)` — mirrors the tenant `PermissionGuard` (which copied *its* pattern). FORBIDDEN on role miss.

## Services (platform scope, cross-tenant)
tenancy moderation · content/media/key/webhook moderation · plans CRUD + assignment (+ Stripe sync) · plan-limit enforcement · metrics · **audit log** (platform-side; tenants have none).

## Frontend
Separate repo (not `apps/client`), talks to the same gateway `/admin/*` routes. In progress (P1).

## The two RBAC axes (don't confuse them)
| | Platform admin | Tenant RBAC |
|---|---|---|
| Identity | `admin_users` | `users` |
| Guard | `AdminRolesGuard` | `PermissionGuard` |
| Roles | super_admin/admin/support/viewer | owner/admin/member/guest + project admin/editor/viewer |
| Scope | all tenants | one tenant |
| Stack | fully independent | fully independent |

No `isSuperAdmin` flag on tenant users — by design.

## Source
[`07-admin-panel.svg`](./07-admin-panel.svg) · code: [`apps/*/src/admin/`](../../apps/api-gateway/src/admin/)
