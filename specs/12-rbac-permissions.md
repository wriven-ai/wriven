# Spec: RBAC Permissions

> Priority: P2 · Area: cross (contracts · auth · gateway · client) · Status: drafted

## Overview

Today Wriven has coarse, string-based roles — workspace (`owner` / `admin` / `member` / `guest`) and project (`admin` / `editor` / `viewer`) — enforced imperatively and inconsistently: a central `requireWorkspaceRole` / `requireProjectRole` helper in auth-service, inline role-string comparisons in the billing controller and the gateway's `ProjectGuard`, and a frontend `useCan()` hook that is a stub returning `true`. There is **no permission primitive**: every check compares role strings, so adding a role or a fine-grained action means editing service code at every call site.

This spec introduces a **permission layer** on top of the existing roles (no role-set change, no new membership tables). Roles become bundles of typed permissions; every call site checks a permission, not a role. Permissions **cascade** down the hierarchy — a workspace `owner`/`admin` holds every project permission in their workspace, even without a `project_members` row — which generalizes today's ad-hoc workspace-admin bypass into one declarative rule. List endpoints get `ALL` / `ASSIGNED` / `NONE` scopes driven by marker permissions, replacing the hardcoded `canSeeAll = callerRole !== 'guest'` branch.

This is the **enabling seam** for two deferred items: the P2 "Granular RBAC & custom roles" gap in [doc/market-readiness.md](../doc/market-readiness.md) (line 197) and the `customRoles` plan entitlement already modelled in `plans.features` (`apps/auth-service/src/db/schema/index.ts:455`). Because call sites will check permission strings (not roles, not tuples), a future custom-roles table or policy engine swaps in behind the resolver with zero call-site edits. The model adopted is **Hierarchical RBAC (NIST RBAC3)**: hierarchy (RBAC1) + constraints (RBAC2 — the existing ≥1-owner / ≥1-admin invariants), implemented in-process with no new infrastructure.

## Depends on

None (greenfield permission layer on existing roles). Builds on the membership model documented in [doc/auth-service/auth-service.md](../doc/auth-service/auth-service.md) and [doc/auth-service/members-api.md](../doc/auth-service/members-api.md), and the dashboard RBAC seam in [doc/frontend/sidebar.md](../doc/frontend/sidebar.md) (the `useCan()` hook at `apps/client/src/components/sidebar/use-can.ts`).

## Tooling context (skills / MCP / plugins)

- **WebSearch** — used (yes). Yielded industry model: Hierarchical RBAC (NIST RBAC1/2/3) is the standard fit for a 2-level tenant hierarchy; ReBAC/Zanzibar (SpiceDB) and policy engines (Cerbos/OPA/Cedar) are overkill for a fixed 2-level CMS and were rejected. Sources: WorkOS (multi-tenant RBAC design), Aserto (model policy on resource hierarchy), Cerbos (tenant-aware RBAC), authzed (Zanzibar/ReBAC), Oso (Zanzibar limits).
- **Explore agent** — used (yes). Mapped the live `auth_svc` schema and every role check site (file:line references throughout this spec).
- **Nx MCP / Supabase MCP** — available, not needed for this spec (no Nx generator run; schema change is one optional composite FK, applied via `pnpm db:auth:*`).
- No domain plugin (messaging/email/payments/storage/auth-provider) is relevant — RBAC is internal authorization.

## Scope

- In scope:
  - A typed `Permission` catalog (enum) and `WorkspaceRole` / `ProjectRole` string unions in `@wriven/contracts`.
  - Static role → `Set<Permission>` maps (workspace + project) in `@wriven/contracts`, shared with the frontend.
  - A cascade resolver in auth-service: `resolvePermissions({ userId, workspaceId, projectId? })` → effective permission set, with the workspace → project inheritance rule.
  - Extend `auth.validateWorkspaceMember` / `auth.validateProjectMember` to return the resolved permission set (no new TCP round-trip — reuses the calls the gateway already makes).
  - A `@RequirePermission(Permission.X)` decorator + `PermissionGuard` on the gateway, mirroring the existing `@AdminRoles` / `AdminRolesGuard` pattern.
  - Migrate every existing role check (`requireWorkspaceRole`, `requireProjectRole`, `assertCanManageBilling`, the `ProjectGuard` workspace-admin bypass, `canSeeAll`) to permission checks.
  - List-endpoint scopes (`ALL` / `ASSIGNED` / `NONE`) for project listing, driven by `PROJECT_VIEW_ALL` / `PROJECT_VIEW_ASSIGNED` markers.
  - Fill the frontend `useCan()` hook against the shared role → permission maps; nav gating already wired through `builders/gate.ts`.
  - Preserve the existing RBAC2 constraints: ≥1 workspace `owner`, ≥1 project `admin`.
  - Matrix unit tests (per-role exact set + monotonicity), cascade test, denial test.
