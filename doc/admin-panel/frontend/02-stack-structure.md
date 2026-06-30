# Admin Panel — Stack & Project Structure

---

## 1. Tech stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Build | **Vite** + TypeScript | Fast SPA dev/build |
| Routing | **React Router** (data router: `createBrowserRouter`) | User's choice; use loaders/actions + route-level auth guards |
| Server state | **TanStack Query** (`@tanstack/react-query`) | All API reads/mutations; cache + invalidation + pagination |
| Tables | **TanStack Table** (`@tanstack/react-table`) | Sorting, column defs, server-side pagination — admin is tables |
| Forms | **react-hook-form** + **zod** (`@hookform/resolvers`) | Typed validation (plans, admins, user edits) |
| Auth/UI state | **Zustand** | Current admin identity, theme, sidebar collapse |
| Styling | **Tailwind CSS v4** | Design tokens in [05-design-system.md](./05-design-system.md); same engine as the tenant app |
| Primitives | **Base UI** (`@base-ui/react`) + **shadcn-style** wrappers | Same primitive set the tenant app uses — dialog, popover, tooltip, etc. |
| Icons | **lucide-react** | Same icon set as tenant app |
| Charts | **Recharts** | Overview KPIs |
| Dates | **date-fns** | Audit log, last-used, relative times |
| Notifications | **sonner** (or Base UI toast) | Action result toasts |

Pin versions to the same majors the tenant app uses where shared (Tailwind v4,
TanStack Query v5, Base UI v1, lucide v1, zustand v5) for visual/behavioral parity.

---

## 2. Project structure

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
    types.ts                  # HAND-MAINTAINED API types (mirror backend DTOs)
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
    globals.css               # Tailwind v4 import + the design tokens
```

Keep data fetching in `features/<x>/queries.ts` (TanStack Query hooks), screens in
`features/<x>/<x>-page.tsx`. Generic table/forms live in `components/`.

---

## 3. Environment (SPA repo)

```
VITE_API_URL=https://api.wriven.com     # gateway base; /admin/* lives here
```

The gateway must allowlist this SPA's origin for CORS with credentials — coordinate
the `ADMIN_PANEL_ORIGIN` value with the backend
([../backend/03-auth.md](../backend/03-auth.md), [../backend/01-overview.md §2](../backend/01-overview.md)).
