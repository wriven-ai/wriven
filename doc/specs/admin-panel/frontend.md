# Admin Panel — Frontend Build Guide

Complete, self-contained guide for the agent building the **Wriven Admin Panel
SPA** in its **own separate repository**. Read this end to end before writing code.

You are building a React + React Router single-page app that talks to the
`/admin/*` API on the Wriven gateway (`https://api.wriven.com`). The backend
contract is defined in [backend.md](./backend.md); the product context in
[README.md](./README.md). This doc is everything the frontend needs: stack,
project structure, auth/data layer, every screen, and the **design system**.

> You will NOT have access to the Wriven monorepo or `@wriven/contracts`. This is
> a standalone repo. All API types are **hand-maintained here** (§4.2), mirroring
> the backend DTOs in backend.md §6.

---

## 1. What you are building

An internal, staff-only **operations console**. Cross-tenant, table-heavy,
god-mode. Three admin roles drive what's visible/enabled: **`admin`** (full),
**`moderator`** (oversight + moderation, no admin-user/plan/settings mgmt),
**`member`** (read-only). Role comes from `GET /admin/auth/me`; gate UI on it —
but remember the **server enforces** it too, so never rely on hiding alone.

Screens (build in this order): Login → Overview → Users → Workspaces → Projects →
Content → Media → API Keys → Webhooks → Plans → Admins → Audit Log → Settings.
Full spec per screen in §6.

---

## 2. Tech stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Build | **Vite** + TypeScript | Fast SPA dev/build |
| Routing | **React Router** (data router: `createBrowserRouter`) | User's choice; use loaders/actions + route-level auth guards |
| Server state | **TanStack Query** (`@tanstack/react-query`) | All API reads/mutations; cache + invalidation + pagination |
| Tables | **TanStack Table** (`@tanstack/react-table`) | Sorting, column defs, server-side pagination — admin is tables |
| Forms | **react-hook-form** + **zod** (`@hookform/resolvers`) | Typed validation (plans, admins, user edits) |
| Auth/UI state | **Zustand** | Current admin identity, theme, sidebar collapse |
| Styling | **Tailwind CSS v4** | Design tokens in §7; same engine as the tenant app |
| Primitives | **Base UI** (`@base-ui/react`) + **shadcn-style** wrappers | Same primitive set the tenant app uses — dialog, popover, tooltip, etc. |
| Icons | **lucide-react** | Same icon set as tenant app |
| Charts | **Recharts** | Overview KPIs |
| Dates | **date-fns** | Audit log, last-used, relative times |
| Notifications | **sonner** (or Base UI toast) | Action result toasts |

Pin versions to the same majors the tenant app uses where shared (Tailwind v4,
TanStack Query v5, Base UI v1, lucide v1, zustand v5) for visual/behavioral parity.

---

## 3. Project structure

```
src/
  main.tsx                    # mount + QueryClientProvider + RouterProvider
  router.tsx                  # createBrowserRouter; route tree + guards
  app/
    root-layout.tsx           # sidebar + topbar shell (authed)
    auth-layout.tsx           # bare layout for /login
    require-admin.tsx         # route guard: bootstraps /auth/me, redirects to /login on 401
    require-role.tsx          # gate a route/section by role
  lib/
    api.ts                    # fetch wrapper: envelope unwrap, credentials, CSRF, 401 handling
    query-keys.ts             # centralized TanStack Query keys
    types.ts                  # HAND-MAINTAINED API types (mirror backend.md §6)
    format.ts                 # bytes, dates, numbers
  stores/
    admin.ts                  # zustand: current admin (id/email/role), theme, sidebar
  components/
    ui/                       # shadcn-style: button, input, dialog, sheet, popover,
                              #   tooltip, table, badge, skeleton, dropdown-menu, tabs,
                              #   command, select, checkbox, confirm-dialog
    data-table/               # generic TanStack Table wrapper: DataTable, columns helpers,
                              #   Pagination, FilterBar, RowActions (⋯ menu)
    layout/                   # AppSidebar, TopBar, PageHeader, EmptyState, StatCard
    charts/                   # KpiLineChart, PlanBreakdownPie, etc.
  features/                   # one folder per screen: queries + components + page
    auth/  overview/  users/  workspaces/  projects/  content/
    media/  api-keys/  webhooks/  plans/  admins/  audit/  settings/
  styles/
    globals.css               # Tailwind v4 import + the §7 design tokens
```

