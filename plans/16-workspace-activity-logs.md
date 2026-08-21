# Plan: Workspace Activity Logs

> Status: drafted · Executes: spec 23 (`specs/23-workspace-activity-logs.md`) · Supersedes: -

## Goal

Ship a tenant-facing per-workspace activity log: gateway interceptor records
who-did-what on ~25 mutating routes, auth-service stores/serves it, client
shows it at `/w/[wsSlug]/logs` with a 7/30/90-day filter.

## Current state

- Admin-audit pattern exists and is the template: gateway
  `src/admin/audit.interceptor.ts` + `audit.decorator.ts` (fire-and-forget TCP
  `admin.audit.write`), auth-service `src/admin/admin-audit.service.ts`
  (`admin_audit_log` table, `Paginated<AuditLogView>` list).
- Gateway workspace-tenant routes: `src/members/workspaces.controller.ts`
  (path-param style, `:workspaceId/members*`), `src/members/projects.controller.ts`,
  `src/members/invitations.controller.ts`, `src/billing/billing.controller.ts`
  (`POST /billing/swap` …, header-scoped via WorkspaceGuard), `src/content/content.controller.ts`
  (types + entries incl. `POST entries/:id/publish`, `POST entries/:id/revisions/:version/restore`),
  `src/content/media.controller.ts`, `src/api-keys/api-keys.controller.ts`
  (`POST /`, `POST :id/regenerate`, `DELETE :id`), `src/webhooks/webhooks.controller.ts`
  (`POST /`, `PATCH :id`, `DELETE :id`). All header-scoped routes already run
  WorkspaceGuard (+ PermissionGuard via `@RequirePermission`).
- auth-service tenancy lives in `src/auth/` (workspaces/members/projects
  services + TCP `@MessagePattern` controllers); daily cron precedent in
  `src/auth/cleanup.service.ts`.
- Contracts barrel: single `src/index.ts` re-exports `lib/dto/*` and
  `lib/types/*`; `Paginated` lives in `types/cms.types.ts`; `Permission` enum +
  `WORKSPACE_ROLE_PERMISSIONS` maps in `types/rbac.types.ts`.
- Client: single `lib/api.ts` with per-domain api objects (`memberApi`,
  `usageApi`, …); the request layer sends `X-Workspace-Id`/`X-Project-Id`
  only when a call passes `{ workspace: true }` / `{ project: true }` init
  flags (query strings built manually via `URLSearchParams`); nav via
  `components/sidebar/builders/build-workspace-nav.ts` (gated by
  `Permission` from `@wriven/contracts/rbac`).
- Nothing tenant-side exists today (spec gap: market-readiness P2
  "Tenant-side audit log").

## Phases

### Phase 1 — Shared contracts

- **Why here** — first: every other phase compiles against these types,
  patterns, and the new permission.
- **Files — create:**
  - `libs/shared/contracts/src/lib/types/workspace-log.types.ts` —
    `WorkspaceLogView` (`id, userId, userName, userEmail, action, targetType,
    targetId, projectId, metadata, createdAt` — ISO strings, no IP),
    `WorkspaceLogWritePayload`, `WORKSPACE_LOG_ACTIONS` (readonly catalog from
    spec §v1) + `WorkspaceLogAction` union.
  - `libs/shared/contracts/src/lib/dto/workspace-log.dto.ts` —
    `WorkspaceLogQueryDto`: `days @IsIn([7,30,90])` default 30, `page`,
    `limit` (default 20, max 100 — copy pagination decorators from
    `AdminAuditQueryDto`).
- **Files — modify:**
  - `libs/shared/contracts/src/lib/messages.ts` — `WORKSPACE_PATTERNS.LOG_WRITE
    = 'auth.workspace.log.write'`, `LOG_LIST = 'auth.workspace.log.list'`.
  - `libs/shared/contracts/src/lib/types/rbac.types.ts` — add
    `WORKSPACE_LOGS_VIEW = 'WORKSPACE_LOGS_VIEW'` to the `Permission` enum;
    grant it in `WORKSPACE_ROLE_PERMISSIONS` for owner, admin, and member
    (guest unchanged).
  - `libs/shared/contracts/src/index.ts` — re-export both new files.
