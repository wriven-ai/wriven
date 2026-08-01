# Plan: RBAC Permissions

> Status: drafted · Executes: spec 12 (`specs/12-rbac-permissions.md`) · Supersedes: -

## Goal

Ship a permission layer over Wriven's existing roles so every call site checks a typed `Permission` (with workspace → project cascade), enforced by one gateway `PermissionGuard` — replacing the scattered role-string checks and the `ProjectGuard` bypass, and filling the frontend `useCan()` stub.

## Current state

Roles already exist as `text` + `CHECK` columns and flow as **untyped strings** everywhere. Enforcement is split:

- `requireWorkspaceRole` (`apps/auth-service/src/auth/members.service.ts:150-166`) and `requireProjectRole` (`apps/auth-service/src/auth/projects.service.ts:295-311`) — central helpers in auth-service.
- Inline checks: `assertCanManageBilling` (`apps/auth-service/src/billing/billing.controller.ts:26-32`), `canSeeAll = callerRole !== 'guest'` (`projects.service.ts:124`), owner/last-admin guards in `members.service.ts` / `projects.service.ts`.
- Gateway: `WorkspaceGuard` (`workspace.guard.ts`) sets `req.workspaceRole`; `ProjectGuard` (`project.guard.ts:66-79`) has a workspace-owner/admin bypass that re-calls `validateWorkspaceMember` and synthesises `projectRole='admin'`.
- Frontend: `useCan()` (`apps/client/src/components/sidebar/use-can.ts`) is a stub returning `true`; nav builders already consume `can()`.
- TCP return types `WorkspaceMembership` / `ProjectMembership` carry only `{ id, role }` shapes; the guards read `membership.role`.
- `project_members` has **no `workspace_id` column** (cols: `id, projectId, userId, role, createdAt`).
- Reference template to mirror: `apps/api-gateway/src/admin/admin-roles.decorator.ts` + `admin-roles.guard.ts` (decorator → `SetMetadata`; guard → `Reflector` + `req.adminUser.role`).
- Roles are duplicated as inline `const … as const` arrays in `dto/member.dto.ts:4-6` and `dto/invitation.dto.ts:4-5`.

Nothing here is re-done — this plan layers permissions on top of all of the above.

## Phases

### Phase 1 — Contracts: permission catalog + typed roles + matrix

- **Why here:** first — every other phase imports `Permission`, the role unions, and the role → `Set<Permission>` maps from `@wriven/contracts`. Nothing compiles downstream until this lands.
- **Files — create:**
  - `libs/shared/contracts/src/lib/types/rbac.types.ts` —
    - `enum Permission` (SCREAMING_SNAKE), the full catalog from spec §"Shared contracts" (workspace + project levels, including `PROJECT_VIEW_ALL` / `PROJECT_VIEW_ASSIGNED` scope markers).
    - `WorkspaceRole = 'owner'|'admin'|'member'|'guest'`, `ProjectRole = 'admin'|'editor'|'viewer'`.
    - `WORKSPACE_ROLE_PERMISSIONS: Record<WorkspaceRole, Set<Permission>>`, `PROJECT_ROLE_PERMISSIONS: Record<ProjectRole, Set<Permission>>` (owner = `new Set(Object.values(Permission))`).
    - `PermissionScope = 'ALL'|'ASSIGNED'|'NONE'` + `getProjectScope(wsRole: WorkspaceRole | null): PermissionScope` (owner/admin/member → `ALL`, guest → `ASSIGNED`, else `NONE`).
  - `libs/shared/contracts/src/lib/types/rbac.spec.ts` — matrix + monotonicity tests: every `(level, role)` asserts its exact set; within each level each role ⊆ the one above (for granted actions); `WORKSPACE_DELETE` and `WORKSPACE_ROLE_ASSIGN` are owner-only (not in admin).
- **Files — modify:**
  - `libs/shared/contracts/src/lib/index.ts` — re-export `rbac.types.ts`.
  - `libs/shared/contracts/src/lib/types/auth.types.ts` — change `role: string` → `WorkspaceRole` / `ProjectRole` on `WorkspaceView`, `ProjectView`, `WorkspaceMembership`, `ProjectMembership`; add `permissions: Permission[]` to the two `*Membership` types (the `validate*Member` return shapes).
  - `libs/shared/contracts/src/lib/types/member.types.ts` — `role: string` → typed unions on `WorkspaceMemberView` / `ProjectMemberView`.
  - `libs/shared/contracts/src/lib/dto/member.dto.ts` — delete the inline `WORKSPACE_ROLES` / `PROJECT_ROLES` arrays (lines 4-6); import the unions from `rbac.types.ts`; keep `WORKSPACE_ASSIGNABLE` as a local derived const (`['admin','member']`); `@IsIn` keeps working against the union values.
  - `libs/shared/contracts/src/lib/dto/invitation.dto.ts` — delete the duplicated `WORKSPACE_ASSIGNABLE` / `PROJECT_ROLES` (lines 4-5); import from the same source.
