# API Gateway

The only internet-facing service (HTTP `:5000`). Owns **no database tables and no business logic** — it authenticates, authorizes, rate-limits, shapes responses, and forwards to internal services over TCP. Full request lifecycle: [Architecture](../architecture.md).

## Responsibilities

| Concern | Mechanism |
|---------|-----------|
| Routing | NestJS controllers → `ClientProxy.send(pattern, payload)` over TCP to auth/core |
| AuthN | `JwtAuthGuard` — validates the access token locally (`JWT_SECRET`), sets `req.user` |
| Workspace authZ | `WorkspaceGuard` — validates `X-Workspace-Id` membership via `auth.validateWorkspaceMember`, sets `req.workspaceId` |
| Rate limiting | `@nestjs/throttler` — global 100/min + tighter per-route (see [Conventions](../conventions.md)) |
| Response shape | `ResponseInterceptor` (success envelope) + `AllExceptionsFilter` (error envelope) |
| CORS | credentials enabled, origin from `CLIENT_ORIGIN` |
| Google OAuth | Passport `google` strategy runs here (auth-service has no public HTTP) |
| Raw body | `NestFactory.create(AppModule, { rawBody: true })` — exposes `req.rawBody` for Stripe webhook signature verification (parsed `req.body` still populated for all other routes) |
| Identity injection | injects `userId` / `workspaceId` into every downstream TCP payload |

## Decorators

- `@CurrentUser()` → `AuthUser { userId, email }` (from `JwtAuthGuard`).
- `@CurrentWorkspace()` → validated `workspaceId` string (from `WorkspaceGuard`).
- `@CurrentWorkspaceRole()` → caller's workspace role (`owner`|`admin`|`member`|`guest`, from `WorkspaceGuard`); forwarded to auth-service for billing mutation gating.

## Controllers

| Controller | Routes |
|------------|--------|
| `AuthController` | `/auth/*` — register, login, refresh, logout, forgot/reset, verify, resend, me, orgs, workspaces, google, google/callback |
| `ContentController` | `/content/*` — content types & entries (JWT + WorkspaceGuard) |
| `OrgsController` | `/orgs/:orgId/members` (JWT) — see [members-api.md](../auth-service/members-api.md) |
| `WorkspacesController` | `/workspaces/:workspaceId/members` (JWT) |
| `BillingController` | `/billing/*` — plans, subscription, checkout, portal (JWT + WorkspaceGuard; checkout/portal forward `workspaceRole`) |
| `StripeWebhookController` | `POST /webhooks/stripe` — **public** (no JWT; CSRF short-circuits with no access cookie, `@SkipThrottle`); forwards raw body + `stripe-signature` to auth-service, which verifies + reconciles. Bad signature → 400 `STRIPE_WEBHOOK_INVALID`; downstream failure → 500 (Stripe retries) |

## Environment

```
PORT=5000
CLIENT_ORIGIN=http://localhost:3000
JWT_SECRET=...                # same as auth-service
AUTH_SERVICE_HOST/PORT=...    # TCP target (5001)
CORE_SERVICE_HOST/PORT=...    # TCP target (5002)
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_CALLBACK_URL
# No STRIPE_WEBHOOK_SECRET here — the gateway only forwards the raw body +
# stripe-signature header; auth-service verifies + reconciles.
```

Every endpoint with method/body/response: [API Reference](../api-reference.md).