- **Shared contracts:** the above (this phase *is* the contracts change).
- **Verify:** `pnpm nx build shared-contracts && pnpm nx typecheck shared-contracts`
  (adjust project name to the nx target if it differs — check `pnpm nx show projects`).

### Phase 2 — auth-service: table, service, TCP handlers, retention

- **Why here** — needs Phase 1 patterns/types; gateway (Phase 3) sends to
  these handlers.
- **Files — create:**
  - `apps/auth-service/src/auth/workspace-logs.service.ts` —
    `write(payload: WorkspaceLogWritePayload)` (plain insert, mirrors
    `AdminAuditService.write`), `list(p: { workspaceId } & WorkspaceLogQueryDto)`:
    `where workspaceId = … and createdAt ≥ now − days`, join `users` (left —
    userId is set-null after member deletion) for `userName`/`userEmail`,
    order `createdAt desc`, `Paginated<WorkspaceLogView>` with ISO dates via
    `$count` (same shape as `AdminAuditService.list`).
  - Migration SQL (generated, not hand-written): `pnpm db:auth:generate`.
- **Files — modify:**
  - `apps/auth-service/src/db/schema/index.ts` — `workspaceActivityLog` table
    exactly as spec §Database (FKs: workspace `cascade`, user `set null`,
    project `set null`; indexes `(workspaceId, createdAt)` and
    `(workspaceId, userId)`) + relations entry + export; add `activityLogs`
    relation on `users`/`workspaces` if the existing pattern does so.
  - `apps/auth-service/src/auth/workspaces.controller.ts` — two
    `@MessagePattern` handlers (`LOG_WRITE`, `LOG_LIST`) delegating to the
    service.
  - `apps/auth-service/src/auth/auth.module.ts` — register
    `WorkspaceLogsService`.
  - `apps/auth-service/src/auth/cleanup.service.ts` — add
    `@Cron(CronExpression.EVERY_DAY_AT_3AM)` `pruneActivityLogs()`:
    `delete … where createdAt < now − WORKSPACE_LOG_RETENTION_DAYS` (env,
    default 90 via `Number(process.env.… ?? 90)`); log pruned count like the
    token method.
  - `apps/auth-service/.env.example` — `WORKSPACE_LOG_RETENTION_DAYS=90`.
- **Shared contracts:** none (consumed only).
- **Verify:** `pnpm db:auth:generate` → review generated SQL (table + 2
  indexes + FKs), `pnpm db:auth:migrate` applies clean against local
  docker Postgres; `pnpm nx typecheck auth-service && pnpm nx build auth-service`.

### Phase 3 — api-gateway: decorator, interceptor, route marking, read endpoint

- **Why here** — needs Phase 1 contracts + Phase 2 TCP handlers live.
- **Files — create:**
  - `apps/api-gateway/src/common/workspace-audit.decorator.ts` — clone of
    `admin/audit.decorator.ts` shape: `WorkspaceAudit(action, target?)` →
    `SetMetadata(WS_AUDIT_KEY, { action, target })`.
  - `apps/api-gateway/src/common/workspace-audit.interceptor.ts` — clone of
    `admin/audit.interceptor.ts` mechanics against the tenant payload:
    skip unless metadata present; after `next.handle()` success build
    `WorkspaceLogWritePayload` from `req.user.userId`, workspace id =
    `req.workspaceId ?? req.params?.workspaceId ?? result?.workspace?.id`
    (covers header-scoped routes, path-param `workspaces`/`members` routes,
    and `POST /workspaces` whose result is `{ workspace, project }`),
    `projectId = req.projectId ?? req.params?.projectId`, `targetId` =
    `req.params?.id ?? result?.id ?? null`, `metadata = req.logMeta ?? {}`;
    `auth.send(WORKSPACE_PATTERNS.LOG_WRITE, …).subscribe({ error: log })` —
    never throw, never await.
  - `apps/api-gateway/src/logs/logs.controller.ts` — `@Controller('logs')`,
    `@UseGuards(JwtAuthGuard, WorkspaceGuard, PermissionGuard)` +
    `@RequirePermission(Permission.WORKSPACE_LOGS_VIEW)` on `@Get()` — a
    line-for-line mirror of `UsageController` (guards chain,
    `@CurrentWorkspace()` for the id). Forwards
    `{ workspaceId, …WorkspaceLogQueryDto }` via TCP `LOG_LIST`.
