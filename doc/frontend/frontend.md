# Frontend (`apps/client`)

The Wriven web client — a Next.js 16 App Router SPA that talks to the API gateway over HTTP. Deployed to Vercel (frontend only; all backend services run on the VPS). Package: `@wriven/client`.

This is the overview. The dashboard navigation subsystem is documented separately in [sidebar.md](./sidebar.md).

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router), React 19 |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`) |
| UI primitives | shadcn (registry) on `@base-ui/react`; `lucide-react` icons; `cmdk`; `motion` |
| Server state | TanStack Query v5 |
| Client state | Zustand v5 |
| Forms | `react-hook-form` + `zod` (`@hookform/resolvers`) |
| Rich text | TipTap v3 (`react`, `starter-kit`, `extension-link`, `extension-placeholder`) |
| Theming | `next-themes` (class strategy, `wriven-theme` storage key) |

## Project structure

```
apps/client/src/
├── app/                    # App Router
│   ├── (auth)/             # route group: login, register, forgot/reset-password, verify-email
│   ├── auth/callback/      # Google OAuth redirect landing
│   ├── (dashboard)/        # route group: dashboard, w/, workspaces/ — behind RequireAuth
│   ├── invite/             # public invitation accept page
│   ├── about/ blog/ contact/ docs/ pricing/   # marketing / public
│   ├── layout.tsx          # root layout → <Providers>
│   └── providers.tsx       # QueryClient, ThemeProvider, api wiring, silent session restore
├── components/
│   ├── auth/               # RequireAuth guard, auth forms
│   ├── sidebar/            # nav shell + brain (see sidebar.md)
│   ├── topbar/             # dashboard navbar, workspace/project switchers
│   ├── content/ editor/ webhooks/ workspace/   # feature surfaces
│   └── ui/                 # shadcn/base-ui primitives
├── hooks/                  # useAuth, use-scope, use-current-workspace, use-workspace-projects, …
├── lib/
│   ├── api.ts              # typed API client (envelope unwrap, refresh, scope headers)
│   ├── types.ts            # response/input views (mirror @wriven/contracts)
│   └── utils.ts            # cn(), helpers
├── stores/auth.ts          # Zustand: session + current workspace/project + auth status
├── schemas/                # zod schemas
└── types/
```

## Auth & session

Auth is **fully cookie-based** — the access and refresh tokens live in `httpOnly` cookies the client never reads. There is no token in JS memory.

- **CSRF (double-submit):** the gateway returns a `csrfToken` in auth response bodies (login/register/refresh/me). The client holds it in memory only and echoes it back as `X-CSRF-Token` on every mutating request. Never persisted, never read from a cookie.
- **Silent restore:** on mount, `Providers` calls `authApi.me()`. If the access cookie expired, the client refreshes via the cookie and retries; success restores the session, failure marks it unauthenticated.
- **401 → refresh → retry:** `request()` intercepts 401 on authenticated calls, rotates the session once (a single de-duplicated refresh handles a burst of 401s), and replays the original request. A second failure calls `onAuthFailure` → unauthenticated.

## State

- **Client state** — `stores/auth.ts` (Zustand): the session (`SessionView`), `currentWorkspaceId`, `currentProjectId`, and auth `status`. The API client reads scope IDs from the store via injected accessors (`configureApi`), avoiding a store ↔ api import cycle.
- **Server state** — TanStack Query (`QueryClient`: `retry: 1`, `refetchOnWindowFocus: false`). Feature hooks wrap the API modules.

## API client (`lib/api.ts`)

A thin `fetch` wrapper that speaks the gateway's [response envelope](../conventions.md):

- Unwraps `{ success, data }` → returns `data`; on `{ success, error }` throws `ApiRequestError` carrying the error object.
- **Scope headers:** `workspace`/`project` options attach `X-Workspace-Id` / `X-Project-Id` from the auth store.
- **Credentials** ride automatically (`credentials: 'include'`).
- Base URL: `NEXT_PUBLIC_API_URL` (default `http://localhost:5000/api/v1`).

API modules: `authApi`, `contentApi` (types/entries/revisions), `apiKeyApi`, `webhookApi`, `mediaApi` (+ `uploadMedia`), `workspaceApi`, `memberApi`, `projectApi`, `projectMemberApi`, `invitationApi`. Google OAuth starts via a full-page navigation to `googleAuthUrl`.

### Media upload

`uploadMedia(file)` does **presign → PUT bytes straight to R2 → persist metadata** (keys-only — the DB stores the object key, never a full URL). Image pixel dimensions are read client-side before create.

## Scope (workspace → project → feature)

The URL is the single source of truth for active scope (`/w/[wsSlug]/p/[projSlug]/…`). `use-scope` syncs URL → store so the scope headers follow the user. Full nav architecture in [sidebar.md](./sidebar.md).

## Guards

`RequireAuth` wraps the `(dashboard)` layout: when unauthenticated it redirects to `/login`. Public + marketing routes and the invitation accept page render without it.

## Environment

| Var | Purpose |
|-----|---------|
| `NEXT_PUBLIC_API_URL` | Gateway base URL (`/api/v1`) |
| `NEXT_PUBLIC_USE_NGROK` | `true` attaches `ngrok-skip-browser-warning` (local tunneling) |

Per-service env only — the client has no backend secrets. See [Conventions §Environment](../conventions.md).

## Commands

```bash
pnpm dev:client        # Next dev server
pnpm nx build client   # production build
pnpm nx lint client
pnpm nx typecheck client
```

Run through `pnpm nx …`, never the raw tooling. Frontend and backend changes go in **separate commits**.
