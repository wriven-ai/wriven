# Spec: Frontend RBAC Implementation

> Priority: P2 · Area: client · Status: drafted

## Overview

The backend RBAC layer ([specs/12](./12-rbac-permissions.md)) shipped: a typed
`Permission` catalog, static role → permission maps, and a single
`effectivePermissions(wsRole, projRole)` cascade — all in `@wriven/contracts`
(`libs/shared/contracts/src/lib/types/rbac.types.ts`), shared with the gateway.
The frontend half was deliberately split out (memory `rbac-frontend-split`,
[plans/05](./plans/05-rbac-permissions.md) Phase 6) and is still a stub:
`useCan()` returns `true` for everything, so no nav item, page, or action button
is gated by role today.

This spec completes that seam on the client: fill `useCan()` against the shared
maps, gate the dashboard nav by real permissions, hide/disable action buttons
the current role cannot perform, and guard management routes against direct
navigation. It is the user-visible half of the P2 "Granular RBAC" gap in
[doc/market-readiness.md](../doc/market-readiness.md) (line 197) — the backend
already enforces every denial (403); the client's job is to not show people UI
they cannot use.

This is **frontend-only**. No backend, contract, schema, or endpoint changes.

## Depends on

- [specs/12-rbac-permissions.md](./12-rbac-permissions.md) — **shipped** (commits
  `3480c30`…`a87d3b5`). Provides `Permission`, `WORKSPACE_ROLE_PERMISSIONS`,
  `PROJECT_ROLE_PERMISSIONS`, `effectivePermissions`, `WorkspaceRole`,
  `ProjectRole`, `getProjectScope` in `@wriven/contracts`. This spec consumes
  them; it does not redefine them.
- [plans/05-rbac-permissions.md](../plans/05-rbac-permissions.md) Phase 6 —
  explicitly deferred here.

## Tooling context (skills / MCP / plugins)

- **Explore / Bash (rg)** — used (yes). Mapped the nav brain
  (`use-nav-context` → `build-nav-tree` → `builders/` → `gate`), confirmed
  `WorkspaceView.role` / `ProjectView.role` arrive on the session, and found the
  phantom-permission drift in the builders (see Scope).
- **`rbac.check.mts`** (untracked throwaway at repo root) — used (yes). A `tsx`
  script that asserts the pure cascade math in `@wriven/contracts` (matrix,
  monotonicity, cascade union, scope). Confirms `effectivePermissions()` behaves
  as the frontend needs before wiring it in. Real jest specs land when repo test
  infra is wired; this script is disposable.
- **Nx MCP / Supabase MCP** — available, not relevant (no generator run, no DB).
- No domain plugin (messaging/email/payments/storage/auth-provider) is relevant.

## Scope

- In scope:
  - Add `@wriven/contracts` as a workspace dependency of `apps/client` and source
    all RBAC primitives from it (no local copy of the cascade/maps).
  - Type the local view mirror (`lib/types.ts`) role fields as `WorkspaceRole` /
    `ProjectRole` (or re-export from contracts) so `useCan()` input is typed.
  - Implement `useCan()`: resolve the active workspace + project role from the
    auth store, compute `effectivePermissions()`, return `can(perm) => boolean`.
  - Fix the **phantom-permission drift** in the nav builders — remap every
    `permission:` string to a real `Permission` enum value (see table below).
  - Gate dashboard nav items by permission (workspace + project sections).
  - A reusable `<Can permission>` component + `useCan()` for ad-hoc gating.
  - Action-button gating on the flagship content surfaces: content editor
    (Save/Create/Publish/Unpublish/Delete), media (upload/delete), members
    (add/remove/change-role, both levels), API keys (create/revoke), webhooks
    (create/delete/toggle), content types (create/edit fields).
  - Route-level fallback for management pages (members/billing/settings at both
    levels): when a user lands directly on a page their role cannot access, show
    a graceful "no access" state / redirect instead of relying on the backend
    403. (The backend still enforces; this is UX.)
  - Update `doc/frontend/sidebar.md` + `doc/status.md` to reflect the filled seam.
- Out of scope:
  - **Custom / per-workspace roles** (`customRoles` entitlement) — future; same
    seam, no call-site edits then.
  - **Field-level / content-type-field-level permissions** — P2 granular RBAC,
    future.
  - The local-vs-contracts type-mirror consolidation beyond the `role` fields
    (the rest of `lib/types.ts` stays as-is; only what RBAC needs is typed).
  - Bulk-gating every次要 button across the app beyond the flagship surfaces
    listed — follows iteratively via the same `<Can>` once the pattern lands.
  - Any backend change (contracts, services, gateway, DB).