- **Files — modify:**
  - `apps/api-gateway/src/app/app.module.ts` — add `WorkspaceAuditInterceptor`
    to providers (DI availability, exactly how the bare `AuditInterceptor`
    entry works — it is **not** a global `APP_INTERCEPTOR`; the admin one is
    bound per-controller).
  - Add `@UseInterceptors(WorkspaceAuditInterceptor)` at controller level +
    `@WorkspaceAudit(action, target)` on each catalogued route (spec §v1):
    - `src/members/workspaces.controller.ts` — `PATCH :workspaceId`
      (`workspace.update`), `POST :workspaceId/members` (`member.add`),
      `PATCH …/members/:userId` (`member.update`), `DELETE …/members/:userId`
      (`member.remove`). **Not** `DELETE :workspaceId` — the interceptor runs
      after the handler, the workspace cascade has already removed the FK
      target, and the log insert would always fail.
    - `src/members/projects.controller.ts` — `POST
      workspaces/:workspaceId/projects`, `PATCH projects/:projectId`,
      `DELETE projects/:projectId` → `project.*` (skip the project-member
      sub-routes for v1 unless trivial).
    - `src/members/invitations.controller.ts` — both `POST …/invitations`
      routes → `invitation.create`, `DELETE invitations/:id` →
      `invitation.revoke` (resend + public accept stay undecorated).
    - `src/billing/billing.controller.ts` — `POST /billing/swap` →
      `billing.swap` (cancel-to-free flows through swap; no separate cancel
      route exists).
    - `src/content/content.controller.ts` — `POST types`, `PATCH types/:id`,
      `DELETE types/:id` → `contentType.*`; `POST entries`, `PATCH
      entries/:id`, `DELETE entries/:id` → `entry.*`; `POST
      entries/:id/publish` → `entry.publish`; `POST
      entries/:id/revisions/:version/restore` → `entry.restore`.
    - `src/content/media.controller.ts` — asset-create `POST /` →
      `media.upload` (not `presign` — an unused presign isn't an upload);
      `DELETE :id` + `POST bulk-delete` → `media.delete`.
    - `src/api-keys/api-keys.controller.ts` — `POST /`, `POST :id/regenerate`,
      `DELETE :id` → `apiKey.create/regenerate/revoke`.
    - `src/webhooks/webhooks.controller.ts` — `POST /`, `PATCH :id`,
      `DELETE :id` → `webhook.create/update/delete`.
  - Do **not** decorate `ai.controller.ts` (AI generations audited
    separately), delivery API, or read routes.
- **Shared contracts:** none (consumed only).
- **Verify:** `pnpm nx typecheck api-gateway && pnpm nx build api-gateway`;
  then smoke with `pnpm dev:gateway` + `pnpm dev:auth` + local DB:
  login → `PATCH /workspaces/:id` → row appears in
  `auth_svc.workspace_activity_log`; `POST /content/entries` similarly;
  `GET /logs?days=7` (header `X-Workspace-Id`) returns both; `?days=45` →
  422 envelope.

### Phase 4 — Client: page, api, nav

- **Why here** — last: consumes the finished endpoint; frontend commit kept
  separate from backend.
- **Files — create:**
  - `apps/client/src/app/(dashboard)/w/[wsSlug]/logs/page.tsx` — TanStack
    Query `['workspace-logs', wsId, days, page]`; segmented 7/30/90 control
    driven by `?days=` search param (default 30, `useSearchParams` +
    `router.replace`); table columns: time, actor (name + email, or
    "Removed member" when null), action label, target, project badge when
    `projectId`; standard pagination (copy the pattern from the Usage or
    Support page); loading/empty/error states per house style.
  - `apps/client/src/components/logs/log-action-labels.ts` — local
    `Record<WorkspaceLogAction, { label, description? }>` + tone/icon hints;
    import the union type from `@wriven/contracts` (client already imports
    view types there).
- **Files — modify:**
  - `apps/client/src/lib/api.ts` — add `workspaceLogApi = { list: (params) =>
    request<Paginated<WorkspaceLogView>>(\`/logs?${qs}\`, { workspace: true }) }`
    near `memberApi` — query string built manually via `URLSearchParams`
    (house style, see `contentApi.listTypes`) and `{ workspace: true }` so
    the request layer sends `X-Workspace-Id` (scope headers are opt-in per
    call, not automatic); import the new types.
  - `apps/client/src/components/sidebar/builders/build-workspace-nav.ts` —
    "Activity Log" leaf after Members (icon: `History` from lucide) gated
    `Permission.WORKSPACE_LOGS_VIEW`.
- **Shared contracts:** none.
- **Verify:** `pnpm nx build client && pnpm nx lint client && pnpm nx typecheck client`;
  manual: `pnpm dev:client` → workspace nav shows Activity Log for
  owner/admin/member, hidden for guest; page lists recent actions; filter
  switch refetches; `days` round-trips in the URL.

### Phase 5 — End-to-end pass (spec DoD)

- **Why here** — everything wired; this is the acceptance run.
- **Files — create:** none.
- **Files — modify:** none (fix-forward into the owning phase's files if
  something fails).
- **Shared contracts:** none.
- **Verify (manual, dev:gateway + dev:auth + dev:client + local DB):**
  - create+publish entry, add member, rotate an API key → all three appear
    in `/w/<slug>/logs?days=7` with actor/action/target;
  - `days=30/90` cutoffs behave; `days=45` → 422;
  - pagination: `page`/`limit`/`total` correct;
  - guest member: nav item hidden + `GET /logs` → 403;
  - remove a member with log rows → rows survive, actor renders as removed;
  - stop auth-service → audited gateway route still succeeds (fire-and-forget);
  - backdate a row >90d, trigger/run `pruneActivityLogs` → pruned, recent
    rows intact.
  - Commits: backend (Phases 1–3, may be one commit) and frontend (Phase 4)
    separate, one-line Conventional Commits, no AI co-author trailer.

## Risks / open questions

- **Route coverage drift** — ~22 decorators across 7 controllers; the spec
  catalog table is the checklist. Risk of missing a route (or decorating a
  read) — the Phase 3 verify greps mutations per controller.
- **Interceptor binding** — per-controller `@UseInterceptors` (the admin
  pattern), which also removes any ordering concern: a controller-scoped
  interceptor sees the raw handler result before the global
  `ResponseInterceptor` wraps it.
- **`workspace.delete` omitted deliberately** — the interceptor runs after
  the handler; the workspace cascade has already deleted the FK target, so
  the log insert would always fail. Workspace deletion stays visible in the
  admin console's own audit log.
- **TCP write amplification** — one extra fire-and-forget send per mutation;
  consistent with admin audit, fine at current scale.
- **`entry.update` volume** — every save logs a row; bounded by the 90-day
  retention cron. If a workspace saves hundreds/day the page still paginates.
- **Owner role auto-inherits** `WORKSPACE_LOGS_VIEW` (its set is
  `Object.values(Permission)`); only admin/member sets need the explicit
  grant, and guest is safe by omission.

## Out of scope

- Admin-panel surfaces (separate repo).
- AI generation events, Delivery-API reads (usage metering).
- Member/action filters, CSV export, retention UI, streaming logs.
- Invitation-accept events (no authenticated workspace context on the public
  token route).

## Definition of done

- [ ] Phase 1: `pnpm nx build/typecheck shared-contracts` green.
- [ ] Phase 2: migration generated + applied; `pnpm nx typecheck/build auth-service` green.
- [ ] Phase 3: `pnpm nx typecheck/build api-gateway` green; curl smoke shows
      rows written and `GET /logs` serving them; `days=45` → 422.
- [ ] Phase 4: `pnpm nx build/lint/typecheck client` green; nav + page + filter work.
- [ ] Phase 5: full manual checklist above passes; guest 403; removed-member
      rows survive; auth-down resilience confirmed; retention prune verified.
- [ ] Backend and frontend changes land as separate one-line Conventional
      Commits with no AI co-author trailer.
