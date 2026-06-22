# API Gateway

The only internet-facing service (HTTP `:5000`). Owns **no database tables and no business logic** — it authenticates, authorizes, rate-limits, shapes responses, and forwards to internal services over TCP. Full request lifecycle: [Architecture](../02-architecture.md).

## Responsibilities

| Concern | Mechanism |
|---------|-----------|
| Routing | NestJS controllers → `ClientProxy.send(pattern, payload)` over TCP to auth/core |
| AuthN | `JwtAuthGuard` — validates the access token locally (`JWT_SECRET`), sets `req.user` |
| Workspace authZ | `WorkspaceGuard` — validates `X-Workspace-Id` membership via `auth.validateWorkspaceMember`, sets `req.workspaceId` |
| Rate limiting | `@nestjs/throttler` — global 100/min + tighter per-route (see [Conventions](../07-conventions.md)) |
| Response shape | `ResponseInterceptor` (success envelope) + `AllExceptionsFilter` (error envelope) |
| CORS | credentials enabled, origin from `CLIENT_ORIGIN` |
| Google OAuth | Passport `google` strategy runs here (auth-service has no public HTTP) |
| Identity injection | injects `userId` / `workspaceId` into every downstream TCP payload |

## Decorators

- `@CurrentUser()` → `AuthUser { userId, email }` (from `JwtAuthGuard`).
- `@CurrentWorkspace()` → validated `workspaceId` string (from `WorkspaceGuard`).

## Controllers

| Controller | Routes |
|------------|--------|
| `AuthController` | `/auth/*` — register, login, refresh, logout, forgot/reset, verify, resend, me, orgs, workspaces, google, google/callback |
| `ContentController` | `/content/*` — content types & entries (JWT + WorkspaceGuard) |
| `OrgsController` | `/orgs/:orgId/members` (JWT) — see [members-api.md](../auth-service/members-api.md) |
| `WorkspacesController` | `/workspaces/:workspaceId/members` (JWT) |

## Environment

```
PORT=5000
CLIENT_ORIGIN=http://localhost:3000
JWT_SECRET=...                # same as auth-service
AUTH_SERVICE_HOST/PORT=...    # TCP target (5001)
CORE_SERVICE_HOST/PORT=...    # TCP target (5002)
AI_SERVICE_URL=...            # HTTP (planned)
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_CALLBACK_URL
```

Every endpoint with method/body/response: [API Reference](../06-api-reference.md).