- **Shared contracts:** this phase *is* the contracts change (see files above).
- **Verify:** `pnpm nx typecheck @wriven/contracts` · `pnpm nx lint @wriven/contracts` · `pnpm nx test @wriven/contracts` (matrix + monotonicity green). Expect downstream typecheck breakage in auth-service/gateway at this point (typed roles surface usages) — that is expected and fixed in Phases 2–4; do not block Phase 1 on it.

### Phase 2 — auth-service: resolver engine + cascade in `validate*Member`

- **Why here:** depends on Phase 1 (imports `Permission`, the maps, typed roles). Produces the permission sets the gateway consumes; unblocks Phase 3.
- **Files — create:**
  - `apps/auth-service/src/authz/authorization.service.ts` —
    - `resolvePermissions({ userId, workspaceId, projectId? })`: look up `workspace_members` role (and `project_members` role when `projectId` given; walk `projects.workspaceId` to fill `workspaceId` if only `projectId` was supplied); return `{ wsRole, projRole, permissions: [...union] }` where union = `WORKSPACE_ROLE_PERMISSIONS[wsRole] ∪ PROJECT_ROLE_PERMISSIONS[projRole]` (treat missing memberships as empty sets). Mirrors the guide's `getRoles` → union cascade, adapted to 2 levels.
    - `authorize({ userId, permission, workspaceId, projectId? })`: resolve, throw `RpcException(FORBIDDEN)` if the set lacks `permission`. (Throwing variant — single chokepoint.)
    - `can(...)`: non-throwing boolean, for any future internal conditional logic.
  - `apps/auth-service/src/authz/authz.module.ts` — providers `AuthorizationService`, exports it. Import into `AuthModule`.
  - `apps/auth-service/src/authz/authorization.spec.ts` — cascade test (ws `admin`, no `project_members` row → granted `CONTENT_ENTRY_PUBLISH`; ws `member` → not), denial test (project `viewer` → `authorize(PUBLISH)` throws), scope test (`getProjectScope('guest') === 'ASSIGNED'`).
