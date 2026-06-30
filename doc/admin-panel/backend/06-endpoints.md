# Admin Panel — HTTP Endpoint Surface (`/admin/*`)

The full public HTTP contract the SPA consumes. All under `AdminJwtGuard`.
Mutations under `CsrfGuard` + `@Audit`. Role gates shown in brackets — none = any
admin (incl. `member`, read-only).

> Concrete request/response shapes + copy-paste TS types are in
> [../api-contract.md](../api-contract.md). Per-module behavior in
> [07-tenancy.md](./07-tenancy.md), [08-moderation.md](./08-moderation.md),
> [09-plans.md](./09-plans.md).

```
# Auth
POST   /admin/auth/login                 # email+password -> cookies, or { mfaRequired }
POST   /admin/auth/login/totp            # 6-digit code -> cookies
POST   /admin/auth/refresh
POST   /admin/auth/logout
GET    /admin/auth/me                    # { adminUserId, email, name, role }

# Metrics
GET    /admin/metrics/overview           # KPIs: users/ws/projects/entries/storage, growth, plan split

# Tenant users
GET    /admin/users                      # search/paginate
GET    /admin/users/:id                  # detail + memberships + activity
PATCH  /admin/users/:id                  [admin|moderator]  # suspend/reactivate, force-verify
POST   /admin/users/:id/resend-verification   [admin|moderator]
DELETE /admin/users/:id                  [admin]            # soft-delete / GDPR

# Workspaces
GET    /admin/workspaces                 # list + owner + usage + plan
GET    /admin/workspaces/:id             # members, projects, storage, plan
PATCH  /admin/workspaces/:id             [admin|moderator]  # suspend / rename
PUT    /admin/workspaces/:id/plan        [admin]            # assign plan + overrides

# Projects
GET    /admin/projects                    # cross-workspace
GET    /admin/projects/:id
DELETE /admin/projects/:id               [admin]            # soft-delete

# Content moderation
GET    /admin/content                     # global entry browser (read-only)
GET    /admin/content/:id
PATCH  /admin/content/:id                [admin|moderator]  # takedown: archive/unpublish

# Media
GET    /admin/media                        # usage per workspace, large/abusive files
DELETE /admin/media/:id                  [admin|moderator]  # purge

# API keys
GET    /admin/api-keys                     # all keys (prefix/scope/project/lastUsed)
DELETE /admin/api-keys/:id               [admin|moderator]  # revoke

# Webhooks
GET    /admin/webhooks                      # all + last status
PATCH  /admin/webhooks/:id               [admin|moderator]  # disable

# Invitations
GET    /admin/invitations                   # pending system-wide

# Plans (definitions)
GET    /admin/plans
POST   /admin/plans                       [admin]
PATCH  /admin/plans/:id                   [admin]

# Admin users
GET    /admin/admins                      [admin]
POST   /admin/admins                      [admin]
PATCH  /admin/admins/:id                  [admin]   # role, deactivate, reset MFA
DELETE /admin/admins/:id                  [admin]

# Audit
GET    /admin/audit-log                    # filter by admin/action/target/date
```

Responses use the standard `{ success, data }` / `{ success, error }` envelope. The
frontend client unwraps `data` and throws `error`.