### The phantom-permission drift (must fix)

The builders were written against permission names that **never landed** in the
`Permission` enum (specs/12 shipped `*_MANAGE` / `*_VIEW` only where a true view
perm exists). As written, `effectivePermissions(...).has('CONTENT_TYPE_VIEW')` is
always `false`, so a real `useCan()` would hide those nav items for everyone.
Remap to real enum values, applying the rule **"a nav item is shown if the role
can act on that surface"** (list-only reads that every project member should see
use `PROJECT_VIEW`):

| Builder entry | Phantom string | → Real `Permission` |
|---------------|----------------|---------------------|
| WS Members | `MEMBER_VIEW` | `WORKSPACE_MEMBERS_VIEW` |
| WS Usage & Stats | _(none)_ | `WORKSPACE_USAGE_VIEW` |
| WS Billing | `BILLING_VIEW` | `WORKSPACE_BILLING_MANAGE` |
| WS Settings | `WORKSPACE_SETTINGS_VIEW` | `WORKSPACE_EDIT` |
| Content Types | `CONTENT_TYPE_VIEW` | `CONTENT_TYPE_MANAGE` |
| Content | `CONTENT_VIEW` | `PROJECT_VIEW` |
| Media Library | `MEDIA_VIEW` | `MEDIA_MANAGE` |
| API Keys | `API_KEY_VIEW` | `API_KEY_MANAGE` |
| Project Members | `MEMBER_VIEW` | `PROJECT_MEMBERS_VIEW` |
| Project Settings | `PROJECT_SETTINGS_VIEW` | `PROJECT_EDIT` |

(Content uses `PROJECT_VIEW` deliberately: viewers/editors legitimately browse
entries; create/publish/delete are gated at the button level, not the nav.)

## API / endpoints

No new endpoints. No endpoint changes. The client consumes the existing session
shapes (`GET /auth/me` → `WorkspaceView.role` / `ProjectView.role`), already
typed on the contracts side by specs/12. Backend enforcement (`PermissionGuard`
→ `FORBIDDEN` 403) is unchanged and remains the source of truth; client gating
is a UX layer on top, never a substitute.

## Shared contracts (@wriven/contracts)

No new contracts. This spec consumes what specs/12 landed:
`Permission`, `WorkspaceRole`, `ProjectRole`, `WORKSPACE_ROLE_PERMISSIONS`,
`PROJECT_ROLE_PERMISSIONS`, `effectivePermissions`, `getProjectScope` — all
already exported from `libs/shared/contracts/src/index.ts` (`export * from
'./lib/types/rbac.types'`).

The only contracts-adjacent change is **consuming** the package from the client
(see New dependencies + Frontend changes).

## Database / schema

No schema changes. No migration. RBAC is entirely in code + contracts.

## Backend changes

None. api-gateway / auth-service / core-service are untouched. (Gateway already
attaches `workspacePermissions` / `projectPermissions` and enforces via
`PermissionGuard` — specs/12.)

## Frontend changes (apps/client)

- **`useCan()` — implement.** `apps/client/src/components/sidebar/use-can.ts`:
  read `currentWorkspaceId` / `currentProjectId` + the `workspaces` / `projects`
  arrays from `useAuthStore`, resolve the active `WorkspaceView.role` /
  `ProjectView.role`, compute `effectivePermissions(wsRole, projRole)` once
  (memoized on the role pair), return `can(permission) => perms.has(permission)`.
  The cascade means a workspace owner/admin with no `project_members` row still
  resolves every `PROJECT_*` perm (`projRole == null` is handled by
  `effectivePermissions`).
- **Nav `can` contract — tighten.** `nav.types.ts` / `gate.ts` / `use-can.ts`:
  change `can: (permission: string, scope?) => boolean` to
  `can: (permission: Permission) => boolean`. The `scope` param was never wired
  (the store already carries the active scope) — drop it. Builders pass
  `Permission.X` literals; the `gate()` filter and strip logic stays.
- **Builders — remap phantom perms.** `build-workspace-nav.ts` +
  `build-project-nav.ts`: replace every `permission: '<phantom>'` with the real
  `Permission` value from the table above; drop the now-unused `scope` field.
- **Local type mirror — type roles.** `lib/types.ts`: `WorkspaceView.role:
  string` → `WorkspaceRole`; `ProjectView.role: string` → `ProjectRole | null`;
type the member-view role fields likewise. Import the unions from
`@wriven/contracts`. (Rest of the mirror is untouched.)
- **`<Can>` component — create.** `components/auth/can.tsx`: a tiny
  `<Can permission={Permission.X}>{children}</Can>` (and render-prop variant for
  fallback) wrapping `useCan()`. The one primitive every action-button gate uses.
