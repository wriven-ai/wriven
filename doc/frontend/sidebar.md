# Dashboard Sidebar & URL-Driven Scope

How the dashboard navigation works in the Next.js client (`apps/client`). Two independent layers sit on top of an unchanged shadcn/Base UI sidebar shell: a **render shell** (how it looks) and a **nav-config brain** (what shows, when). The **URL is the single source of truth** for which workspace/project is active.

## Mental model

```
URL (/w/[wsSlug]/p/[projSlug]/…)
   │  resolved by the seam
   ▼
useNavContext()  ──▶  buildNavTree(ctx)  ──▶  NavTree  ──▶  <NavTreeRenderer>  ──▶  shell primitives
   (Layer 1)            (Layer 2, pure)      (config)        (Layer 3, dumb)        (Layer 4, untouched)
```

Product hierarchy: **workspace → project → feature**. Each level renders a different menu. Access is filtered by an injected `can()` gate — the **real** `effectivePermissions` cascade (see [RBAC seam](#rbac-seam) below), not a stub.

## Layers

| Layer | File(s) | Role |
|-------|---------|------|
| 4 — Shell | `components/ui/sidebar.tsx`, `components/ui/collapsible.tsx` | Compound primitives: collapse, cookie-backed open state, mobile `Sheet`, rail/trigger, `Cmd/Ctrl+B`, tooltips, `isActive` styling. **Not edited per feature.** |
| 3 — Renderer | `components/sidebar/nav-tree-renderer.tsx` | Dumb. Maps `NavTree` nodes → shell primitives. Owns the active-state rule. No domain knowledge. |
| 2 — Brain | `components/sidebar/build-nav-tree.ts` + `builders/` | Pure, sync. Plain `NavContext` in, declarative `NavTree` out. No React/fetch/`window`. |
| 1 — Context (seam) | `components/sidebar/use-nav-context.ts` | Assembles `NavContext` from URL + session + `can`. The one place that knows where context comes from. |
| 0 — Data | `stores/auth.ts`, `hooks/use-scope.ts` | Session (workspaces/projects) in Zustand; URL→store scope sync for API headers. |

## The contract

`components/sidebar/nav.types.ts` defines the tree everything produces/consumes:

- `NavLeaf` — link inside a collapsible (`href`, `label`, `icon?`, `match?`, `badge?`).
- `NavSubGroup` — labelled group of leaves.
- `NavItem` — top-level entry; flat link, or collapsible when `submenus` is non-empty; `defaultOpen?`.
- `NavGroup` — section with optional `groupLabel`.
- `NavTree = NavGroup[]`.
- `NavContext` — `{ pathname, params, can, data }`, assembled once per render.

Rendering falls out of shape: `NavItem` without `submenus` → flat link; with `submenus` → collapsible.

## URL-driven scope

Routes live under the `(dashboard)` route group (parens = no URL segment):

```
(dashboard)/
  layout.tsx                      RequireAuth + SidebarProvider + <AppSidebar/> + top bar
  dashboard/page.tsx              projects overview (default workspace's project list)
  profile/                        user profile (name/avatar + inline OTP email verify)
  w/[wsSlug]/
    layout.tsx                    useSyncWorkspaceFromUrl()
    page.tsx                      workspace overview
    members | usage | billing | settings | support{,/new,/[ticketId]} /page.tsx
    p/[projSlug]/
      layout.tsx                  useSyncProjectFromUrl()
      page.tsx                    project overview
      content-types | content | media | api-keys | members | settings /page.tsx
  workspaces/page.tsx             cross-workspace management list
```

There is **no** `w/[wsSlug]/projects` page — the workspace-level Projects list is the `/dashboard` overview.

**Why URL, not store:** deep-link / refresh / back-forward land in the right scope, links are shareable, and multiple tabs can hold different workspaces. (The store previously persisted the active ids in `localStorage`, which made two tabs fight over one selection.)

### The seam ↔ store ↔ API relationship

The API client (`lib/api.ts`) sets `X-Workspace-Id` / `X-Project-Id` from accessors wired in `app/providers.tsx`, which read `currentWorkspaceId` / `currentProjectId` from the store. To keep the API correct without touching `api.ts`, **the URL drives the store**:

- `hooks/use-scope.ts` — `useSyncWorkspaceFromUrl()` / `useSyncProjectFromUrl()` resolve the slug to an entity in the loaded session, mirror its id into the store via `setCurrentWorkspaceId` / `setCurrentProjectId` (plain setters, no side effects), and `notFound()` on an unknown slug once the session has loaded.
- `stores/auth.ts` — no longer persists the active ids (`persist` removed); the URL is the source of truth.
- Switching workspace/project **navigates** (`router.push`) rather than calling `setState`. The workspace switcher is a combobox (`topbar/workspace-switcher.tsx`) at the **top** of the sidebar (`app-sidebar.tsx`); the project switcher is a separate `topbar/project-switcher` in the dashboard navbar. The sidebar footer holds only logout.

## Builders (the brain)

Each builder owns one section, is pure, and returns `NavGroup | null` (`null` = not applicable in this context → filtered out by the orchestrator).

- `builders/build-workspace-nav.ts` — present when a workspace resolves; Overview, Members, Usage & Stats, Billing, Workspace Settings, **Support**.
- `builders/build-project-nav.ts` — present when both workspace and project resolve; Overview, Content Types, Content, Media, API Keys, Members, Project Settings.
- `builders/gate.ts` — `gate<T>(items, can)` filters by `permission`/`scope` then strips those fields so output matches the public type.

`build-nav-tree.ts` composes them **scope-exclusively**: when a `projSlug` is present the tree is the Home group + the project menu only; otherwise the workspace menu only. (A future **exclusive sub-context** — a focused feature that replaces the whole sidebar + a "back" link — would land as an early `return` here.)

## Active-state rule (the bug magnet)

Computed centrally in `nav-tree-renderer.tsx`:

- Explicit `active` wins.
- Else every node matches by **prefix** by default; exact matching only when `match: 'exact'` is set.

This is what prevents two rows lighting up at once. A collapsible auto-opens when any child is active (or `defaultOpen`).

## RBAC seam

`components/sidebar/use-can.ts` — `useCan()` returns `can(permission: Permission)
=> boolean`. It resolves the active workspace + project role from the auth store
(`workspaces`/`projects` keyed by the URL-synced `currentWorkspaceId`/
`currentProjectId`), computes `effectivePermissions(wsRole, projRole)` once
(memoized), and tests against it. The cascade is the **identical**
`effectivePermissions` function the auth-service resolver and gateway
`PermissionGuard` use — imported from `@wriven/contracts/rbac`, the pure-TS
subpath of the shared contracts package (the NestJS/class-validator DTOs are
tree-shaken out). So a workspace owner/admin with no `project_members` row still
holds every project permission.

The `can` contract is `Permission`-typed (no `scope` param — the store already
carries active scope), so builders pass enum literals. Builder `permission:`
values are the **action** perm for that surface (Content Types →
`CONTENT_TYPE_MANAGE`, Billing → `WORKSPACE_BILLING_MANAGE`, …); list-only
surfaces every project member reads use `PROJECT_VIEW` (Content). Nav hides
items the role cannot act on; per-action buttons and management routes gate
further via `<Can>` / `<RequirePermission>`
(`components/auth/`). Client gating is UX only — the backend `PermissionGuard`
(403) is the real gate.

## Adding navigation

- **New menu item** in an existing scope → add an entry to the relevant builder array (with optional `permission`/`scope`).
- **New section** → new `build-*-nav.ts` returning `NavGroup | null` + one line in `build-nav-tree.ts`. Zero renderer changes.
- **New route** → add the page under the matching scope folder; the slug resolves through the existing layout sync.

## What not to touch

- `components/ui/sidebar.tsx` primitives — the shell owns collapse, cookie open-state, mobile drawer, rail/trigger, keyboard shortcut, tooltip, `isActive` styling.
- `lib/api.ts` request layer — header-driven off the (URL-synced) store ids.

## Follow-ups

- Feature-level exclusive sub-context (drill-in + back link).
- Slug-rename redirects if workspace/project slugs become user-editable.
- **Default workspace for `/dashboard` — deferred.** `/dashboard` currently resolves the
  active workspace via `pickDefault()` in [use-current-workspace.ts](../../apps/client/src/hooks/use-current-workspace.ts):
  it prefers `WorkspaceView.isDefault` but, since the backend doesn't send that yet, falls
  back to `workspaces[0]` (which is the oldest membership — `/auth/me` orders by
  `workspace_members.createdAt`, so it's deterministically the auto-created primary).
  This is fine for one/few workspaces. **When multi-workspace becomes real**, implement
  **last-accessed** (not a manual default tag — scales better, zero user management; what
  Supabase/Linear/Vercel do):
  - Backend: `users.last_workspace_id uuid → workspaces(id)` (nullable, `on delete set null`).
  - Write it on workspace open (the `/w/[wsSlug]` layout); `/dashboard` resolves
    `last_workspace_id ?? oldest-by-createdAt`.
  - Emit `WorkspaceView.isDefault = (ws.id === user.last_workspace_id)` — **frontend already
    reads `isDefault`, so no client change needed.**