Keep data fetching in `features/<x>/queries.ts` (TanStack Query hooks), screens in
`features/<x>/<x>-page.tsx`. Generic table/forms live in `components/`.

---

## 4. Auth & data layer

### 4.1 API client (`lib/api.ts`)
A thin `fetch` wrapper. Rules:
- Base URL from `import.meta.env.VITE_API_URL` (e.g. `https://api.wriven.com`).
- **`credentials: 'include'`** on every request (cross-origin admin cookies).
- Send the **CSRF header** on mutations (read the CSRF token the gateway exposes,
  same scheme as the tenant client — see backend.md §3.2).
- Parse the envelope: on `{ success: true }` return `data`; on `{ success: false }`
  throw an `ApiError(status, code, message)`.
- On `401` → clear admin store + redirect to `/login` (central interceptor).

```ts
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...csrfHeader(init?.method), ...init?.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    if (res.status === 401) handleUnauthorized();
    throw new ApiError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? res.statusText);
  }
  return body.data as T;
}
```

### 4.2 Hand-maintained types (`lib/types.ts`)
No `@wriven/contracts` here. Mirror the backend DTOs (backend.md §6). Keep it
small and decoupled — same philosophy as the published SDK client. Example:

```ts
export type AdminRole = 'admin' | 'moderator' | 'member';
export interface AdminMe { adminUserId: string; email: string; name: string; role: AdminRole; }

export interface Paginated<T> { items: T[]; page: number; limit: number; total: number; }

export interface TenantUser {
  id: string; email: string; name: string; provider: 'local' | 'google';
  emailVerified: boolean; suspended: boolean; workspaceCount: number; createdAt: string;
}
export interface WorkspaceRow {
  id: string; name: string; slug: string; ownerEmail: string;
  memberCount: number; projectCount: number; storageUsedMb: number;
  planKey: string; status: 'active' | 'past_due' | 'suspended' | 'trialing'; createdAt: string;
}
// ...one interface per list/detail shape the screens consume.
```

### 4.3 Auth bootstrap & route guards
- On app load, `RequireAdmin` calls `GET /admin/auth/me` via TanStack Query. While
  loading → splash; success → hydrate `stores/admin`; `401` → redirect `/login`.
- `RequireRole` wraps role-restricted routes/sections: reads `admin.role` from the
  store, renders `403` page or hides the entry when not allowed.
- Login (`/login`): POST `/admin/auth/login`; if response is `{ mfaRequired }`,
  show the TOTP step and POST `/admin/auth/login/totp`; on success cookies are set
  → navigate to Overview.

### 4.4 Query conventions
- Centralize keys in `lib/query-keys.ts` (`['users', { page, q }]`, etc.).
- Lists: server-side pagination — pass `page`/`limit`/`q`/`sort`/filters as query
  params; keep them in the URL (`useSearchParams`) so views are shareable/bookmarkable.
- Mutations: `useMutation` + `invalidateQueries` on the affected key + a success
  toast; destructive ones go through the confirm dialog (§6 conventions).

---

## 5. Layout & navigation

- **Left sidebar** (collapsible, persists collapse in the store): Overview · Users ·
  Workspaces · Projects · Content · Media · API Keys · Webhooks · Plans · Admins ·
  Audit · Settings. Hide `admin`-only items (Plans/Admins/Settings) for non-admins.
  Active item uses sidebar-accent bg + brand-accent text (§7).
- **Top bar:** global search (jump to user by email / workspace by slug / project /
  id), current admin name + **role badge**, theme toggle, logout. Optional
  environment badge (`PROD`/`STAGING`).
- **Page scaffold:** `PageHeader` (title + primary action) → `FilterBar` →
  `DataTable` → `Pagination`. Detail screens: header + `Tabs` panels.
