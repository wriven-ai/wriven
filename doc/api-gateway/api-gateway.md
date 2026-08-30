# API Gateway

The only internet-facing service (HTTP `:5000`). Owns **no database tables and no business logic** — it authenticates, authorizes, rate-limits, shapes responses, and forwards to internal services (TCP to auth/core, one HTTP hop to ai-service for the health ping). Full request lifecycle: [Architecture](../architecture.md).

## Responsibilities

| Concern | Mechanism |
|---------|-----------|
| Routing | NestJS controllers → `ClientProxy.send(pattern, payload)` over TCP to auth/core |
| AuthN | `JwtAuthGuard` — validates the **httpOnly `access_token` cookie** locally (`JWT_SECRET`), sets `req.user` (no Bearer header parsing) |
| Workspace authZ | `WorkspaceGuard` — validates `X-Workspace-Id` membership via `auth.validateWorkspaceMember`, sets `req.workspaceId` + cascade-resolved `workspacePermissions` |
| Project authZ | `ProjectGuard` — validates `X-Project-Id` membership via `auth.validateProjectMember`, sets `projectPermissions` |
| Tenant RBAC edge | `PermissionGuard` (`@RequirePermission`) — permission-catalog checks on content/media/api-keys/webhooks/billing routes (specs/12) |
| Rate limiting | `@nestjs/throttler` — global 100/min + tighter per-route, keyed on the **real client IP** via `ProxyAwareThrottlerGuard` (`CF-Connecting-IP` → XFF → socket; `trust proxy: 1`) (see [Conventions](../conventions.md)) |
| Response shape | `ResponseInterceptor` (success envelope) + `AllExceptionsFilter` (error envelope) |
| CSRF | global `CsrfGuard` — double-submit check for cookie-authenticated mutations: `X-CSRF-Token` header (SPA-held value from auth/me response bodies) must equal the httpOnly `csrf_token` cookie; pre-auth routes are exempt |
| CORS | **two policies** (decision extracted to `common/cors-policy.ts`, spec'd): the public Delivery API (`/v1/projects/:projectId/content|media/*`) **reflects any origin with credentials off** (Bearer-key reads only — Contentful CDA model, customer apps fetch browser-side); everything else is an exact-origin allowlist `CORS_ORIGINS` with credentials (dev `localhost:3000,3001`; prod wriven.tech + www + admin.wriven.tech + www.admin.wriven.tech) — including the project-scoped management routes (`/v1/projects/:projectId`, `.../members`, `.../invitations`) that share the delivery prefix. No-Origin requests (curl, server-to-server) pass untouched |
| Google OAuth | Passport `google` strategy runs here (auth-service has no public HTTP) |
| Raw body | `NestFactory.create(AppModule, { rawBody: true })` — exposes `req.rawBody` for Stripe webhook signature verification (parsed `req.body` still populated for all other routes) |
| Usage metering | in-process Delivery API counter buffered at the gateway, flushed in batches to `core.usage.record`; soft overage gate `USAGE_ENFORCE` (default off) (specs/14) |
| Identity injection | injects `userId` / `workspaceId` into every downstream TCP payload |

## Decorators

- `@CurrentUser()` → `AuthUser { userId, email }` (from `JwtAuthGuard`).
- `@CurrentWorkspace()` → validated `workspaceId` string (from `WorkspaceGuard`).
- `@CurrentWorkspaceRole()` → caller's workspace role (`owner`|`admin`|`member`|`guest`, from `WorkspaceGuard`); forwarded to auth-service for billing mutation gating.
- `@WorkspaceAudit(action, target?)` → marks a mutating workspace-scoped route for tenant activity logging; `WorkspaceAuditInterceptor` (bound per-controller, like the admin `AuditInterceptor`) writes a `workspace_activity_log` row via TCP after the handler succeeds — fire-and-forget, never fails the request. Workspace/project/target ids resolve from guard context, route params, or the handler result (specs/23).

## Controllers

Feature dirs live under `src/` (admin, api-keys, auth, billing, content, delivery, logs, members, plans, stats, support, usage, users, webhooks + `app/` + `common/`).

| Controller | Routes |
|------------|--------|
| `AppController` | `GET /` (service metadata) + `GET /health` — pings auth + core over TCP and ai-service over HTTP (non-fatal); returns `{ gateway, auth, core, ai }` |
| `AuthController` | `/auth/*` — register, login, refresh, logout, forgot/reset, verify-email, verify-email-code, resend-verification, me, workspaces, google, google/callback |
| `UsersController` | `/users/*` — `PATCH /users/me`, `POST /users/me/avatar-presign` (specs/18) |
| `ProjectsController` | `/projects/*` CRUD (JWT; admin-guarded) |
| `WorkspacesController` | `/workspaces/*` CRUD + `/workspaces/:workspaceId/members` member CRUD (JWT; owner-guarded) |
| `InvitationsController` | `/workspaces/:id/invitations` + `/projects/:id/invitations` CRUD, `DELETE /invitations/:id`, `POST /invitations/:id/resend`, `GET /invitations/token/:token`, `POST /invitations/token/:token/accept` (specs/05) |
| `ContentController` | `/content/*` — content types, entries, revisions, publish (JWT + WorkspaceGuard) |
| `MediaController` | `/content/media/*` — presign, list, delete, **bulk-delete** |
| `AiController` | `/content/ai/*` — generate, profile (voice) read/update |
| `ApiKeysController` | `/api-keys/*` — create/list/regenerate/revoke (incl. `:id/regenerate`) |
| `WebhooksController` | `/webhooks/*` — CRUD + pause |
| `BillingController` | `/billing/*` — plans, subscription, checkout, portal, `GET /billing/invoices`, `POST /billing/swap` (JWT + WorkspaceGuard; checkout/portal/swap forward `workspaceRole`) |
| `PlansController` | public `GET /plans` (plan catalog for the pricing page) |
| `StatsController` | `GET /stats/workspace` + `GET /stats/project` (specs/17) |
| `UsageController` | `GET /usage` (requests/storage vs plan limits + AI text usage; specs/14, 21) |
| `LogsController` | `GET /logs?days=7\|30\|90&page&limit` — workspace activity feed (JWT + WorkspaceGuard + `WORKSPACE_LOGS_VIEW`; specs/23). Mutating routes across ~8 controllers carry `@WorkspaceAudit` and are recorded by the interceptor |
| `SupportController` | `/support/tickets/*` — create/list/detail/messages/patch + attachment presign (see [support-ticket](../support-ticket/)) |
| `DeliveryController` | public Delivery API under `/v1/projects/:projectId/content/...` (API-key auth; excluded from the global `v1` prefix — see [wriven-display](../wriven-display/03-delivery-api.md)) |
| `Admin*Controller` | 15 controllers under `/admin/*` — admin JWT verified locally (`ADMIN_JWT_SECRET`): auth, users, workspaces, projects, content, content-types, media, webhooks, api-keys, plans, admins, audit-log, metrics, support, support/metrics (see [admin-panel](../admin-panel/backend/06-endpoints.md)) |
| `StripeWebhookController` | `POST /webhooks/stripe` — **public** (no JWT; CSRF short-circuits with no access cookie, `@SkipThrottle`); forwards raw body + `stripe-signature` to auth-service, which verifies + reconciles. Bad signature → 400 `STRIPE_WEBHOOK_INVALID`; downstream failure → 500 (Stripe retries) |

## Environment

```
PORT=5000
CLIENT_ORIGIN=http://localhost:3000   # OAuth callback redirect (not CORS)
CORS_ORIGINS=http://localhost:3000,http://localhost:3001   # exact-origin allowlist
JWT_SECRET=...                # same as auth-service
ADMIN_JWT_SECRET=...          # verifies admin JWTs (auth-service signs them)
AUTH_SERVICE_HOST/PORT=...    # TCP target (5001)
CORE_SERVICE_HOST/PORT=...    # TCP target (5002)
AI_SERVICE_URL=...            # HTTP target for the ai-service health ping (:8000)
USAGE_ENFORCE=false           # Delivery API overage gate (default off, specs/14)
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_CALLBACK_URL
# No STRIPE_WEBHOOK_SECRET here — the gateway only forwards the raw body +
# stripe-signature header; auth-service verifies + reconciles.
```

Every endpoint with method/body/response: [API Reference](../api-reference.md).