- **Action-button gating** — wrap the relevant controls in `<Can>` / branch on
  `useCan()`:
  - Content editor (`components/content/content-editor.tsx`): Save/Update →
    `CONTENT_ENTRY_UPDATE`; Create → `CONTENT_ENTRY_CREATE`; Publish/Unpublish →
    `CONTENT_ENTRY_PUBLISH`; Delete → `CONTENT_ENTRY_DELETE`.
  - Media page (`…/p/[projSlug]/media/page.tsx`): upload + delete → `MEDIA_MANAGE`.
  - Members pages (workspace + project): add/remove/change-role →
    `WORKSPACE_MEMBERS_MANAGE` / `PROJECT_MEMBERS_MANAGE`; owner-grant/transfer →
    `WORKSPACE_ROLE_ASSIGN` / `PROJECT_ROLE_ASSIGN` (also: only show the
    owner/admin controls to those who hold them).
  - API keys page: create/revoke → `API_KEY_MANAGE`.
  - Webhooks (`components/webhooks/webhooks-section.tsx`): create/delete/toggle →
    `WEBHOOK_MANAGE`.
  - Content types builder: create/edit fields → `CONTENT_TYPE_MANAGE`.
- **Route guard.** A `<RequirePermission permission>` wrapper (or a
  `useCan()`-based `notFound()`/redirect) applied to the management pages —
  workspace `billing` / `settings` / `members`, project `settings` / `members` —
  so a direct hit by an unauthorized role degrades gracefully. Keep it on the
  client; the backend 403 is unchanged.

## Files to create

- `apps/client/src/components/auth/can.tsx` — `<Can permission>` primitive
  (children + optional fallback), backed by `useCan()`.
- `apps/client/src/components/auth/require-permission.tsx` — route-level guard
  (renders children or redirects/`notFound()` when `useCan()(perm)` is false).

## Files to modify

- `apps/client/package.json` — add `"@wriven/contracts": "workspace:*"` to
  `dependencies` (then `pnpm install` to link via the workspace globs in
  `pnpm-workspace.yaml`).
- `apps/client/src/lib/types.ts` — type `role` fields (`WorkspaceView`,
  `ProjectView`, `WorkspaceMemberView`, `ProjectMemberView`) via the contracts
  unions.
- `apps/client/src/components/sidebar/use-can.ts` — implement the body.
- `apps/client/src/components/sidebar/nav.types.ts` — `can` signature →
  `(permission: Permission) => boolean` (drop `scope`).
- `apps/client/src/components/sidebar/builders/gate.ts` — match the new `can`
  signature; drop `scope` from `Gated<T>`.
- `apps/client/src/components/sidebar/builders/build-workspace-nav.ts` — remap
  perms per table; drop `scope`.
- `apps/client/src/components/sidebar/builders/build-project-nav.ts` — remap
  perms per table; drop `scope`.
- `apps/client/src/components/content/content-editor.tsx` — gate action buttons.
- `apps/client/src/app/(dashboard)/w/[wsSlug]/p/[projSlug]/media/page.tsx` — gate
  upload/delete.
- `apps/client/src/app/(dashboard)/w/[wsSlug]/members/page.tsx` +
  `…/p/[projSlug]/members/page.tsx` — gate member CRUD controls.
- `apps/client/src/app/(dashboard)/w/[wsSlug]/p/[projSlug]/api-keys/page.tsx` —
  gate create/revoke.
- `apps/client/src/components/webhooks/webhooks-section.tsx` — gate manage.
- Content-types surface — gate field/type edits by `CONTENT_TYPE_MANAGE`.
- `apps/client/src/app/(dashboard)/w/[wsSlug]/{billing,settings}/page.tsx` +
  `…/p/[projSlug]/settings/page.tsx` — wrap in `<RequirePermission>`.
- `doc/frontend/sidebar.md` — "RBAC seam" section: `useCan()` is no longer a
  stub; document the `Permission`-typed contract and the remap rule.
