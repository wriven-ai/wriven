# Admin Panel — Auth, Data Layer & Navigation

---

## 1. API client (`lib/api.ts`)
A thin `fetch` wrapper. Rules:
- Base URL from `import.meta.env.VITE_API_URL` (e.g. `https://api.wriven.com`).
- **`credentials: 'include'`** on every request (cross-origin admin cookies).
- Send the **CSRF header** on mutations (read the CSRF token the gateway exposes,
  same scheme as the tenant client — see [../backend/03-auth.md §2](../backend/03-auth.md)).
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

---

## 2. Hand-maintained types (`lib/types.ts`)
No `@wriven/contracts` here. Mirror the backend DTOs
([../api-contract.md](../api-contract.md)). Keep it small and decoupled — same
philosophy as the published SDK client. Example:

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

---

## 3. Auth bootstrap & route guards
- On app load, `RequireAdmin` calls `GET /admin/auth/me` via TanStack Query. While
  loading → splash; success → hydrate `stores/admin`; `401` → redirect `/login`.
- `RequireRole` wraps role-restricted routes/sections: reads `admin.role` from the
  store, renders `403` page or hides the entry when not allowed.
- Login (`/login`): POST `/admin/auth/login`; if response is `{ mfaRequired }`,
  show the TOTP step and POST `/admin/auth/login/totp`; on success cookies are set
  → navigate to Overview.

---

## 4. Query conventions
- Centralize keys in `lib/query-keys.ts` (`['users', { page, q }]`, etc.).
- Lists: server-side pagination — pass `page`/`limit`/`q`/`sort`/filters as query
  params; keep them in the URL (`useSearchParams`) so views are shareable/bookmarkable.
- Mutations: `useMutation` + `invalidateQueries` on the affected key + a success
  toast; destructive ones go through the confirm dialog (see [04-screens.md](./04-screens.md)).

---

## 5. Layout & navigation
- **Left sidebar** (collapsible, persists collapse in the store): Overview · Users ·
  Workspaces · Projects · Content · Media · API Keys · Webhooks · Plans · Admins ·
  Audit · Settings. Hide `admin`-only items (Plans/Admins/Settings) for non-admins.
  Active item uses sidebar-accent bg + brand-accent text ([05-design-system.md](./05-design-system.md)).
- **Top bar:** global search (jump to user by email / workspace by slug / project /
  id), current admin name + **role badge**, theme toggle, logout. Optional
  environment badge (`PROD`/`STAGING`).
- **Page scaffold:** `PageHeader` (title + primary action) → `FilterBar` →
  `DataTable` → `Pagination`. Detail screens: header + `Tabs` panels.
- Use **right-side sheets** for quick inspect (don't lose table context) and
  **dialogs** for create/confirm.
