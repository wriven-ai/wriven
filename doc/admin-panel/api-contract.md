# Admin Panel — API Contract (frontend handoff)

The concrete `/admin/*` contract for the **separate-repo admin SPA**. Hand this to
the frontend agent. It can't import `@wriven/contracts`, so the TypeScript types
below are copy-paste-ready into the SPA's `lib/types.ts` (§4.2 of
[frontend.md](./frontend.md)).

**Conventions (all endpoints):**
- Base URL: `${VITE_API_URL}` (e.g. `https://api.wriven.com`), prefix `/api/v1`,
  so full path = `${VITE_API_URL}/api/v1/admin/...`.
- Auth: httpOnly admin cookies. Send `credentials: 'include'` on **every** request.
- Envelope: success → `{ "success": true, "data": <T> }`; error →
  `{ "success": false, "error": { "code", "message" } }`. Unwrap `data`; throw on
  `error`.
- CSRF: on mutations (POST/PATCH/PUT/DELETE) send header `X-CSRF-Token: <token>`.
  The token comes from the login/refresh response body and from `GET /auth/me`.
- Role gate in brackets `[…]`. No bracket = any authenticated admin (incl.
  read-only `member`). Roles: `admin` · `moderator` · `member`. **Server enforces
  it** — hiding a button is UX only.
- Pagination query: `?page=1&limit=20` (+ `q` search where noted). Lists return
  `Paginated<T>`.

---

## Endpoints

### Auth
| Method | Path | Role | Body | Returns |
|--------|------|------|------|---------|
| POST | `/admin/auth/login` | — | `{ email, password }` | `{ admin: AdminView, csrfToken }` |
| POST | `/admin/auth/refresh` | — | — | `{ csrfToken }` |
| POST | `/admin/auth/logout` | — | — | `{ success: true }` |
| GET | `/admin/auth/me` | any | — | `AdminView & { csrfToken: string \| null }` |

On boot call `GET /admin/auth/me` to hydrate session; 401 → redirect `/login`.
(TOTP/MFA is **not** implemented yet — login is single-step email+password.)

### Metrics
| GET | `/admin/metrics/overview` | any | — | `AdminMetricsOverview` |

### Tenant users
| GET | `/admin/users?page&limit&q` | any | — | `Paginated<AdminUserRow>` |
| GET | `/admin/users/:id` | any | — | `AdminUserDetail` |
| PATCH | `/admin/users/:id` | `[admin, moderator]` | `{ suspended?, emailVerified? }` | `AdminUserRow` |
| DELETE | `/admin/users/:id` | `[admin]` | — | `{ success: true }` |

`DELETE` returns `409 CONFLICT` if the user owns workspaces/projects (FK-guarded).

### Workspaces
| GET | `/admin/workspaces?page&limit&q` | any | — | `Paginated<AdminWorkspaceRow>` |
| GET | `/admin/workspaces/:id` | any | — | `AdminWorkspaceDetail` |
| PUT | `/admin/workspaces/:id/plan` | `[admin]` | `AssignPlanDto` | `{ success, planKey, status }` |

### Projects
| GET | `/admin/projects?page&limit&q` | any | — | `Paginated<AdminProjectRow>` |
| GET | `/admin/projects/:id` | any | — | `AdminProjectRow` |
| DELETE | `/admin/projects/:id` | `[admin]` | — | `{ success: true }` (soft-delete) |

### Content moderation
| GET | `/admin/content?page&limit&workspaceId?&projectId?&contentTypeId?&status?` | any | — | `Paginated<AdminEntryRow>` |
| GET | `/admin/content/:id` | any | — | `AdminEntryDetail` |
| PATCH | `/admin/content/:id` | `[admin, moderator]` | `{ status: 'draft' \| 'archived' }` | `AdminEntryRow` |

`status` filter ∈ `draft|published|archived`. PATCH = takedown (also purges CDN).

### Media
| GET | `/admin/media?page&limit&workspaceId?&projectId?` | any | — | `Paginated<AdminMediaRow>` |
| GET | `/admin/media/usage` | any | — | `AdminMediaUsageRow[]` (top 100 by bytes) |
| DELETE | `/admin/media/:id` | `[admin, moderator]` | — | `{ success: true }` (purge) |

### API keys
| GET | `/admin/api-keys?page&limit&workspaceId?&projectId?` | any | — | `Paginated<AdminApiKeyRow>` |
| DELETE | `/admin/api-keys/:id` | `[admin, moderator]` | — | `{ success: true }` (revoke) |

Tokens are never returned — only `prefix`.