- Use **right-side sheets** for quick inspect (don't lose table context) and
  **dialogs** for create/confirm.

---

## 6. Screens (detailed spec)

Shared conventions for all:
- **Tables**: server-paginated, sortable columns, filter chips, a `⋯` row-actions
  menu, loading skeletons, empty states. Build once in `components/data-table/`.
- **Status badges**: color-coded via status tokens — active=success,
  suspended/over-limit/failed=error, past-due/near-cap=warning.
- **Destructive actions** (suspend, delete, revoke, disable, takedown, purge):
  a confirm dialog that (a) states the blast radius, (b) for high-impact ops
  requires typing the target name/slug, (c) captures a **reason** sent to the API
  and stored in audit metadata. Gated by role (§3 backend).
- **Role gating**: `member` sees read-only everywhere (no action buttons);
  `moderator` sees moderation/support actions but not Plans/Admins/Settings;
  `admin` sees all.

1. **Login** (`/login`) — email+password form (RHF+zod). On `{ mfaRequired }`
   show 6-digit TOTP input. No signup link. On success → Overview.

2. **Overview** (`/`) — KPI `StatCard`s (total users, workspaces, projects,
   content entries, storage used, active plans). `KpiLineChart` of signups/growth.
   `PlanBreakdownPie`. Widgets: recent audit events, failing webhooks. Source:
   `GET /admin/metrics/overview`.

3. **Users** (`/users`) — table: email, name, provider, verified badge,
   #workspaces, created, status. Filters: query, verified, suspended. Row → detail
   (`/users/:id`): profile, memberships (workspaces+roles), recent activity.
   Actions `[admin|moderator]`: suspend/reactivate, force-verify, resend
   verification, reset password; `[admin]`: delete/GDPR-erase. All audited.

4. **Workspaces** (`/workspaces`) — table: name, owner email, members, projects,
   **storage used vs cap** (progress bar, warning near cap), plan badge, status.
   Detail (`/workspaces/:id`) tabs: Members · Projects · Storage · Plan. Plan tab
   `[admin]`: change plan + set overrides. `[admin|moderator]`: suspend/rename.

5. **Projects** (`/projects`) — cross-workspace table: name, workspace, counts
   (types/entries/keys/webhooks), created-by, status. Detail drills into the
   project's content/keys/webhooks (read-only oversight). `[admin]`: soft-delete.

6. **Content** (`/content`) — global entry browser for **moderation**, read-only by
   default. Filters: workspace, project, type, status. View one entry read-only;
   `[admin|moderator]` takedown = archive/unpublish (confirm + reason, audited).
   Not an editor.

7. **Media** (`/media`) — storage usage per workspace (against the 100 MB cap),
   largest files, by kind (image/video/file). `[admin|moderator]` purge an
   abusive/oversized asset (confirm + reason). Show R2 totals.

8. **API Keys** (`/api-keys`) — all keys platform-wide: prefix, scope
   (read/preview/manage), project, last used, created. **Never raw tokens.**
   `[admin|moderator]` revoke (confirm).

9. **Webhooks** (`/webhooks`) — all subscriptions: url, events, last status code,
   last fired, active. Highlight failing endpoints. `[admin|moderator]` disable.

10. **Plans** (`/plans`) `[admin]` — list/define plans + their limit sets
    (projects, members, storageMb, entries, apiKeys, webhooks), price (display).
    Create/edit via RHF+zod. Assignment happens on the workspace detail screen.

11. **Admins** (`/admins`) `[admin]` — manage `admin_users`: invite/create, set
    role (admin/moderator/member), activate/deactivate, reset MFA. Every change
    audited. Cannot deactivate your own last admin (guard in UI + API).

12. **Audit Log** (`/audit`) — filterable feed (admin, action, target type/id,
    date range). Columns: when, admin, action, target, ip. Expand a row to see
    `metadata` (before/after, reason). Append-only, never editable.

13. **Settings** (`/settings`) `[admin]` — platform feature flags (signups open,
    default plan, maintenance mode) if the backend exposes `platform_settings`.

---

## 7. Design system

Reuse the **Wriven brand** so the console feels part of the product, tuned for
**dense operational** screens. Tokens below are the canonical Wriven palette (light
+ dark), font, shadows, and utility classes — lifted from the tenant app's
`global.css`. Drop them into `src/styles/globals.css`.

### 7.1 Tailwind v4 setup (`globals.css`)

```css
@import 'tailwindcss';
@import 'tw-animate-css';            /* if you want the same animations */

@custom-variant dark (&:is(.dark *));

@theme {
  /* brand */
  --color-brand-accent: var(--brand-accent);
  --color-brand-accent-hover: var(--brand-accent-hover);
  --color-brand-secondary: var(--brand-secondary);
  --color-brand-bg: var(--brand-bg);
  --color-brand-surface: var(--brand-surface);
  --color-brand-surface-soft: var(--brand-surface-soft);
  --color-brand-border: var(--brand-border);

  /* shadcn aliases mapped onto brand */
  --color-background: var(--brand-bg);
  --color-foreground: var(--text-primary);
  --color-border: var(--brand-border);
  --color-input: var(--brand-border);
  --color-ring: var(--brand-accent);
  --color-card: var(--brand-surface);
  --color-card-foreground: var(--text-primary);
  --color-popover: var(--brand-surface);
  --color-popover-foreground: var(--text-primary);
  --color-muted: var(--brand-surface-soft);
  --color-muted-foreground: var(--text-muted);
  --color-accent: var(--brand-surface-soft);
  --color-accent-foreground: var(--text-primary);
  --color-primary: var(--brand-accent);
  --color-primary-foreground: #ffffff;
  --color-secondary: var(--brand-surface-soft);
  --color-secondary-foreground: var(--text-primary);

  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-status-success: var(--status-success);
  --color-status-warning: var(--status-warning);
  --color-status-error: var(--status-error);

  /* sidebar */
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);

  /* type — load Manrope via @fontsource/manrope or a <link> */
  --font-sans: 'Manrope', sans-serif;
  --text-2xs: 0.65rem;
  --text-3xs: 0.55rem;
}

:root {
  --brand-accent: #0b6e4f;          /* Sovereign Emerald */
  --brand-accent-hover: #075039;    /* Deep Forest */
  --brand-secondary: #d97706;       /* Refined deep amber */
  --brand-bg: #faf8f5;              /* Warm oatmeal eggshell */
  --brand-surface: #ffffff;
  --brand-surface-soft: #eef4f0;    /* Sage-tinted wash */
  --brand-border: #dbe5df;          /* Ice-sage hairline */

  --text-primary: #080d0a;          /* Ink charcoal */
  --text-secondary: #424c46;        /* Slate pine */
  --text-muted: #79857e;            /* Faint spruce */

  --status-success: #1e6b4b;
  --status-warning: #b37d28;
  --status-error: #a32e2e;

  --sidebar: #ffffff;
  --sidebar-foreground: #080d0a;
  --sidebar-accent: #eef4f0;
  --sidebar-accent-foreground: #0b6e4f;
  --sidebar-border: #dbe5df;

  --shadow-sm: 0 4px 12px -2px rgba(8,13,10,.05), 0 2px 6px -1px rgba(8,13,10,.03);
  --shadow-lg: 0 16px 32px -4px rgba(8,13,10,.06), 0 8px 16px -2px rgba(8,13,10,.03);
}

.dark {
  --brand-accent: #0faf7b;          /* Electric Chromium Emerald */
  --brand-accent-hover: #15d296;    /* Vivid mint neon */
  --brand-secondary: #f59e0b;       /* Luminous Sun Amber */
  --brand-bg: #050a08;              /* Obsidian pine */
  --brand-surface: #0c1210;         /* Rainforest carbon */
  --brand-surface-soft: #141d19;    /* Slate moss */
  --brand-border: #1d2a23;          /* Spruce twilight line */

  --text-primary: #faf8f5;
  --text-secondary: #99a6a0;
  --text-muted: #64736c;

  --status-success: #35a375;
  --status-warning: #dca245;
  --status-error: #d94646;

  --sidebar: #0c1210;
  --sidebar-foreground: #faf8f5;
  --sidebar-accent: #141d19;
  --sidebar-accent-foreground: #0faf7b;
  --sidebar-border: #1d2a23;

  --shadow-sm: 0 4px 12px -2px rgba(0,0,0,.35), 0 2px 6px -1px rgba(0,0,0,.25);
  --shadow-lg: 0 16px 32px -4px rgba(0,0,0,.5), 0 8px 16px -2px rgba(0,0,0,.4);
}

body {
  background-color: var(--color-brand-bg);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
}
```

### 7.2 Palette reference

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| accent | `#0b6e4f` | `#0faf7b` | Primary buttons, active nav, links |
| accent-hover | `#075039` | `#15d296` | Hover/pressed |
| secondary | `#d97706` | `#f59e0b` | Secondary accents/highlights |
| bg | `#faf8f5` | `#050a08` | App background |
| surface | `#ffffff` | `#0c1210` | Cards, tables, panels |
| surface-soft | `#eef4f0` | `#141d19` | Muted rows, hover, chips |
| border | `#dbe5df` | `#1d2a23` | Hairlines, table borders |
| text-primary | `#080d0a` | `#faf8f5` | Body/headings |
| text-secondary | `#424c46` | `#99a6a0` | Secondary text |
| text-muted | `#79857e` | `#64736c` | Meta, placeholders |
| success | `#1e6b4b` | `#35a375` | Active/healthy/published |
| warning | `#b37d28` | `#dca245` | Past-due/near-limit |
| error | `#a32e2e` | `#d94646` | Suspended/failed/destructive |

### 7.3 Typography & density
- Font: **Manrope** across the board (`--font-sans`). Load via `@fontsource/manrope`
  (weights 400–800) or a Google Fonts `<link>`. No italics (the brand strips them).
- Admin density: base `13–14px`; compact table rows (`h-9`/`h-10`); use
  `text-2xs`/`text-3xs` for table meta and badges. Tighter than the tenant editor.
- Headings: Manrope semibold/bold; generous letter-spacing on small caps labels.

### 7.4 Components & motion
- shadcn-style wrappers over **Base UI** primitives (dialog, popover, tooltip,
  dropdown-menu, tabs, select, checkbox, command). Match the tenant app's
  `data-slot` styling so the two products feel identical.
- **Shadows:** `--shadow-sm` for cards/tables, `--shadow-lg` for popovers/dialogs.
  Subtle hover lift only on interactive cards (`translateY(-2px)`), not on dense
  table rows.
- **Radii:** medium (`rounded-lg` ~10–12px) on cards/inputs/buttons; chips/badges
  fully rounded. Keep it consistent and calm — this is an ops tool, not marketing.
- **Status badges:** soft surface bg + status-color text/border (e.g. success =
  `surface-soft` bg, `status-success` text).
- **Focus:** visible ring using `--color-ring` (brand accent) — important for a
  keyboard-heavy admin tool.
- **Dark mode:** toggle on `<html class="dark">` via the store; persist preference.

### 7.5 Optional brand textures
The tenant app ships `.editorial-grid` (faint blueprint grid), `.neo-shadow*`
(organic depth), `.clay-plate`, `.paper-grain`. **Use sparingly** in an admin tool
— maybe the login screen background or empty states. Keep data screens flat and
legible; texture is for personality moments, not dense tables.

---

## 8. Definition of done
- Login (+TOTP) works against `/admin/auth/*`; `member`/`moderator`/`admin` see the
  correct subset of nav and actions; server still rejects forbidden writes.
- Every list is server-paginated/filterable with URL-synced params; every
  destructive action goes through confirm+reason and shows a result toast.
- Brand palette (light + dark) matches the tenant app; Manrope everywhere.
- No raw secrets ever rendered; no tenant-app code or `@wriven/contracts` imported.
- Talks only to `/admin/*`; `credentials: 'include'`; 401 → `/login`.

---

## 9. Environment (SPA repo)

```
VITE_API_URL=https://api.wriven.com     # gateway base; /admin/* lives here
```

The gateway must allowlist this SPA's origin for CORS with credentials — coordinate
the `ADMIN_PANEL_ORIGIN` value with the backend (backend.md §3.2, §7).
```