- **Files — modify:**
  - `apps/auth-service/src/auth/auth.service.ts` —
    - `validateWorkspaceMember` (~line 457): call `resolvePermissions`, return `{ workspaceId, role: wsRole, permissions }`.
    - `validateProjectMember`: rewrite to absorb the cascade — resolve `projectId → workspaceId`, look up both memberships; if the caller is a workspace `owner`/`admin` their derived `PROJECT_*` permissions are included even with no `project_members` row; return `{ projectId, role: projRole ?? null, permissions }`. (This is where the gateway's bypass logic migrates to — auth-service-side.)
- **Shared contracts:** none beyond Phase 1.
- **Verify:** `pnpm nx typecheck @wriven/auth-service` · `pnpm nx test @wriven/auth-service` (cascade/denial/scope green) · `pnpm nx lint @wriven/auth-service`.

### Phase 3 — gateway: `@RequirePermission` + `PermissionGuard`, attach sets, delete bypass

- **Why here:** depends on Phase 2 (consumes the extended `validate*Member` returns). Wires enforcement; unblocks Phase 5's per-route decorators.
- **Files — create:**
  - `apps/api-gateway/src/auth/require-permission.decorator.ts` — `@RequirePermission(...perms: Permission[])` → `SetMetadata(PERMISSION_KEY, perms)`. Mirror `admin-roles.decorator.ts`.
  - `apps/api-gateway/src/auth/permission.guard.ts` — `PermissionGuard` reads `PERMISSION_KEY` via `Reflector`; no metadata → allow (rely on other guards); else checks the required perm against `req.projectPermissions ?? req.workspacePermissions` (`Set<Permission>`), throws `ERROR_CODES.FORBIDDEN` on miss. Mirror `admin-roles.guard.ts`. Register it globally or apply per controller alongside `WorkspaceGuard`/`ProjectGuard`.
- **Files — modify:**
  - `apps/api-gateway/src/auth/workspace.guard.ts` — extend `ScopedRequest` with `workspacePermissions?: Set<Permission>`; set `req.workspacePermissions = new Set(membership.permissions)`.
  - `apps/api-gateway/src/auth/project.guard.ts` — extend `ScopedRequest` with `projectPermissions?: Set<Permission>`; **replace the whole body** with a single `validateProjectMember` call (which now returns cascade-resolved permissions), set `req.projectId` / `req.projectRole` / `req.projectPermissions`; **delete the try/catch fallthrough + workspace-admin bypass (lines 62-79)**. A throw from `validateProjectMember` propagates as `FORBIDDEN`.
- **Shared contracts:** none.
- **Verify:** `pnpm nx typecheck @wriven/api-gateway` · `pnpm nx lint @wriven/api-gateway` · guard unit test: a request with `req.projectPermissions` lacking the required perm throws `FORBIDDEN`; present perm passes.

### Phase 4 — auth-service: migrate call sites to permission checks

- **Why here:** depends on Phase 2 (`authorize()` exists). Removes the last role-string checks on the service side.
- **Files — modify:**
  - `apps/auth-service/src/auth/members.service.ts` — `requireWorkspaceRole(userId, wsId, allowed[])` → delegate to `authorize({ userId, permission, workspaceId })` per action (member add/remove/change → `WORKSPACE_MEMBERS_MANAGE`; owner-grant/transfer → also require `WORKSPACE_ROLE_ASSIGN`; list members → `WORKSPACE_MEMBERS_VIEW`). Keep the ≥1-owner invariant checks (`db.$count`) and the owner-only-grant rule.
  - `apps/auth-service/src/auth/projects.service.ts` — `requireProjectRole` → `authorize` per action (`PROJECT_MEMBERS_MANAGE`, `PROJECT_EDIT`, `PROJECT_DELETE`, etc.); `canSeeAll` (line 124) → `getProjectScope(wsRole)`; keep ≥1-admin invariant.
  - `apps/auth-service/src/auth/workspaces.service.ts` — update/delete calls → `authorize` (`WORKSPACE_EDIT` / `WORKSPACE_DELETE`).
  - `apps/auth-service/src/auth/invitations.service.ts` — invitation create/accept/revoke → `authorize` (`WORKSPACE_MEMBERS_MANAGE` or `PROJECT_MEMBERS_MANAGE` by scope).
  - `apps/auth-service/src/billing/billing.controller.ts` — `assertCanManageBilling` (lines 26-32) → `authorize(WORKSPACE_BILLING_MANAGE)`; drop the inline `role !== 'owner' && role !== 'admin'`.
- **Shared contracts:** none.
- **Verify:** `pnpm nx typecheck @wriven/auth-service` · `pnpm nx test @wriven/auth-service` · manual smoke: `pnpm dev:gateway` + `pnpm dev:auth` + `pnpm dev:core` — workspace `member` invited to a project as `viewer` gets 403 on a publish attempt; workspace `owner` publishes fine with no `project_members` row.

### Phase 5 — gateway: decorate routes, drop role forwarding

- **Why here:** depends on Phase 3 (`@RequirePermission` + guard ready). Applies the new enforcement to each public route.
- **Files — modify:**
  - Every workspace-scoped controller method under `apps/api-gateway/src/` (workspaces, members, billing, support, invitations-workspace) — add `@RequirePermission(Permission.X)` matching the action; ensure `@UseGuards(..., PermissionGuard)` ordering (after `WorkspaceGuard`).
  - Every project-scoped controller method (content types, entries, media, webhooks, api-keys, project members) — `@RequirePermission(...)`; guard after `ProjectGuard`.
  - `apps/api-gateway/src/billing/billing.controller.ts` — stop forwarding `workspaceRole` purely for authz (the `PermissionGuard` now decides from `req.workspacePermissions`); keep `userId`/`workspaceId`.
- **Shared contracts:** none.
- **Verify:** `pnpm nx typecheck @wriven/api-gateway` · `pnpm nx lint @wriven/api-gateway` · manual smoke across one route per level (workspace: list members as `member` → 200; project: publish entry as `viewer` → 403, as `editor`/`admin` → 200).

### Phase 6 — Frontend: fill `useCan()` — DEFERRED to a separate spec + plan

**This phase is out of this plan.** The frontend RBAC piece (filling
`apps/client/src/components/sidebar/use-can.ts` against the shared role→permission
maps) will be done as its **own spec + plan**, not folded into this backend work.
The backend seam it consumes already exists: `Permission` enum +
`WORKSPACE_ROLE_PERMISSIONS` / `PROJECT_ROLE_PERMISSIONS` + `effectivePermissions()`
cascade live in `@wriven/contracts` (`libs/shared/contracts/src/lib/types/rbac.types.ts`),
so `useCan()` imports the identical maps the gateway uses.

See memory `rbac-frontend-split`.

### Phase 7 — Docs + DoD sweep

- **Why here:** last — Wriven's doc-maintenance rule (keep `doc/` current on new module/feature). No code depends on it.
- **Files — modify:**
  - `doc/auth-service/members-api.md` — note that enforcement is now permission-based (roles still the same values); add a short "Permissions" subsection pointing to the catalog.
  - `doc/auth-service/auth-service.md` — describe `resolvePermissions` + the cascade in `validate*Member`; remove the "gateway ProjectGuard bypass" description (it's gone).
  - `doc/status.md` — flip the auth-service / api-gateway rows to reflect the permission layer; add an RBAC line.
  - `doc/frontend/sidebar.md` — update the "RBAC seam" section: `useCan()` is no longer a stub.
- **Verify:** full Definition-of-Done checklist below green.

## Risks / open questions

- **Biggest blast radius = Phase 4/5.** Typing the roles (Phase 1) will surface many `string` usages; budget time to chase typecheck errors through Phases 2–5. Do not try to land all phases in one commit — keep the gating.
- **`validateProjectMember` now does two membership lookups** (project + workspace) to compute the cascade where there is no project row. Acceptable (auth_svc local, indexed); if it shows on hot paths later, cache `(userId, projectId) → permissions` with a short TTL invalidated on membership/role change (spec §"Simplifications & Scaling"). Out of scope now.
- **Optional composite FK deferred.** The spec floated `project_members(workspace_id, user_id) → workspace_members`, but `project_members` has no `workspace_id` column — adding it = column add + backfill from `projects.workspaceId` + join-on-insert. That is its own task; **not in this plan**. The app-side `ensureWorkspaceMember` invariant stays the guarantee.
- **Permission naming.** Spec chose SCREAMING_SNAKE enum (matches `errors.ts`); revisit only if the team prefers dot-namespaced strings (`content.entry.publish`, matching `messages.ts`). Deciding before Phase 1 avoids churn.
- **Global vs per-controller guard registration.** `PermissionGuard` can be global (skip when no `@RequirePermission` metadata) or applied per controller. Global is less boilerplate but must no-op cleanly on routes that have no decorator (it does — returns true when metadata absent). Pick during Phase 3.
- **`customRoles` entitlement stays a flag.** This plan deliberately does not implement per-workspace custom roles; the permission-string seam is what makes that a future flip. Don't expand scope mid-plan.

## Out of scope

- Custom / per-workspace roles (`customRoles` plan flag) and the `roles` / `role_permissions` tables.
- Field-level / content-type-level permissions (P2 granular RBAC).
- ReBAC / external policy engine (SpiceDB, Cerbos, OPA).
- The `project_members.workspace_id` column + composite FK (separate task).
- Permission caching (Redis TTL) — only if profiling demands it.
- Per-button UI gating beyond the sidebar nav (iterative feature work).
- **Frontend `useCan()` / nav gating** — split to its own spec + plan (was Phase 6). Backend-only here.

## Definition of done

- [ ] `pnpm nx typecheck @wriven/contracts @wriven/auth-service @wriven/api-gateway @wriven-ai/client` all pass (Phase 1/2/3/5/6 Verify).
- [ ] `pnpm nx lint` and `pnpm nx build` green for the four touched projects.
- [ ] Matrix spec green: every `(level, role)` exact set + monotonicity (Phase 1).
- [ ] Cascade test green: ws `admin` with no `project_members` row granted `CONTENT_ENTRY_PUBLISH`; ws `member` not (Phase 2).
- [ ] Denial test green: project `viewer` → `authorize(CONTENT_ENTRY_PUBLISH)` throws `FORBIDDEN` (Phase 2).
- [ ] Scope test green: `getProjectScope('guest') === 'ASSIGNED'`, `('member') === 'ALL'` (Phase 1/2).
- [ ] Invariant tests green: last-owner / last-admin demotion or removal → `CONFLICT` (Phase 4).
- [ ] No new TCP round-trip: project-scoped request resolves in the single `validateProjectMember` call; `ProjectGuard` bypass block deleted (Phase 3).
- [ ] ~~Frontend: `viewer` session hides `CONTENT_ENTRY_PUBLISH`-gated nav~~ → moved to the separate frontend RBAC spec (Phase 6 deferred).
- [ ] Manual smoke (all four dev services): workspace owner publishes with no project row; invited project `viewer` gets 403 on publish and sees only the assigned project (Phase 4/5).
- [ ] Docs updated: `members-api.md`, `auth-service.md`, `status.md`, `sidebar.md` (Phase 7).
- [ ] Frontend and backend changes in **separate commits**; one-line Conventional Commits, no AI co-author trailer.
