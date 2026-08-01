# Plan: Frontend RBAC Implementation

> Status: drafted · Executes: spec 13 (`specs/13-frontend-rbac.md`) · Supersedes: -

## Goal

Fill the client-side RBAC seam: a working `useCan()` against the shared
`@wriven/contracts` permission maps, nav gated by real permissions, action
buttons + management routes gated by role — the user-visible half of specs/12.

## Current state

Backend RBAC (specs/12) is **shipped** — `Permission`, `WORKSPACE_ROLE_PERMISSIONS`,
`PROJECT_ROLE_PERMISSIONS`, `effectivePermissions`, `WorkspaceRole`/`ProjectRole`,
`getProjectScope` all live in `libs/shared/contracts/src/lib/types/rbac.types.ts`
(exported from `src/index.ts`). The gateway enforces via `PermissionGuard` → 403.
The untracked `rbac.check.mts` confirms the cascade math.

Client starting point (verified in the code scan):

- **No `@wriven/contracts` dependency** in `apps/client/package.json`. The client
  uses a local type mirror `src/lib/types.ts` (header: "Mirrors the relevant
  views from @wriven/contracts") — comments reference the package, nothing
  imports it. `role` fields are `string` on `WorkspaceView`/`ProjectView`; the
  local file *does* define `WorkspaceRole` / `ProjectRole` / `AssignableWorkspaceRole`
  unions (duplicated from contracts) — members pages import those.
- `useCan()` (`components/sidebar/use-can.ts`) = stub returning `true`.
- Nav contract `can: (permission: string, scope?) => boolean` (`nav.types.ts`);
  `gate<T>()` (`builders/gate.ts`) filters + strips `permission`/`scope`.
- **Phantom-permission drift**: builders reference `CONTENT_TYPE_VIEW`,
  `CONTENT_VIEW`, `MEDIA_VIEW`, `API_KEY_VIEW`, `MEMBER_VIEW`,
  `PROJECT_SETTINGS_VIEW`, `BILLING_VIEW`, `WORKSPACE_SETTINGS_VIEW` — none
  exist in `Permission`. Remap table in spec §Scope.
- Imperative role checks already live on some surfaces: ws members page
  (`canManage = callerRole === 'owner' || callerRole === 'admin'`, derived from
  the members-list row) — these are the swap targets.
- `useAuth()` exposes `{ user, currentWorkspace, currentWorkspaceId, … }`;
  store (`stores/auth.ts`) holds `workspaces: WorkspaceView[]`,
  `projects: ProjectView[]`, `currentWorkspaceId`, `currentProjectId`.
- No `<Can>` component, no client route guard exists.

## Phases

### Phase 1 — Wire `@wriven/contracts`; source role unions from it

- **Why here:** first — every later phase imports `Permission` /
  `effectivePermissions` / the role maps from contracts. Nothing else compiles
  until the package resolves and the role types have a single source.
- **Files — modify:**
  - `apps/client/package.json` — add `"@wriven/contracts": "workspace:*"` to
    `dependencies` (mirrors `apps/api-gateway/package.json:89`). Run `pnpm install`
    — links via the `libs/shared/*` glob in `pnpm-workspace.yaml`.
  - `apps/client/src/lib/types.ts` — replace the locally-defined
    `WorkspaceRole` / `ProjectRole` / `AssignableWorkspaceRole` unions with
    re-exports from `@wriven/contracts`
    (`export type { WorkspaceRole, ProjectRole } from '@wriven/contracts'`;
    keep `AssignableWorkspaceRole` derived locally or import
    `WORKSPACE_ASSIGNABLE_ROLES`). Type `WorkspaceView.role: WorkspaceRole`,
    `ProjectView.role: ProjectRole | null`, and the member-view `role` fields.
    Existing import sites (`@/lib/types`) stay valid — re-export keeps churn to
    this one file.
- **Shared contracts:** none — consuming only.
- **Verify:** `pnpm install` succeeds (symlink created); `pnpm nx typecheck client`
  green (the re-exports preserve existing import paths). Quick smoke:
  `node -e "console.log(require('@wriven/contracts/package.json').name)"` from
  `apps/client` resolves.

### Phase 2 — Implement `useCan()` + tighten the nav contract

- **Why here:** depends on Phase 1 (`Permission`, `effectivePermissions` resolve).
  Produces the `can` fn every builder and button gate calls.
- **Files — modify:**
  - `apps/client/src/components/sidebar/use-can.ts` — implement the body:
    select `workspaces` / `projects` / `currentWorkspaceId` /
    `currentProjectId` from `useAuthStore`; resolve
    `wsRole = workspaces.find(w => w.id === currentWorkspaceId)?.role` and
    `projRole = projects.find(p => p.id === currentProjectId)?.role ?? null`;
    `const perms = useMemo(() => effectivePermissions(wsRole, projRole),
    [wsRole, projRole])`; return `useCallback((p: Permission) => perms.has(p),
    [perms])`. Change the exported `Can` type to `(permission: Permission) =>
    boolean` and drop the `scope` param (never wired; the store already carries
    active scope).
  - `apps/client/src/components/sidebar/nav.types.ts` — `NavContext.can:
    (permission: Permission) => boolean` (drop `scope`).
  - `apps/client/src/components/sidebar/builders/gate.ts` — `Gated<T>` drops
    `scope`; `gate()` filter becomes `!i.permission || can(i.permission)`.
- **Shared contracts:** none.
- **Verify:** `pnpm nx typecheck client` green. `npx tsx rbac.check.mts` still
  green (the shared cascade the hook now imports is unchanged). Manual: in
  `use-nav-context` consumers, `can(Permission.PROJECT_VIEW)` reflects the
  logged-in role (temp `console.log` — removed before commit).

### Phase 3 — Remap nav builder permissions

- **Why here:** depends on Phase 2 (`can` is now `Permission`-typed, so the
  builders' string literals won't compile until remapped — the type system
  forces correctness here). Re-enables real nav gating.
- **Files — modify:**
  - `apps/client/src/components/sidebar/builders/build-workspace-nav.ts` —
    remap per spec table: Members → `WORKSPACE_MEMBERS_VIEW`; Usage →
    `WORKSPACE_USAGE_VIEW` (add — currently ungated); Billing →
    `WORKSPACE_BILLING_MANAGE`; Settings → `WORKSPACE_EDIT`. Drop `scope:`.
  - `apps/client/src/components/sidebar/builders/build-project-nav.ts` —
    Content Types → `CONTENT_TYPE_MANAGE`; Content → `PROJECT_VIEW`; Media →
    `MEDIA_MANAGE`; API Keys → `API_KEY_MANAGE`; Members →
    `PROJECT_MEMBERS_VIEW`; Settings → `PROJECT_EDIT`. Drop `scope:`.
  - Import `Permission` from `@wriven/contracts` in both.
- **Shared contracts:** none.
- **Verify:** `pnpm nx typecheck client` + `pnpm nx lint client` green. Manual
  smoke (`pnpm dev:client` + backend): project `viewer` → Content Types/Media/
  API Keys/Members/Project Settings hidden, Content visible; `admin` → all show.

### Phase 4 — `<Can>` + `<RequirePermission>` primitives

- **Why here:** depends on Phase 2 (`useCan`). Gives every button-gate (Phase 5)
  and route-guard (Phase 6) one primitive instead of repeating `useCan()` inline.
- **Files — create:**
  - `apps/client/src/components/auth/can.tsx` — `'use client'`; `<Can
    permission={Permission.X} fallback?: ReactNode>{children}</Can>` (and a
    render-prop `children={(allowed) => …}` variant for the disable-vs-hide
    choice). Calls `useCan()` once.
  - `apps/client/src/components/auth/require-permission.tsx` — `'use client'`;
    `<RequirePermission permission={Permission.X}>{children}</RequirePermission>`
    renders an inline "You don't have access" card when `useCan()(perm)` is false
    (chosen over redirect to avoid loops / losing the URL). Backend 403 stays the
    real gate.
- **Shared contracts:** none.
- **Verify:** `pnpm nx typecheck client` + `pnpm nx build client` green.

### Phase 5 — Gate action buttons on flagship surfaces

- **Why here:** depends on Phase 4 (`<Can>`). The actual user-visible value of
  RBAC — controls you lack vanish/disable.
- **Files — modify** (swap imperative `canManage` / unconditional renders →
  `<Can>` or `useCan()`):
  - `apps/client/src/components/content/content-editor.tsx` — Save/Create
    (button ~line 225) → `CONTENT_ENTRY_UPDATE` (Save) /
    `CONTENT_ENTRY_CREATE` (Create label path); Delete (~220) →
    `CONTENT_ENTRY_DELETE`; Publish/Unpublish (~238) → `CONTENT_ENTRY_PUBLISH`.
    Disable-when-unauthorized is acceptable (keeps layout) where hide is jarring;
    hide where the control is purely an action.
  - `apps/client/src/app/(dashboard)/w/[wsSlug]/p/[projSlug]/media/page.tsx` —
    upload + delete (~315, ~385) → `MEDIA_MANAGE`.
  - `apps/client/src/app/(dashboard)/w/[wsSlug]/members/page.tsx` — replace
    `canManage = callerRole === 'owner' || callerRole === 'admin'` with
    `useCan()(Permission.WORKSPACE_MEMBERS_MANAGE)`; owner-grant/transfer UI →
    `WORKSPACE_ROLE_ASSIGN`. Keep the last-owner disable (backend `CONFLICT`).
  - `apps/client/src/app/(dashboard)/w/[wsSlug]/p/[projSlug]/members/page.tsx`
    — same shape: add/remove/change-role → `PROJECT_MEMBERS_MANAGE`;
    role-assign → `PROJECT_ROLE_ASSIGN`; last-admin disable kept.
  - `apps/client/src/app/(dashboard)/w/[wsSlug]/p/[projSlug]/api-keys/page.tsx`
    — create/revoke → `API_KEY_MANAGE`.
  - `apps/client/src/components/webhooks/webhooks-section.tsx` — create/delete/
    toggle → `WEBHOOK_MANAGE`.
  - Content-types surface (builder/create/edit fields) → `CONTENT_TYPE_MANAGE`.
- **Shared contracts:** none.
- **Verify:** `pnpm nx typecheck client` green. Manual smoke per role: `viewer`
  sees no Publish/Delete/Create in editor, no upload/delete in media;
  `editor` sees Save/Create but not Publish/Delete; `admin` sees all. Cascade:
  workspace `owner`/`admin` with no `project_members` row sees full project
  actions (`projRole == null` path).

### Phase 6 — Route guards on management pages

- **Why here:** depends on Phase 4 (`<RequirePermission`). UX fallback for
  direct navigation / refresh; backend 403 unchanged.
- **Files — modify** (wrap page content):
  - `apps/client/src/app/(dashboard)/w/[wsSlug]/billing/page.tsx` →
    `WORKSPACE_BILLING_MANAGE`.
  - `apps/client/src/app/(dashboard)/w/[wsSlug]/settings/page.tsx` →
    `WORKSPACE_EDIT`.
  - `apps/client/src/app/(dashboard)/w/[wsSlug]/p/[projSlug]/settings/page.tsx`
    → `PROJECT_EDIT`.
  - Members pages (both) — optional: they already gate controls in Phase 5;
    add `<RequirePermission>` for the list view perm
    (`WORKSPACE_MEMBERS_VIEW` / `PROJECT_MEMBERS_VIEW`) so a fully
    unauthorized role sees the no-access card instead of an empty list.
- **Shared contracts:** none.
- **Verify:** Manual smoke: unauthorized role navigating directly to
  `/w/[ws]/billing` (non-owner/admin) → graceful no-access card, not a 403
  error page. A direct `fetch` to the backing endpoint still 403s (backend
  unchanged).

### Phase 7 — Docs + DoD sweep

- **Why here:** last — Wriven's doc-maintenance rule. No code depends on it.
- **Files — modify:**
  - `doc/frontend/sidebar.md` — "RBAC seam" section: `useCan()` is real; document
    the `Permission`-typed `can` contract, the remap rule, and that `scope` is
    gone.
  - `doc/status.md` — flip the frontend RBAC note from "deferred to its own
    spec" to done (Frontend section + the auth-service/api-gateway rows already
    note the layer).
  - Memory `rbac-frontend-split` — close out (the split landed).