### Webhooks
| GET | `/admin/webhooks?page&limit&workspaceId?&projectId?` | any | — | `Paginated<AdminWebhookRow>` |
| PATCH | `/admin/webhooks/:id/disable` | `[admin, moderator]` | — | `{ success: true }` |

### Plans
| GET | `/admin/plans` | any | — | `AdminPlanView[]` (sorted by `sortOrder`; incl. Stripe ids) |
| POST | `/admin/plans` | `[admin]` | `CreatePlanDto` | `AdminPlanView` |
| PATCH | `/admin/plans/:id` | `[admin]` | `UpdatePlanDto` | `AdminPlanView` |

**Plan ↔ Stripe sync (specs/11):**
- **Create** a paid plan (`key !== 'free'`) also creates the Stripe Product + monthly/yearly Prices and stores their ids — the returned `AdminPlanView` has `stripeProductId` / `stripePriceIdMonthly` / `stripePriceIdYearly` populated. A paid plan with **no** `priceMonthly`/`priceYearly` → `VALIDATION_ERROR` 422. Free plan skips Stripe.
- **Patch `active:false`** archives the Stripe Product + deactivates its Prices (retire). Other fields are local-only.
- **Prices are read-only after create** — `UpdatePlanDto` has no price fields; Stripe owns pricing.
- A Stripe call failing mid-create/retire → `STRIPE_SYNC_FAILED` 500 (the DB row is not left half-linked).

### Admin users (platform staff)
| GET | `/admin/admins?page&limit&q` | `[admin]` | — | `Paginated<AdminView>` |
| POST | `/admin/admins` | `[admin]` | `CreateAdminDto` | `AdminView` |
| PATCH | `/admin/admins/:id` | `[admin]` | `{ role?, active? }` | `AdminView` |
| DELETE | `/admin/admins/:id` | `[admin]` | — | `{ success: true }` |

Guards: can't deactivate/delete **yourself**; can't remove the **last active
admin** → `409 CONFLICT`. Whole resource is `admin`-only (hide nav for others).

### Audit log
| GET | `/admin/audit-log?page&limit` | any | — | `Paginated<AuditLogView>` |

---

## TypeScript types (paste into the SPA)

```ts
export type AdminRole = 'admin' | 'moderator' | 'member';

export interface Paginated<T> {
  items: T[]; page: number; limit: number; total: number;
}

// ── Admin identity ──────────────────────────────────────────────
export interface AdminView {
  id: string; email: string; name: string; role: AdminRole;
  active: boolean; lastLoginAt: string | null; createdAt: string;
}

// ── Tenant users ────────────────────────────────────────────────
export interface AdminUserRow {
  id: string; email: string; name: string; provider: string;
  emailVerified: boolean; suspended: boolean;
  workspaceCount: number; createdAt: string;
}
export interface AdminUserDetail extends AdminUserRow {
  workspaces: { id: string; name: string; slug: string; role: string }[];
  projects: { id: string; name: string; workspaceId: string; role: string }[];
}

// ── Workspaces ──────────────────────────────────────────────────
export interface AdminWorkspaceRow {
  id: string; name: string; slug: string;
  ownerId: string; ownerEmail: string | null;
  memberCount: number; projectCount: number;
  planKey: string | null; planName: string | null;
  subscriptionStatus: string | null; createdAt: string;
}
export interface AdminWorkspaceDetail extends AdminWorkspaceRow {
  members: { userId: string; email: string; name: string; role: string }[];
  projects: { id: string; name: string; slug: string }[];
}

// ── Projects ────────────────────────────────────────────────────
export interface AdminProjectRow {
  id: string; name: string; slug: string;
  workspaceId: string; workspaceName: string | null;
  createdBy: string; deleted: boolean; createdAt: string;
}

// ── Content / media / keys / webhooks ───────────────────────────
export interface AdminEntryRow {
  id: string; workspaceId: string; projectId: string; contentTypeId: string;
  slug: string; status: string; authorId: string;
  publishedAt: string | null; createdAt: string; updatedAt: string;
}
export interface AdminEntryDetail extends AdminEntryRow {
  data: Record<string, unknown>;
}
export interface AdminMediaRow {
  id: string; workspaceId: string; projectId: string; kind: string;
  mime: string | null; sizeBytes: number | null;
  originalFilename: string | null; uploadedBy: string; createdAt: string;
}
export interface AdminMediaUsageRow {
  workspaceId: string; assetCount: number; totalBytes: number;
}
export interface AdminApiKeyRow {
  id: string; workspaceId: string; projectId: string; name: string;
  prefix: string; scope: string;
  lastUsedAt: string | null; revokedAt: string | null; createdAt: string;
}
export interface AdminWebhookRow {
  id: string; workspaceId: string; projectId: string; url: string;
  events: string[]; active: boolean;
  lastStatus: number | null; lastFiredAt: string | null; createdAt: string;
}

// ── Plans ───────────────────────────────────────────────────────
export interface PlanLimits {
  projects?: number | null; members?: number | null; environments?: number | null;
  contentTypes?: number | null; entries?: number | null; locales?: number | null;
  storageMb?: number | null; assetBandwidthGb?: number | null;
  apiRequestsPerMonth?: number | null; apiKeys?: number | null; webhooks?: number | null;
}
export interface PlanFeatures {
  scheduledPublishing?: boolean; revisionHistory?: boolean; customRoles?: boolean;
  sso?: boolean; auditLog?: boolean; previewApi?: boolean;
  supportTier?: 'community' | 'email' | 'priority';
}
export interface PlanView {
  id: string; key: string; name: string; description: string | null;
  sortOrder: number; isPublic: boolean; active: boolean;
  priceMonthly: number | null; priceYearly: number | null; // cents
  currency: string; trialDays: number;
  limits: PlanLimits; features: PlanFeatures;
}
// Returned by /admin/plans (admin only) — adds the Stripe linkage the tenant
// PlanView omits. `stripeProductId === null` ⇒ not yet linked / free plan.
export interface AdminPlanView extends PlanView {
  stripeProductId: string | null;
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
}

// ── Audit + metrics ─────────────────────────────────────────────
export interface AuditLogView {
  id: string; adminUserId: string; adminEmail: string | null;
  action: string; targetType: string | null; targetId: string | null;
  metadata: Record<string, unknown>; ip: string | null; createdAt: string;
}
export interface AdminMetricsOverview {
  users: { total: number; verified: number };
  workspaces: { total: number };
  projects: { total: number };
  content: { entries: number; published: number };
  media: { totalBytes: number };
  plans: { key: string; name: string; count: number }[];
}
```