- Out of scope:
  - **Custom / per-workspace roles** (the `customRoles` entitlement) — deferred; this spec only builds the seam that makes it a later flip.
  - **Field-level / content-type-level permissions** — P2 granular RBAC; future.
  - **ReBAC / external policy engine** (SpiceDB, Cerbos, OPA) — rejected for now; migration path preserved by the permission-string seam.
  - Changing the existing role *sets* or membership table structure.
  - Per-button UI gating beyond the sidebar nav (iterative, follows in feature work).

## API / endpoints

No new public endpoints. RBAC is an enforcement refactor.

The internal TCP contract of two existing handlers changes (not user-facing):

- `auth.validateWorkspaceMember({ userId, workspaceId })` — currently returns `{ workspaceId, role }`; now returns `{ workspaceId, role, permissions: Permission[] }`.
- `auth.validateProjectMember({ userId, projectId })` — currently returns `{ projectId, role }`; now returns `{ projectId, role, permissions: Permission[] }`, where `permissions` already includes workspace-derived project permissions (the cascade runs auth-service-side, so the gateway bypass is no longer needed).

Auth level for all affected routes is unchanged (access-token + `WorkspaceGuard` / `ProjectGuard`). Denials map to the existing `FORBIDDEN` (403) error code — no new error codes.

## Shared contracts (@wriven/contracts)

New (in `libs/shared/contracts/src/lib/types/`, e.g. `rbac.types.ts`, re-exported from `index.ts`):

- `Permission` — a TS `enum` (SCREAMING_SNAKE), namespaced by level. Draft catalog:

  ```
  // Workspace level
  WORKSPACE_VIEW, WORKSPACE_EDIT, WORKSPACE_DELETE,
  WORKSPACE_MEMBERS_VIEW, WORKSPACE_MEMBERS_MANAGE, WORKSPACE_ROLE_ASSIGN,   // ROLE_ASSIGN = owner-grant only
  WORKSPACE_PROJECT_CREATE, WORKSPACE_BILLING_MANAGE, WORKSPACE_USAGE_VIEW,

  // Project level (also granted via workspace cascade)
  PROJECT_VIEW, PROJECT_VIEW_ALL, PROJECT_VIEW_ASSIGNED,                     // ALL/ASSIGNED scope markers
  PROJECT_EDIT, PROJECT_DELETE,
  PROJECT_MEMBERS_VIEW, PROJECT_MEMBERS_MANAGE, PROJECT_ROLE_ASSIGN,
  CONTENT_TYPE_MANAGE, CONTENT_ENTRY_CREATE, CONTENT_ENTRY_UPDATE,
  CONTENT_ENTRY_PUBLISH, CONTENT_ENTRY_DELETE,
  MEDIA_MANAGE, WEBHOOK_MANAGE, API_KEY_MANAGE,
  ```

  Rationale for enum + SCREAMING_SNAKE: matches the existing `ERROR_CODES` style (`errors.ts`), is typo-proof at compile time, and is imported by both backend and frontend from the same contracts package. (Alternative considered: dot-namespaced strings like `content.entry.publish`, matching `messages.ts`; rejected only because it forgoes compile-time exhaustiveness — easy to revisit before implementation.)

- `WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest'` and `ProjectRole = 'admin' | 'editor' | 'viewer'` — typed string unions matching the existing `text` + `CHECK` column values and the `AdminRole` union convention (`types/admin.types.ts:4`). These replace the bare `role: string` on `WorkspaceView` / `ProjectView` / `WorkspaceMembership` / `ProjectMembership` (`types/auth.types.ts:14-36,78-87`, `types/member.types.ts`).

