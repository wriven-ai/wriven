# 02 — Tenancy Data Model

The membership graph behind RBAC: who is a member of what, and where roles live.

![Tenancy data model](./02-tenancy-data-model.svg)

## Shape

```
users ──< workspace_members >── workspaces ──< projects
  └──────────< project_members >───────────────────┘
invitations ──(resolves to workspace | project)──> a member row on accept
```

- **users** — identity. Platform-admin identity is separate (`admin_users`).
- **workspaces** — top-level tenancy unit; creator becomes `owner` on signup.
- **workspace_members** — M:N junction; **role lives here** (`owner | admin | member | guest`).
- **projects** — owned by a workspace; soft-deleted via `deletedAt`.
- **project_members** — M:N junction; **role lives here** (`admin | editor | viewer`). **Optional** — a workspace owner/admin needs no row (cascade grants access).
- **invitations** — pending member rows; scope is `workspace | project`; accept seeds the matching `_members` row.

## Rules

- A user's role is **not one value** — it's a per-workspace row + a per-project row. `effectivePermissions` unions them (see [01-auth-rbac](./01-auth-rbac.md)).
- Invariants: ≥1 `owner` per workspace, ≥1 `admin` per project; only a workspace `owner` may grant/transfer the owner role.
- Single shared Postgres, schema-isolated (`auth_svc` / `core_svc`). core_svc rows carry `projectId` (denormalized `workspaceId`) but **no enforced cross-schema FK** — the gateway injects the scope.
- **Scope note:** this diagram shows only the membership graph. `auth_svc` also holds billing/token/admin tables (`plans`, `subscriptions`, `stripe_events`, `refresh_tokens`, `password_reset_tokens`, `email_verification_tokens`, `admin_users`, `admin_refresh_tokens`, `admin_audit_log`); `core_svc` also holds content/revisions, `media_assets`, `api_keys`, `webhooks`, `usage_buckets`, `ai_generations`, `ai_profiles`, and the support-ticket tables (see [00-system-overview](./00-system-overview.md)).

## Source

[`02-tenancy-data-model.svg`](./02-tenancy-data-model.svg) · schema: [`apps/auth-service/src/db/schema/index.ts`](../../apps/auth-service/src/db/schema/index.ts)