- `doc/status.md` — flip the frontend RBAC note (currently "deferred to its own
  spec") to done.

## New dependencies

- `@wriven/contracts` (`workspace:*`) added to `apps/client/package.json`
  `dependencies`. It already resolves via `pnpm-workspace.yaml` (`libs/shared/*`)
  and is how `api-gateway` consumes it (`apps/api-gateway/package.json:89`).
  No npm registry package; `pnpm install` links it. No other new dependencies.

## Rules for implementation

Base:
- Define shared DTOs/types/patterns/errors in `libs/shared/contracts`
  (`@wriven/contracts`) — check it before creating new ones. **Specifically: do
  not duplicate the RBAC cascade or maps client-side** — import
  `effectivePermissions` / `Permission` / the role maps from `@wriven/contracts`,
  the identical math the gateway uses.
- Store only R2 object **keys** in the DB; reconstruct URLs at runtime.
- Respect microservice boundaries. The client never re-implements authZ — it
  mirrors the backend's permission decisions for UX. The backend (`PermissionGuard`)
  remains the enforcement source of truth; a client denial is advisory, a client
  grant never overrides a backend 403.
- Endpoints return the response envelope; use error codes from
  `@wriven/contracts/errors.ts`; never leak stack traces or DB errors.
- Frontend (`apps/client`) and backend changes go in **separate commits**; stage
  selectively, never `git add -A` across both. (This spec is frontend-only, so a
  single commit scope is fine — but keep it separate from any unrelated work.)
- Run tasks through `pnpm nx <target> <project>`. Commits are one-line
  Conventional Commits with no body.

Feature-specific:
- **One cascade definition.** `effectivePermissions()` in `@wriven/contracts` is
  the only place the union is computed. Both the auth-service resolver and this
  client `useCan()` call it. Never re-derive the union in app code.
- **`useCan()` resolves from the store, not the URL.** Read
  `currentWorkspaceId` / `currentProjectId` and the session arrays; the URL sync
  (`use-scope.ts`) already keeps those ids current. Do not pass roles through the
  nav `data` refs — `useCan` is a sibling hook that reads the store directly, so
  `use-nav-context.ts` needs no role plumbing.
- **Nav contract is typed to `Permission`.** Tighten `can` to
  `(permission: Permission) => boolean` and drop the unused `scope` param —
  exhaustiveness at compile time is the payoff for the phantom-perm class of
  bug this spec fixes. Builders pass enum literals.
- **Gate by the action perm, not a surrogate.** A Publish button checks
  `CONTENT_ENTRY_PUBLISH`, not "is admin". A surface that is list-only for some
  roles (Content) uses `PROJECT_VIEW` at the nav and the action perm at the
  button — do not hide the whole surface because one action is unavailable.
- **Client denial is UX, not security.** Never trust the client to authorize;
  the backend 403 is the gate. Hiding a button that 403s anyway is courtesy, not
  enforcement — keep it that way (no `can()` result reaches a security decision).
- **`projRole == null` is valid.** A workspace owner/admin has no
  `project_members` row; `effectivePermissions('admin', null)` already yields
  every project perm. Do not special-case null into "no access".
- **Preserve the existing RBAC2 UX invariants** in member-management UIs: you
  cannot demote/remove the last workspace `owner` or project `admin` (the backend
  returns `CONFLICT`); disable those controls proactively for the last holder.

## Definition of done

- [ ] `@wriven/contracts` linked in `apps/client` (`pnpm install`; the import
  resolves, no local rbac map copy exists in `apps/client/src`).
- [ ] `pnpm nx typecheck client` passes — `WorkspaceView.role` /
      `ProjectView.role` typed; no bare `role: string` on those views; `can`
      signature is `(permission: Permission) => boolean`.
- [ ] `pnpm nx lint client` + `pnpm nx build client` green.
- [ ] Nav gating verified (manual smoke, `pnpm dev:client` + backend): with a
      project `viewer` session, Content Types / Media / API Keys / Members /
      Project Settings nav items are hidden and Content shows (list-only); with
      an `editor`/`admin` session they appear.
- [ ] Workspace `guest` session: only the assigned project's nav resolves; WS
      Billing/Settings/Members hidden.
- [ ] Action buttons verified: `viewer` sees no Publish/Delete/Create controls in
      the content editor, no upload/delete in media; `editor` sees Save/Create
      but not Publish/Delete; `admin` sees all.
- [ ] Route guard verified: an unauthorized role navigating directly to
      `/w/[ws]/billing` (as a non-owner/admin) gets the graceful no-access state,
      not a raw 403 page (and a direct API call still 403s — backend unchanged).
- [ ] Cascade verified client-side: a workspace `owner`/`admin` with no project
      membership row sees full project nav + actions (projRole null path).
- [ ] Last-owner / last-admin protection: the demote/remove control is disabled
      for the final holder in the member UIs.
- [ ] `rbac.check.mts` still passes (`npx tsx rbac.check.mts`) — the shared
      cascade math the client now imports is green.
- [ ] `doc/frontend/sidebar.md` + `doc/status.md` updated (doc-maintenance rule).