- `WORKSPACE_ROLE_PERMISSIONS: Record<WorkspaceRole, Set<Permission>>` and `PROJECT_ROLE_PERMISSIONS: Record<ProjectRole, Set<Permission>>` — the static matrix. Draft:

  ```
  WORKSPACE_ROLE_PERMISSIONS:
    owner  = new Set(Object.values(Permission))            // full control
    admin  = { WORKSPACE_VIEW, WORKSPACE_EDIT, WORKSPACE_MEMBERS_VIEW,
               WORKSPACE_MEMBERS_MANAGE, WORKSPACE_PROJECT_CREATE,
               WORKSPACE_BILLING_MANAGE, WORKSPACE_USAGE_VIEW,
               PROJECT_VIEW_ALL, /* + all PROJECT_* actions via cascade */ }
    member = { WORKSPACE_VIEW, WORKSPACE_MEMBERS_VIEW, PROJECT_VIEW_ALL }
    guest  = { PROJECT_VIEW_ASSIGNED }

  PROJECT_ROLE_PERMISSIONS:
    admin  = { all PROJECT_* action perms + PROJECT_VIEW }
    editor = { PROJECT_VIEW, CONTENT_ENTRY_CREATE, CONTENT_ENTRY_UPDATE, MEDIA_MANAGE }
    viewer = { PROJECT_VIEW }
  ```

  Monotonicity rule (enforced by test): within each level, a more powerful role is a superset of the one below. Note `WORKSPACE_ROLE_ASSIGN` and `WORKSPACE_DELETE` are owner-only (not in `admin`), matching today's "delete workspace = owner" and "owner-grant = owner only" rules.

- `PermissionScope = 'ALL' | 'ASSIGNED' | 'NONE'` and a `getProjectScope(roles)` helper (or the helper lives in auth-service; the type lives in contracts).

Changed:
- `WorkspaceMembership` / `ProjectMembership` / `WorkspaceMemberView` / `ProjectMemberView` / `WorkspaceView` / `ProjectView` — `role: string` → typed `WorkspaceRole` / `ProjectRole`.
- The return types of `validateWorkspaceMember` / `validateProjectMember` (in `types/auth.types.ts`) — add `permissions: Permission[]`.
- Dedup the role arrays currently duplicated at `dto/member.dto.ts:4-6` and `dto/invitation.dto.ts:4-5` → import the new unions as the single source of truth; keep the `@IsIn(...)` validation on DTOs.

## Database / schema

**No required schema changes.** Roles stay as `text` + `CHECK` constraints (house convention per [doc/database.md](../doc/database.md); migrating to `pgEnum` is rejected — zero functional gain, real migration churn). The permission layer is entirely in code + contracts.

Optional hardening (one `auth_svc` migration, defer if it risks the release):

- Add a composite foreign key on `project_members` so a project member row cannot exist without a matching `workspace_members` row:
  ```sql
  alter table auth_svc.project_members
    add constraint project_members_workspace_membership_fk
    foreign key (workspace_id, user_id)
    references auth_svc.workspace_members (workspace_id, user_id)
    on delete restrict;
  ```
  This promotes today's app-side `ensureWorkspaceMember` invariant (`projects.service.ts:219`) to a DB guarantee. It does **not** affect workspace owners/admins — they have no `project_members` row and access projects via the cascade. Add `workspace_id` to `project_members` if not already denormalized there (verify against the live schema before generating).

  Commands: `pnpm db:auth:generate` then `pnpm db:auth:migrate` (session pooler / `DIRECT_URL`).

## Backend changes

