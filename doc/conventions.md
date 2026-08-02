Conventions

## Response envelope

Applied at the gateway by `ResponseInterceptor` (success) and `AllExceptionsFilter` (errors).

```jsonc
// success
{ "success": true, "data": { /* payload */ } }

// error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "statusCode": 422 } }
```

Downstream services throw structured errors via `RpcException` carrying `{ code, message, statusCode }` (helper `rpcError(key, message)`); the gateway filter detects that shape and maps it straight to the envelope. Validation (`ValidationPipe`, configured `errorHttpStatusCode: 422`) and thrown `HttpException`s are also mapped.

## Error codes

Defined in `@wriven/contracts` (`errors.ts`):

| Code | Status | Meaning |
|------|--------|---------|
| `UNAUTHORIZED` | 401 | Missing/invalid access token |
| `FORBIDDEN` | 403 | Valid token, not permitted (e.g. not a workspace member) |
| `NOT_FOUND` | 404 | Resource doesn't exist (in scope) |
| `CONFLICT` | 409 | Duplicate (apiId, slug) |
| `VALIDATION_ERROR` | 422 | Body/field validation failed |
| `INVALID_CREDENTIALS` | 401 | Login failed (generic) |
| `EMAIL_ALREADY_EXISTS` | 409 | Register with existing email |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh expired/revoked/reused |
| `INVALID_RESET_TOKEN` | 400 | Reset token bad/expired/used |
| `INVALID_VERIFICATION_TOKEN` | 400 | Verify token bad/expired/used |
| `OAUTH_FAILED` | 400 | Google exchange failed |
| `RATE_LIMITED` | 429 | Too many requests. Also returned by the Delivery API when a workspace exceeds its monthly `apiRequestsPerMonth` quota and `USAGE_ENFORCE=true` (soft, fail-open usage metering — specs/14) |
| `PLAN_LIMIT_REACHED` | 403 | Quota exceeded (projects/members/entries/…) |
| `STRIPE_WEBHOOK_INVALID` | 400 | Stripe webhook signature verification failed |
| `SUBSCRIPTION_EXISTS` | 409 | Workspace already has a live subscription — use the Billing Portal |
| `INTERNAL_ERROR` | 500 | Unhandled |

Never leak stack traces, internal service names, or DB errors to the client.

## Rate limits

`@nestjs/throttler` on the gateway. Global default **100 req/min/IP**; tighter per route:

| Route | Limit |
|-------|-------|
| `POST /auth/register` | 5/min |
| `POST /auth/login` | 10/min |
| `POST /auth/forgot-password` | 3/min |
| `POST /auth/reset-password` | 5/min |
| `POST /auth/verify-email` | 10/min |
| `POST /auth/resend-verification` | 3/min |

## Pagination

List endpoints accept `?page=1&limit=20` (default 20, max 100). Response: `{ items, page, limit, total }`.

## Message patterns (TCP)

Dot-namespaced constants in `@wriven/contracts` (`messages.ts`), never hardcoded:
`AUTH_PATTERNS` (`auth.*`), `WORKSPACE_PATTERNS` / `PROJECT_PATTERNS` (`auth.*`), `CORE_PATTERNS` (`core.*`), `INVITATION_PATTERNS` (`auth.invitation.*`), `BILLING_PATTERNS` (`auth.billing.*`), `ADMIN_PATTERNS` (`admin.*`), `SERVICE_TOKENS` (DI tokens for the gateway's TCP clients).

## Shared contracts (`@wriven/contracts`)

Single source of truth consumed by all services (and the frontend):
- `dto/` — request DTOs with class-validator decorators (`auth.dto.ts`, `cms.dto.ts`).
- `types/` — response views & shared types (`auth.types.ts`, `cms.types.ts`).
- `messages.ts` — TCP patterns + service tokens. `errors.ts` — error codes.

> Decorated DTO properties referencing a type-only import must use `import type` (isolatedModules + emitDecoratorMetadata).

## Environment strategy

- **Per-service `.env`**, never shared. `.env` is git-ignored; `.env.example` is committed with placeholders.
- `JWT_SECRET` must be **identical** across auth-service and api-gateway (gateway validates locally).
- DB-owning services use `DATABASE_URL` (runtime) + `DIRECT_URL` (migrations) — see [Database](./database.md).
- Google OAuth creds live on the **gateway**. SMTP creds on **auth-service**.
- **Stripe:** `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` on **auth-service** (the gateway only forwards the raw body + signature; auth-service verifies + reconciles). `STRIPE_MANAGED_PAYMENTS=true` opts back into Managed Payments (off by default — needs product tax_codes + Stripe Tax provisioned). `BILLING_GRACE_DAYS` (default 7) = past_due grace before limits revert to free.

## Commands

```bash
# dev
pnpm dev:gateway | dev:auth | dev:core | dev:client | dev:all

# build / quality
pnpm build              # nx run-many -t build
pnpm lint               # nx run-many -t lint
pnpm nx typecheck <project>

# database (Drizzle)
pnpm db:auth:generate | db:auth:migrate | db:auth:push | db:auth:studio
pnpm db:core:generate | db:core:migrate | db:core:push | db:core:studio

# billing — replay Stripe events through the same idempotent webhook handler
pnpm billing:replay [since]   # ISO timestamp, or N = last N hours; omitted = all
```

Running a built service directly (used for smoke tests): `node apps/<svc>/dist/main.js` from repo root (loads that service's `.env`).

## Git / commits

- **One-line Conventional Commit** subjects, no body unless essential (`feat: …`, `fix: …`, `refactor: …`, `chore: …`).
- Keep **frontend (`apps/client`) and backend** changes in **separate commits**; stage selectively rather than `git add -A` when both are dirty.

## Nx notes

- Workspace out-of-sync (tsconfig project references) auto-applies (`sync.applyChanges: true` in `nx.json`).
- App `tsconfig.app.json` files omit `rootDir` so lib source (TS-solution + custom export conditions) compiles cleanly under webpack.
- New cross-package imports require the dep in the app's `package.json` (`workspace:*`) + `pnpm install` to create the symlink.