- **Verify:** full Definition-of-Done checklist below green.

## Risks / open questions

- **Re-export vs. import churn (Phase 1).** Local `lib/types.ts` already defines
  the role unions and several files import them from `@/lib/types`. Re-exporting
  from contracts keeps every import site valid — do that instead of rewriting
  imports. If any file imports the union *value* (not just type), confirm
  `WORKSPACE_ASSIGNABLE_ROLES` is the runtime export it needs.
- **Members-page role source.** The ws members page derives `callerRole` from the
  *members-list row* (`members?.find(m => m.userId === user?.id)?.role`), not
  `WorkspaceView.role`. Both are the workspace role, but the session role
  (`useCan`) needs no extra query and works before the list loads. Prefer
  `useCan()`; keep the members-list query only for rendering rows.
- **Hide vs. disable.** Phase 5 picks per-control; decide during implementation —
  hide purely-action controls (Publish, Delete), disable where hiding breaks
  layout expectations. Not a blocker, just a per-button call.
- **Route-guard behavior.** Chose inline no-access card over redirect (avoids
  redirect loops, preserves URL for when role changes). Revisit if product
  prefers a redirect to the workspace overview.
- **Branch-wide red typecheck.** Memory `deferred-typecheck-breakage` notes a
  branch-wide TS 5.9 / jwt v11 / `@types/express` breakage. Verify the **client**
  specifically typechecks (`pnpm nx typecheck client`) — don't assume global
  `pnpm typecheck` is green; the client may be independent of the backend
  breakage.