### auth-service (TCP `:5001`)
- **Create:**
  - `src/authz/authorization.service.ts` — the resolver brain. `resolvePermissions({ userId, workspaceId, projectId? })`: looks up the `workspace_members` role (and `project_members` role when `projectId` is given), walks `projects.workspaceId` to fill the workspace id, applies the cascade `union(WORKSPACE_ROLE_PERMISSIONS[wsRole], PROJECT_ROLE_PERMISSIONS[projRole])`, and returns `{ wsRole, projRole, permissions: Permission[] }`. Mirrors the engine shape from the RBAC guide (`getRoles` → `hasPermission`), adapted to Wriven's 2-level hierarchy. Throws nothing on "no membership" — returns an empty permission set; the caller decides.
  - `src/authz/authz.module.ts` — providers + exports (mirror the guide's module wiring).
- **Modify:**
  - `src/auth/auth.service.ts:457` (`validateWorkspaceMember`) — call `resolvePermissions`, return `{ workspaceId, role, permissions }`.
  - `validateProjectMember` (same file) — call `resolvePermissions` with `projectId`; the returned `permissions` already include workspace-derived project perms, so the gateway's bypass becomes redundant. Return `{ projectId, role, permissions }`.
  - `src/auth/members.service.ts:150-166` (`requireWorkspaceRole`) — replace with / delegate to a permission check (`authorize(userId, permission, workspaceId)` that throws `FORBIDDEN` on deny). Keep the ≥1-owner / owner-grant invariants.
  - `src/auth/projects.service.ts:295-311` (`requireProjectRole`) — same, permission-based; keep the ≥1-admin invariant.
  - `src/auth/projects.service.ts:124` (`canSeeAll = callerRole !== 'guest'`) — replace with `getProjectScope(roles)` driven by `PROJECT_VIEW_ALL` / `PROJECT_VIEW_ASSIGNED`.
  - `src/auth/workspaces.service.ts`, `src/auth/members.service.ts`, `src/auth/projects.service.ts`, `src/auth/invitations.service.ts` — each `requireWorkspaceRole` / `requireProjectRole` call site swaps its role list for the relevant `Permission`.
  - `src/billing/billing.controller.ts:26-32` (`assertCanManageBilling`) — replace inline `role !== 'owner' && role !== 'admin'` with a `WORKSPACE_BILLING_MANAGE` check.

### api-gateway (HTTP `:5000`)
- **Create:**
  - `src/auth/require-permission.decorator.ts` — `@RequirePermission(...permissions: Permission[])`, `SetMetadata` (mirror `src/admin/admin-roles.decorator.ts`).
  - `src/auth/permission.guard.ts` — `PermissionGuard` reads the metadata, reads `req.workspacePermissions` / `req.projectPermissions` (attached by the existing guards, now populated from the extended `validate*Member` returns), throws `FORBIDDEN` if none contains the required permission (mirror `src/admin/admin-roles.guard.ts`). Runs after `WorkspaceGuard` / `ProjectGuard`.
- **Modify:**
  - `src/auth/workspace.guard.ts:55-56` — attach `req.workspacePermissions` from the extended return.
  - `src/auth/project.guard.ts:35-87` — attach `req.projectPermissions` from the extended `validateProjectMember` return. **Remove the workspace-admin bypass block** (`:67-79`): the cascade now lives auth-service-side, so a workspace owner/admin simply receives `PROJECT_*` permissions in the resolved set. (This is the single biggest simplification.)
  - Every workspace/project-scoped controller method — add `@RequirePermission(Permission.X)` and drop any role forwarded purely for authz (e.g. `workspaceRole` forwarded to billing at `billing.controller.ts:59,66,75,81`).

### core-service (TCP `:5002`)
- **No changes.** core-service trusts the gateway-injected identity (hard rule: gateway validates membership; downstream services do not re-validate). It owns no authZ.

## Frontend changes (apps/client)

- **Modify** `src/components/sidebar/use-can.ts` — fill the `useCan()` body: import `WORKSPACE_ROLE_PERMISSIONS` / `PROJECT_ROLE_PERMISSIONS` from `@wriven/contracts`, read `WorkspaceView.role` / `ProjectView.role` from the session, return `can(permission, scope?) => boolean`. Per [doc/frontend/sidebar.md](../doc/frontend/sidebar.md) (line 91), this is the only required change — the nav builders (`builders/gate.ts`) and renderer already consume `can()`.
- **No new pages/stores/hooks required** for this spec. Per-action button gating (hide Publish/Delete by permission) follows iteratively in feature work and is out of scope here.

## Files to create

- `libs/shared/contracts/src/lib/types/rbac.types.ts` — `Permission` enum, role unions, `PermissionScope`, role → `Set<Permission>` maps.
- `apps/auth-service/src/authz/authorization.service.ts` — resolver + cascade engine.
- `apps/auth-service/src/authz/authz.module.ts` — provider wiring.
- `apps/auth-service/src/authz/rbac.spec.ts` (or co-located specs) — matrix, monotonicity, cascade, denial, scope tests.
- `apps/api-gateway/src/auth/require-permission.decorator.ts`
- `apps/api-gateway/src/auth/permission.guard.ts`

## Files to modify

- `libs/shared/contracts/src/lib/index.ts` — re-export `rbac.types.ts`.
- `libs/shared/contracts/src/lib/types/auth.types.ts` — type `role` fields; extend `validate*Member` return types with `permissions`.
- `libs/shared/contracts/src/lib/types/member.types.ts` — type `role` fields.
- `libs/shared/contracts/src/lib/dto/member.dto.ts` + `dto/invitation.dto.ts` — dedup role arrays, import from `rbac.types.ts`.
- `apps/auth-service/src/auth/auth.service.ts` — extend `validateWorkspaceMember` / `validateProjectMember`.
- `apps/auth-service/src/auth/{members,projects,workspaces,invitations}.service.ts` — swap role checks → permission checks.
- `apps/auth-service/src/billing/billing.controller.ts` — `assertCanManageBilling` → `WORKSPACE_BILLING_MANAGE`.
- `apps/api-gateway/src/auth/workspace.guard.ts` — attach `req.workspacePermissions`.
- `apps/api-gateway/src/auth/project.guard.ts` — attach `req.projectPermissions`; remove workspace-admin bypass.
- `apps/api-gateway/src/**/*controller.ts` — add `@RequirePermission` per workspace/project-scoped route; drop role forwarding used only for authz.
- `apps/client/src/components/sidebar/use-can.ts` — implement `can()`.

## New dependencies

None. `Set` is stdlib; class-validator / NestJS guards / Drizzle are already present.

## Rules for implementation

Base:
- Define shared DTOs/types/patterns/errors in `libs/shared/contracts` (`@wriven/contracts`) — check it before creating new ones.
- Store only R2 object **keys** in the DB; reconstruct URLs at runtime.
- Respect microservice boundaries — do not collapse auth/core/ai logic. Specifically: **the permission resolver lives in auth-service** (it owns `auth_svc`); **core-service stays authZ-free** and trusts the gateway; the **gateway enforces** via `PermissionGuard` using the set auth-service resolved over the existing TCP call. No new TCP round-trips.
- Endpoints return the response envelope; use error codes from `@wriven/contracts/errors.ts` (denials = `FORBIDDEN`); never leak stack traces or DB errors.
- Use dot-namespaced patterns from `@wriven/contracts/messages.ts`, never hardcoded strings.
- Frontend (`apps/client`) and backend changes go in **separate commits**; stage selectively, never `git add -A` across both.
- Run tasks through `pnpm nx <target> <project>`. Commits are one-line Conventional Commits with no body.

Feature-specific:
- **`authorize()` throws on denial** — single chokepoint; never return `{ success }` and rely on callers to throw. Expose a non-throwing `can()` separately for UI / conditional logic.
- **Cascade is a union, higher level checked first** — workspace-derived permissions are added to the effective set; project role only adds, never revokes an inherited workspace grant. This is the "workspace admin → every project" rule, generalized.
- **One enforcement style** — gateway `PermissionGuard` (decorator-driven) for all workspace/project-scoped routes. Do not mix inline role checks back in once migrated.
- **Monotonicity is a test, not a comment** — assert in the matrix spec that each role is a subset of the role above it within its level.
- **Preserve RBAC2 constraints** — ≥1 `owner` per workspace, ≥1 `admin` per project; only a workspace `owner` may grant/transfer the `owner` role. These survive the migration unchanged.
- **Reuse `FORBIDDEN`** — no new error code for permission denial.
- **Do not migrate roles to `pgEnum`** and **do not add `isSuperAdmin` to tenant `users`** — the platform admin console (`admin_users` + `AdminRolesGuard`) already covers break-glass orthogonally.

## Definition of done

- [ ] `pnpm nx typecheck auth-service api-gateway client` passes (typed `WorkspaceRole` / `ProjectRole` propagated; no bare `role: string` remains on membership views).
- [ ] `pnpm lint` and `pnpm build` pass for the three touched apps.
- [ ] Matrix spec passes: every `(level, role)` pair asserts its exact permission set, and monotonicity (admin ⊇ editor ⊇ viewer; owner ⊇ admin ⊇ member ⊇ guest for granted actions) holds.
- [ ] Cascade test passes: a workspace `admin` with **no** `project_members` row is granted a project-level permission (e.g. `CONTENT_ENTRY_PUBLISH`); a workspace `member` is not.
- [ ] Denial test passes: a project `viewer` calling a `CONTENT_ENTRY_PUBLISH` route gets `FORBIDDEN` (403).
- [ ] Scope test passes: a workspace `guest` gets `ASSIGNED` project scope (sees only projects with a `project_members` row); a workspace `member` gets `ALL`.
- [ ] Invariant tests pass: demoting/removing the last workspace `owner` → `CONFLICT`; same for the last project `admin`.
- [ ] No new TCP round-trip: a project-scoped request still resolves membership in the single existing `validateProjectMember` call (the `ProjectGuard` workspace-admin bypass block is gone, replaced by the cascade-resolved permission set).
- [ ] Frontend: with a `viewer`-role session, sidebar items gated behind `CONTENT_ENTRY_PUBLISH` are hidden (`useCan()` returns `false`); with an `admin`/`editor` session they show.
- [ ] Manual smoke (dev): `pnpm dev:gateway` + `pnpm dev:auth` + `pnpm dev:core` + `pnpm dev:client` — workspace owner sees all projects and can publish; a freshly invited project `viewer` cannot publish (403) and sees only the assigned project.
- [ ] [doc/auth-service/members-api.md](../doc/auth-service/members-api.md), [doc/status.md](../doc/status.md), and [doc/frontend/sidebar.md](../doc/frontend/sidebar.md) updated to reflect the permission layer (per the doc-maintenance rule).
