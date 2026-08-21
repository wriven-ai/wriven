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
POST   /admin/auth/login                 # single-step email+password -> cookies (no TOTP step)
POST   /admin/auth/refresh
POST   /admin/auth/logout
GET    /admin/auth/me                    # AdminView (id/email/name/role/active/lastLoginAt/createdAt) + csrfToken

# Metrics
GET    /admin/metrics/overview           # gateway merge of auth+core counts (users/ws/projects/entries/storage/plan split — no growth fields)

# Tenant users
GET    /admin/users                      # search/paginate
GET    /admin/users/:id                  # detail + memberships + activity
PATCH  /admin/users/:id                  [admin|moderator]  # suspend/reactivate, force-verify
DELETE /admin/users/:id                  [admin]            # HARD delete (FK violations → CONFLICT)

# Workspaces
GET    /admin/workspaces                 # list + owner + usage + plan
GET    /admin/workspaces/:id             # members, projects, storage, plan
# (no PATCH /admin/workspaces/:id — suspend/rename not implemented)
PUT    /admin/workspaces/:id/plan        [admin]            # assign plan + overrides

# Projects
GET    /admin/projects                    # cross-workspace
GET    /admin/projects/:id
GET    /admin/projects/:id/usage          # per-project counts
DELETE /admin/projects/:id               [admin]            # soft-delete

# Content types
GET    /admin/content-types               # all content types (cross-tenant)

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
PATCH  /admin/webhooks/:id/disable       [admin|moderator]  # disable

# Support (staff ticket handling)
GET    /admin/support/tickets            # queue (filters: status/priority/scopeType/workspaceId/assignedAdminId/unassigned/q)
GET    /admin/support/tickets/:id        # full thread incl. internal notes
POST   /admin/support/tickets/:id/messages  [admin|moderator]
PATCH  /admin/support/tickets/:id        [admin|moderator]  # status/priority/assignee
GET    /admin/support/metrics            # open/pending/resolved/closed/unassigned/total

# Plans (definitions)
GET    /admin/plans
POST   /admin/plans                       [admin]
PATCH  /admin/plans/:id                   [admin]

# Admin users
GET    /admin/admins                      [admin]
POST   /admin/admins                      [admin]
PATCH  /admin/admins/:id                  [admin]   # { role?, active? } only
DELETE /admin/admins/:id                  [admin]

# Audit
GET    /admin/audit-log                    # ?page&limit&action&targetType
```

Responses use the standard `{ success, data }` / `{ success, error }` envelope. The
frontend client unwraps `data` and throws `error`.
