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
| `INVALID_VERIFICATION_CODE` | 400 | 6-digit OTP email code bad/expired/too many attempts |
| `OAUTH_FAILED` | 400 | Google exchange failed |
| `RATE_LIMITED` | 429 | Too many requests. Also returned by the Delivery API when a workspace exceeds its monthly `apiRequestsPerMonth` quota and `USAGE_ENFORCE=true` (soft, fail-open usage metering — specs/14) |
| `PLAN_LIMIT_REACHED` | 403 | Quota exceeded (projects/members/entries/AI text requests/…) |
| `STRIPE_WEBHOOK_INVALID` | 400 | Stripe webhook signature verification failed |
| `SUBSCRIPTION_EXISTS` | 409 | Workspace already has a live subscription — use `/billing/swap` or the Portal to change plans |
| `SUBSCRIPTION_NOT_FOUND` | 404 | No active subscription to swap — use `/billing/checkout` to subscribe first |
| `DOWNGRADE_BLOCKED` | 409 | Downgrade screened by the gateway — workspace exceeds the target plan's stock-resource limits (specs/18) |
| `STRIPE_SYNC_FAILED` | 500 | Admin plan ↔ Stripe product/price sync failed |
| `AI_GENERATION_FAILED` | 502 | Provider/repair failure on a generation (incl. `select`/`compose` repair-miss) |
| `AI_NOT_CONFIGURED` | 503 | `AI_API_KEY` missing in ai-service |
| `AI_QUOTA_UNAVAILABLE` | 503 | Entitlement service unreachable — quota check fails closed |
| `AI_INPUT_TOO_LARGE` | 422 | Prompt/context exceeds budget |
| `AI_GENERATION_IN_PROGRESS` | 409 | Same idempotency key still running |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Key reused with a different request hash |
| `AI_RESULT_EXPIRED` | 410 | Stored success result redacted by retention — start a new generation |
| `GATEWAY_TIMEOUT` | 504 | Downstream call exceeded the gateway timeout budget |
| `INTERNAL_ERROR` | 500 | Unhandled |

Never leak stack traces, internal service names, or DB errors to the client.

## Rate limits

`@nestjs/throttler` on the gateway. Global default **100 req/min/client-IP**; tighter per
route. The global guard is `ProxyAwareThrottlerGuard` — it tracks the **real client
IP** through the proxy chain (`CF-Connecting-IP` → first `X-Forwarded-For` hop →
socket IP; `trust proxy: 1`), not the load-balancer IP:

| Route | Limit |
|-------|-------|
| `POST /auth/register` | 5/min |
| `POST /auth/login` | 10/min |
| `POST /auth/forgot-password` | 3/min |
| `POST /auth/reset-password` | 5/min |
| `POST /auth/verify-email` | 10/min |
| `POST /auth/verify-email-code` | 10/min |
| `POST /auth/resend-verification` | 3/min |
| `POST /admin/auth/login` | 10/min |
| `POST /content/ai/generate` | ~10/min per workspace (burst guard, specs/21) |

## Pagination

List endpoints accept `?page=1&limit=20` (default 20, max 100). Response: `{ items, page, limit, total }`.

## Message patterns (TCP)

Dot-namespaced constants in `@wriven/contracts` (`messages.ts`), never hardcoded:
`AUTH_PATTERNS` (`auth.*`), `WORKSPACE_PATTERNS` / `PROJECT_PATTERNS` (`auth.*`), `CORE_PATTERNS` (`core.*`), `INVITATION_PATTERNS` (`auth.invitation.*`), `BILLING_PATTERNS` (`auth.billing.*`), `USAGE_PATTERNS` (`core.usage.*` — metering + stats; `WORKSPACE_STATS`/`PROJECT_STATS` fan out from `GET /stats/*`), `AI_PATTERNS` (`core.ai.generate`, `core.ai.profile.read/update`), `ADMIN_PATTERNS` (`admin.*`), `SERVICE_TOKENS` (DI tokens for the gateway's TCP clients). `WORKSPACE_PATTERNS.STATS` (`auth.workspace.stats`) returns tenancy counts (projects + members) merged into `/stats/workspace` at the gateway.

## Shared contracts (`@wriven/contracts`)

Single source of truth consumed by all services (and the frontend):
- `dto/` — request DTOs with class-validator decorators (12 files: `admin`, `ai`, `api-key`, `auth`, `billing`, `cms`, `invitation`, `member`, `project`, `support`, `webhook`, `workspace`).
- `types/` — response views & shared types (12 files incl. `rbac.types.ts`, `stats.types.ts`, `usage` views).
- `messages.ts` — TCP patterns + service tokens. `errors.ts` — error codes. `rbac.ts` — pure-TS permission cascade subpath (frontend-consumable).

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
pnpm dev:gateway | dev:auth | dev:core | dev:ai | dev:client | dev:all

# build / quality
pnpm build              # nx run-many -t build
pnpm lint               # nx run-many -t lint
pnpm nx typecheck <project>

# database (Drizzle)
pnpm db:auth:generate | db:auth:migrate | db:auth:push | db:auth:studio
pnpm db:core:generate | db:core:migrate | db:core:push | db:core:studio
pnpm db:auth:seed       # bootstrap admin only (plans are NOT seeded — admin-panel managed)

# billing — replay Stripe events through the same idempotent webhook handler
pnpm billing:replay [since]   # ISO timestamp, or N = last N hours; omitted = all

# delivery SDK packages (packages/* — @wriven-ai/*)
pnpm sdk:build | sdk:test | sdk:check | sdk:publish
```

Running a built service directly (used for smoke tests): `node apps/<svc>/dist/main.js` from repo root (loads that service's `.env`).

## Git / commits

- **One-line Conventional Commit** subjects, no body unless essential (`feat: …`, `fix: …`, `refactor: …`, `chore: …`).
- Keep **frontend (`apps/client`) and backend** changes in **separate commits**; stage selectively rather than `git add -A` when both are dirty.

## Code comments

- **Why, not what.** A comment earns its line by explaining a decision, a pitfall, or behavior the code can't express. Never narrate what the next lines obviously do (no numbered `// 1.` step comments).
- **Short by default** — 1-3 lines. Longer (up to ~5) is fine for a real mechanism (concurrency, Stripe quirks, fail-open/fail-closed policy) as long as every line carries information: cut repetition, not reasoning.
- **File headers** — none by default; the filename usually says it. 1-2 lines only when the file holds a non-obvious constraint. No multi-paragraph essays. Exception: Python module docstrings are idiomatic — keep them.
- **Doc comments on shared contracts and published SDK types stay** — they surface in IDE hover for every consumer. Keep them semantic: units, null meaning, who produces the field.
- **No spec/plan citations in code.** Comments are self-contained — never `see specs/14` / `(specs/18)` / `plans/02`. State the constraint itself instead. Pointing at `doc/` reference docs is fine.
- **Always keep**: bug post-mortems (what failed, why the fix), security rationale, cross-service sync notes ("mirrored in X — keep in sync"), upstream-version quirks (e.g. stripe@22 field moves).

## Nx notes

- Workspace out-of-sync (tsconfig project references) auto-applies (`sync.applyChanges: true` in `nx.json`).
- App `tsconfig.app.json` files omit `rootDir` so lib source (TS-solution + custom export conditions) compiles cleanly under webpack.
- New cross-package imports require the dep in the app's `package.json` (`workspace:*`) + `pnpm install` to create the symlink.