- **Breadth.** Phase 5 covers flagship surfaces; remaining次要 buttons follow the
  same `<Can>` pattern iteratively — do not expand this plan mid-flight.

## Out of scope

- Custom / per-workspace roles (`customRoles` entitlement) — future flip on the
  same seam.
- Field-level / content-type-field-level permissions (P2 granular RBAC).
- Gating every minor button beyond the flagship Phase-5 list.
- Any backend change (contracts, services, gateway, DB).
- Consolidating the rest of `lib/types.ts` beyond the role fields.

## Definition of done

- [ ] `@wriven/contracts` linked in `apps/client` (`pnpm install`; import
      resolves; no local rbac map/cascade copy in `apps/client/src`) — Phase 1.
- [ ] `pnpm nx typecheck client` passes — `WorkspaceView.role` / `ProjectView.role`
      typed via contracts; `can: (permission: Permission) => boolean` (Phase 1/2).
- [ ] `pnpm nx lint client` + `pnpm nx build client` green (Phase 4).
- [ ] `npx tsx rbac.check.mts` green — shared cascade math unchanged (Phase 2).
- [ ] Nav gating verified (manual): `viewer` hides Content Types/Media/API
      Keys/Members/Project Settings, shows Content; `admin` shows all; `guest`
      sees only assigned project (Phase 3).
- [ ] Action buttons verified per role (viewer/editor/admin) in editor + media;
      cascade path (ws owner/admin, no project row) sees full project actions
      (Phase 5).
- [ ] Route guard verified: direct nav to `/w/[ws]/billing` as non-owner/admin →
      no-access card; backing API still 403 (Phase 6).
- [ ] Last-owner / last-admin demote-remove disabled in member UIs (Phase 5).
- [ ] `doc/frontend/sidebar.md` + `doc/status.md` updated; memory
      `rbac-frontend-split` closed (Phase 7).
- [ ] Frontend-only commit(s); one-line Conventional Commits, no AI co-author
      trailer.