### Request bodies (DTOs)

```ts
// POST /admin/auth/login
interface AdminLoginDto { email: string; password: string; }

// POST /admin/admins
interface CreateAdminDto { name: string; email: string; password: string; role: AdminRole; }
// PATCH /admin/admins/:id
interface UpdateAdminDto { role?: AdminRole; active?: boolean; }

// PATCH /admin/users/:id
interface AdminUpdateUserDto { suspended?: boolean; emailVerified?: boolean; }

// PATCH /admin/content/:id
interface AdminTakedownDto { status: 'draft' | 'archived'; }

// POST /admin/plans
interface CreatePlanDto {
  key: string; name: string; description?: string;
  priceMonthly?: number; priceYearly?: number; // cents — required for paid plans (key !== 'free')
  limits?: Record<string, number | null>; features?: Record<string, unknown>;
}
// PATCH /admin/plans/:id  — prices are read-only after create (Stripe owns them)
interface UpdatePlanDto {
  name?: string; description?: string;
  active?: boolean;
  limits?: Record<string, number | null>; features?: Record<string, unknown>;
}
// PUT /admin/workspaces/:id/plan
interface AssignPlanDto {
  planKey: string;
  status?: 'active'|'trialing'|'past_due'|'canceled'|'paused'|'incomplete';
  overrides?: Record<string, number | null>;
}
```

---

## Deltas from the original frontend.md (call these out to the agent)

- **Roles are `admin` / `moderator` / `member`** (not the earlier draft set).
  Build nav + action gating on these. `member` = read-only everywhere.
- **Plans carry `limits` + `features` (open objects) + billing columns.** The Plans
  editor and the Workspace→Plan assignment use `PlanView` / `AssignPlanDto` above.
  Prices are in **cents**.
- **Login is single-step** (no TOTP yet) — don't build the MFA step; the `me`
  response has no `mfaRequired`.
- **Workspace plan assignment** lives on the workspace detail screen
  (`PUT /admin/workspaces/:id/plan`). There is no workspace-suspend endpoint yet
  (moderation is at the **user** level via `PATCH /admin/users/:id { suspended }`).
- **Media usage** is a separate endpoint (`/admin/media/usage`) returning an array,
  not part of the media list.
- Everything else in [frontend.md](./frontend.md) (stack, screens, design system)
  still applies.

---

## Not yet on the backend (don't build UI for these yet)

CORS allowlist (SPA still works via reflected origin) · TOTP/MFA · IP allowlist ·
metrics/usage caching · workspace-level suspend · tenant-side audit log. See
[backend.md §10](./backend.md).
