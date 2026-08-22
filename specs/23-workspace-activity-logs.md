# Spec: Workspace Activity Logs

> Priority: P2 · Area: cross (gateway + auth + client) · Status: drafted

## Overview

Tenant-side audit log: a per-workspace "who did what" feed visible to workspace
members in the client dashboard, filterable by age (7 / 30 / 90 days) and
paginated. This closes the P2 gap "Tenant-side audit log" in
[`doc/market-readiness.md`](../doc/market-readiness.md) ("the admin console has
its own audit log; tenants don't — expected for teams/compliance"). The write
path mirrors the proven admin-audit design: a gateway interceptor + per-route
decorator fire-and-forget a log row over TCP, so auditing never fails a user
request and services stay decoupled.

## Depends on

- specs/12 (RBAC permission layer — new view permission rides the existing
  catalog + cascade) and specs/13 (frontend `useCan()` gating).
- Admin audit implementation (not a spec — the pattern being mirrored):
  `apps/api-gateway/src/admin/audit.interceptor.ts`, `audit.decorator.ts`,
  `apps/auth-service/src/admin/admin-audit.service.ts`.

## Tooling context (skills / MCP / plugins)

- supabase MCP — checked, used: no. The Drizzle schema in
  `apps/auth-service/src/db/schema/index.ts` is the source of truth for table
  design; a live prod query adds nothing for drafting.
- context7 / stripe / prisma plugins — checked, not relevant (no external
  library, payment, or ORM question this feature needs).

## Scope

- In scope:
  - New `workspace_activity_log` table in `auth_svc` (append-only, written by
    the gateway, read via a workspace-scoped endpoint).
  - Gateway `@WorkspaceAudit(action, target?)` decorator + global interceptor
    that writes a row after a marked route succeeds (fire-and-forget, mirrors
    `AuditInterceptor`).
  - Curated v1 event catalog (below) marked on existing gateway routes — no new
    business logic anywhere.
  - Read API `GET /logs?days=7|30|90&page&limit` →
    `Paginated<WorkspaceLogView>` (actor name/email joined).
  - Daily retention cron (default 90 days) in auth-service.
  - New permission `WORKSPACE_LOGS_VIEW` (owner/admin/member; guest no).
  - Client page `/w/[wsSlug]/logs` with 7/30/90-day segmented filter +
    pagination, and a sidebar entry in the workspace menu.
- Out of scope:
  - Admin-panel changes (separate repo, has its own audit).
  - AI generations (already audited/metered in `ai_generations` + `/usage`).
  - Delivery-API (api-key) reads — that's usage metering (specs/14).
  - Filtering by member/action in the UI, CSV export, retention UI, log
    streaming (follow-ups).
  - Events for actions taken without an authenticated workspace context
    (invitation accept via public token, signup, login).

### v1 event catalog

Dot-namespaced `action` strings, stored as text, catalog exported from
contracts so gateway validation and client labels stay in sync:

| Action | Route source (gateway) | Target |
|---|---|---|
| `workspace.update` | workspaces controller (`PATCH :workspaceId`) | `workspace` |
| `member.add` / `member.update` / `member.remove` | workspaces controller members routes | `member` |
| `invitation.create` / `invitation.revoke` | invitations controller (workspace + project) | `invitation` |
| `project.create` / `project.update` / `project.delete` | projects controller | `project` |
| `billing.swap` | billing controller (covers cancel-to-free) | `subscription` |
| `contentType.create` / `contentType.update` / `contentType.delete` | `content.controller.ts` `types` routes | `contentType` |
| `entry.create` / `entry.update` / `entry.delete` / `entry.publish` / `entry.restore` | `content.controller.ts` `entries` routes | `entry` |
| `media.upload` / `media.delete` | media controller (`media.upload` on the asset-create POST, not presign; `media.delete` on delete + bulk-delete) | `media` |
| `apiKey.create` / `apiKey.regenerate` / `apiKey.revoke` | api-keys controller | `apiKey` |
| `webhook.create` / `webhook.update` / `webhook.delete` | webhooks controller | `webhook` |

`targetId` comes from the route `:id` param, falling back to the created
entity's `id` in the handler result (same rule as admin audit). Handlers may
set `req.logMeta` for extra metadata (e.g. entry title at action time) — keep
payloads small and non-sensitive.

Not catalogued, deliberately: `workspace.delete` (the interceptor fires after
the handler, and the workspace cascade has already deleted the row the log
would reference — the write can never succeed), invitation resend/accept
(resend is low-value; accept runs on a public token route with no workspace
context), and workspace/project create-time seeding done inside signup.

## API / endpoints

- `GET /logs?days=7|30|90&page=1&limit=20` — paginated activity feed for the
  `X-Workspace-Id` workspace, cut off at `now - days` — access-token +
  workspace-member + `WORKSPACE_LOGS_VIEW`. Header-scoped like `/usage` (the
  PermissionGuard chain needs WorkspaceGuard's header context; a
  path-param route can't feed it).

No other endpoints change. The write path is an interceptor, not an endpoint.

## Shared contracts (@wriven/contracts)

- `types/workspace-log.types.ts` (new):
  - `WorkspaceLogView` — `{ id, userId, userName, userEmail, action,
    targetType, targetId, projectId, metadata, createdAt }` (ISO strings; no
    IP — tenant-facing privacy).
  - `WORKSPACE_LOG_ACTIONS` — readonly array of the catalog above +
    `WorkspaceLogAction` union type.
  - `WorkspaceLogWritePayload` — what the gateway sends over TCP:
    `{ workspaceId, userId, projectId?, action, targetType?, targetId?,
    metadata? }`.
- `dto/workspace-log.dto.ts` (new): `WorkspaceLogQueryDto` — `days`
  (`@IsIn([7, 30, 90])`, default 30), `page`, `limit` (existing pagination
  bounds: default 20, max 100).
- `messages.ts`: `WORKSPACE_PATTERNS.LOG_WRITE = 'auth.workspace.log.write'`,
  `WORKSPACE_PATTERNS.LOG_LIST = 'auth.workspace.log.list'`.
- `types/rbac.types.ts`: `Permission.WORKSPACE_LOGS_VIEW` added to the enum and
  to the owner/admin/member role permission sets (guest keeps just view).
- `errors.ts`: no new codes — `VALIDATION_ERROR` (bad `days`), `FORBIDDEN`
  (missing permission) already cover it.

## Database / schema

`auth_svc` (auth-service owns the table — tenancy domain, single writer is the
gateway over TCP, single reader is the logs endpoint; avoids a second audit
table in `core_svc`):

```ts
export const workspaceActivityLog = authSchema.table(
  'workspace_activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }), // workspace deleted → logs go
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'set null' }),     // member removed → log stays
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('workspace_activity_log_ws_created_idx').on(t.workspaceId, t.createdAt),
    index('workspace_activity_log_ws_user_idx').on(t.workspaceId, t.userId),
  ],
);
```

Migration: `pnpm db:auth:generate` then `pnpm db:auth:migrate`. Relations entry
for `users`/`workspaces` matching the existing `adminAuditLog` style.

## Backend changes

**api-gateway**
- **Create:** `src/common/workspace-audit.decorator.ts` (SetMetadata helper,
  same shape as admin's), `src/common/workspace-audit.interceptor.ts` — bound
  per-controller via `@UseInterceptors(…)` exactly like the admin
  `AuditInterceptor` (not a global `APP_INTERCEPTOR`); no-ops unless the
  decorator metadata exists; after handler success builds
  `WorkspaceLogWritePayload` from `req.user.userId`, workspace id =
  `req.workspaceId ?? req.params?.workspaceId ?? result?.workspace?.id`
  (header routes, path-param routes, `POST /workspaces`), `projectId` =
  `req.projectId ?? req.params?.projectId`, `:id` param / result id, and
  `req.logMeta`; `auth.send(WORKSPACE_PATTERNS.LOG_WRITE, …).subscribe` with an
  error log only (never fails the request).
- **Create:** `src/logs/logs.controller.ts` — `@Controller('logs')`,
  `@UseGuards(JwtAuthGuard, WorkspaceGuard, PermissionGuard)` +
  `@RequirePermission(WORKSPACE_LOGS_VIEW)` (mirror of `UsageController`):
  `GET /logs` forwards `{ workspaceId, …query }` → TCP `LOG_LIST`.
- **Modify:** the controllers named in the event catalog — add
  `@UseInterceptors(WorkspaceAuditInterceptor)` at controller level +
  `@WorkspaceAudit(action, target)` on each catalogued route; add the
  interceptor to `app.module.ts` providers (DI availability, like
  `AuditInterceptor`).

**auth-service** (tenancy lives in `src/auth/`, not a `src/workspaces/` module)
- **Create:** `src/auth/workspace-logs.service.ts` — `write()`
  (insert, best-effort), `list(workspaceId, query)` (join `users` for
  name/email, `where workspaceId and createdAt >= cutoff`, order `createdAt
  desc`, `Paginated<WorkspaceLogView>` with ISO dates).
- **Modify:** `src/db/schema/index.ts` (table + relations + exports),
  `src/auth/workspaces.controller.ts` (two `@MessagePattern` handlers),
  `src/auth/auth.module.ts` (register the service), and
  `src/auth/cleanup.service.ts` — extend the existing daily cron with a
  retention prune: delete rows older than `WORKSPACE_LOG_RETENTION_DAYS`
  (default 90); `apps/auth-service/.env.example`.

**core-service** — none (the gateway audits its routes; core is untouched).
**ai-service** — none.

## Frontend changes (apps/client)

- **Create:** `app/(dashboard)/w/[wsSlug]/logs/page.tsx` — activity table
  (time, actor, action label + target, project badge when set) with a 7/30/90
  segmented control (URL search-param `days`, default 30) and pagination;
  TanStack Query keyed `['workspace-logs', wsId, days, page]`. A local
  action→label/description map component (contracts export the union type; the
  label strings live client-side).
- **Modify:** `lib/api.ts` — `workspaceLogApi.list({ days, page, limit })`
  against `GET /logs` (manual `URLSearchParams` query like `contentApi`, and
  pass `{ workspace: true }` so the request layer sends `X-Workspace-Id` —
  scope headers are opt-in per call).
  `components/sidebar/builders/build-workspace-nav.ts` — "Activity Log" leaf
  (between Members and Usage) gated by `WORKSPACE_LOGS_VIEW`; the shared rbac
  subpath picks the new permission up automatically.

## Files to create

- `libs/shared/contracts/src/lib/types/workspace-log.types.ts`
- `libs/shared/contracts/src/lib/dto/workspace-log.dto.ts`
- `apps/api-gateway/src/common/workspace-audit.decorator.ts`
- `apps/api-gateway/src/common/workspace-audit.interceptor.ts`
- `apps/api-gateway/src/logs/logs.controller.ts`
- `apps/auth-service/src/auth/workspace-logs.service.ts`
- `apps/auth-service/src/db/migrations/<generated>_workspace_activity_log.sql`
- `apps/client/src/app/(dashboard)/w/[wsSlug]/logs/page.tsx`
- `apps/client/src/components/logs/log-action-labels.ts`

## Files to modify

- `libs/shared/contracts/src/lib/messages.ts`, `types/rbac.types.ts`,
  `src/index.ts` (exports)
- `apps/api-gateway/src/app/app.module.ts` (interceptor provider entry)
- `apps/api-gateway/src/{members,billing,content,api-keys,webhooks}/*.controller.ts`
  (`@UseInterceptors` + `@WorkspaceAudit` decorators)
- `apps/auth-service/src/db/schema/index.ts`
- `apps/auth-service/src/auth/workspaces.controller.ts`,
  `auth.module.ts`, `cleanup.service.ts`, `apps/auth-service/.env.example`
- `apps/client/src/lib/api.ts`,
  `apps/client/src/components/sidebar/builders/build-workspace-nav.ts`

## New dependencies

No new dependencies.

## Rules for implementation

Base:
- Define shared DTOs/types/patterns/errors in `libs/shared/contracts`
  (`@wriven/contracts`) — check it before creating new ones.
- Store only R2 object **keys** in the DB; reconstruct URLs at runtime.
- Respect microservice boundaries — do not collapse auth/core/ai logic.
- Endpoints return the response envelope; use error codes from
  `@wriven/contracts/errors.ts`; never leak stack traces or DB errors.
- Use dot-namespaced patterns from `@wriven/contracts/messages.ts`, never
  hardcoded strings.
- Frontend (`apps/client`) and backend changes go in **separate commits**;
  stage selectively, never `git add -A` across both.
- Run tasks through `pnpm nx <target> <project>`. Commits are one-line
  Conventional Commits with no body.

Feature-specific:
- The interceptor is **fire-and-forget** — a failed log write must never fail
  or slow the audited request (subscribe with error-logging only, no await).
- Never log request/response bodies or field content into `metadata` — ids,
  names/titles, and counts only.
- The tenant view exposes **no IP addresses** (unlike the admin audit view).
- `days` accepts exactly 7 | 30 | 90 server-side (`@IsIn`) — the segmented
  control is not the gate.
- Retention prune is a plain DELETE on `created_at < cutoff` — idempotent,
  safe to re-run; keep it out of the request path.
- `WorkspaceLogView.userName/userEmail` resolve at read time via join; a
  removed member's rows remain (userId set-null) and show `null` actor fields —
  the UI must render that state.

## Definition of done

- [ ] `pnpm nx build shared-contracts && pnpm nx typecheck shared-contracts`
      pass (contracts + exports compile).
- [ ] `pnpm nx build api-gateway && pnpm nx typecheck api-gateway` and the
      same for `auth-service` pass.
- [ ] `pnpm nx build client && pnpm nx typecheck client` pass.
- [ ] `pnpm db:auth:generate` produces the `workspace_activity_log` migration;
      `pnpm db:auth:migrate` applies cleanly locally.
- [ ] Smoke (dev:gateway + dev:auth + dev:client): create+publish an entry,
      add a member, rotate an API key → each appears in
      `/w/<slug>/logs?days=7` with actor, action label, and target.
- [ ] `days=30` / `days=90` switch the cutoff; `days=45` → 422
      `VALIDATION_ERROR`.
- [ ] Pagination works (`page`/`limit` respected, `total` correct).
- [ ] Guest-role member: no "Activity Log" nav item and `GET /logs` → 403;
      owner/admin/member see it.
- [ ] Remove a member who has log rows → their rows survive with the actor
      shown as removed/unknown.
- [ ] Stop auth-service, perform a logged action through the gateway → request
      still succeeds (write is fire-and-forget; gateway logs the miss).
- [ ] Retention: insert a backdated row (>90d), run the cron → row pruned;
      recent rows untouched.
