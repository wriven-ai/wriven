# Testing

How the Wriven backend is tested: philosophy, layout, the shared mock toolkit, recurring patterns, and what is deliberately **not** covered.

## Philosophy

- **Unit suites, fully mocked** — no DB, Stripe, R2, or network in unit tests. Services are constructed directly (`new Service(deps)`) with mock dependencies; no `Test.createTestingModule` ceremony for pure constructor-injection services.
- **Specs live next to the code** (`foo.service.ts` + `foo.service.spec.ts`) — the Angular/Nx convention. Shared helpers live in each app's `src/testing/` (never matched by testMatch, excluded from the app tsconfig).
- **Assert behavior, not builder args** — drizzle query-builder fragments (`eq`/`and`/`lt`/`sql`) are treated as opaque: specs assert *which table* was touched, call counts/order, and resolved values. Where the WHERE scope is security-relevant (revoke-by-id, retention cutoff, token-hash lookup), it is pinned via `serializeFragment()` (below) instead of trusted.
- **Error contracts** — thrown `RpcException`s are unwrapped (`err.getError()`) and matched against `ERROR_CODES.X` from `@wriven/contracts`; messages asserted by substring only.
- **Integration tests are deferred** (Phase 3): testcontainers Postgres + TCP e2e across gateway↔auth↔core. Unit mocks cannot catch SQL-shape or wiring regressions — that gap is known and accepted for now.

## What exists

| Project | Suite | Focus |
|---|---|---|
| `@wriven/auth-service` | ~343 tests | Auth flows, billing/webhooks, entitlements, invitations, members/projects/workspaces, cleanup cron, mail, workspace logs, admin (auth/tokens/users/audit/metrics/tenancy/plans) |
| `@wriven/api-gateway` | ~49 tests | All guards (JWT, admin JWT, CSRF, permission, workspace/project), Google OAuth strategy, exceptions filter, response interceptor, downgrade guard |
| `@wriven/core-service` | ~68 tests | Entitlements (fail-open/closed + cache), storage (R2 keys), media quota/key-pinning, webhooks (HMAC, retry), content validator, pricing, period/slug |
| `@wriven/contracts` | ~23 tests | RBAC permission matrix — literal expected sets, independent of the role maps under test |

Other suites, outside the Jest projects: ai-service (**pytest**, `cd apps/ai-service && uv run pytest`), `packages/*` SDKs (**node:test** via tsx).

## Running

```bash
pnpm nx test @wriven/auth-service                          # one project
pnpm nx test @wriven/auth-service -- --testPathPatterns invitations   # one file
pnpm nx run-many -t lint typecheck test                    # whole workspace
pnpm nx affected -t lint typecheck test                    # changed code only
```

CI (`.github/workflows/ci.yml`) runs the affected sweep on PRs and pushes to `main`/`dev`, plus a full test sweep on `main`. No secrets needed — suites are fully mocked.

## Jest setup (per project)

`api-gateway`, `auth-service`, `core-service`, and `libs/shared/contracts` each have `jest.config.cts` + `tsconfig.spec.json` (ts-jest, node env; apps add a `reflect-metadata` setupFile).

**The one trap**: spec tsconfigs must keep the inherited `module/moduleResolution: nodenext`. Overriding to `node10` breaks the workspace `customConditions` (TS5098) and degrades stripe/postgres typings. `tsconfig.app.json` excludes `**/*.spec.ts` **and** `src/testing/**` (helpers use jest globals the app build lacks).

## Mock toolkit — `apps/<service>/src/testing/`

| Helper | Purpose |
|---|---|
| `createDbMock()` | Drizzle stand-in: `insert/update/delete/select/execute/$count`, per-table `query.<t>.findFirst/findMany`, plus `transaction(cb)` that invokes `cb` with a separate `__tx` surface and propagates rejections (rollback) |
| `chain(rows)` | Awaitable Proxy over a builder chain; `.returning()` resolves `rows`; unknown methods chain |
| `chainOf(mock, call=0)` | The chain from the `call`-th write — assert `.values(...)`/`.set(...)` args via `toHaveBeenCalledWith` |
| `serializeFragment(sql)` | JSON-serializes a drizzle where-fragment (circular table refs cut) so **bound params** become assertable — used to pin WHERE scopes |
| `configStub(map)` | `ConfigService` stand-in: `get(key, default)` |
| `setEnv(vars) → restore()` | Temp process.env with cleanup |
| `fixtures.ts` (auth only) | `userRow`, `workspaceRow`, `planRow`, `subRow`, `stripeSub` builders |
| `stripe-mock.ts` (auth only) | Typed Stripe mock (`asStripe()` cast) |

Gateway/core have their own small `testing/` folders (`httpContext`, `httpHost`, `serviceErrorThrown` on the gateway).

## Recurring patterns

- **`jest.mock('bcrypt', factory)` is mandatory** wherever a service with the anti-enumeration `dummyHash` class field is instantiated (`auth.service.ts`, `admin-auth.service.ts`). bcrypt's overloaded types collapse under `jest.mocked` — cast instead: `bcrypt.hash as unknown as jest.Mock`.
- **Routing multi-purpose `findFirst` mocks by `columns`** — one query method serves by-email and by-name lookups; route on the requested `columns` shape (see `routeUsers` in `invitations.service.spec.ts`).
- **Fake timers only for clock boundaries** (TTL expiry, cache TTL, retention cutoff) — `setSystemTime()` + `useRealTimers()` in `afterEach`. `jest.restoreAllMocks()` file-wide when spying `global.fetch`.
- **Date fixtures**: any `Date` compared against the real clock must be far-future/past (e.g. `2030`), never "a few months out" — specs rot otherwise. Prefer pinning the clock and asserting exact ISO cutoffs via `serializeFragment`.
- **Real `JwtService` round-trips** for token specs: sign with the service, verify with an independent instance over the same secret (see `admin-token.service.spec.ts`, gateway `admin-jwt.guard.spec.ts`).
- **HMAC recomputation** — webhook signatures verified by recomputing `createHmac('sha256', secret).update(\`${firedAt}.${body}\`)`, never by trusting the code under test.
- **Cache-aware mocks** — services with a TTL cache (core `CoreEntitlementsService`, 30s) need distinct workspace IDs per sub-call in one test, or the cache swallows the second fetch.

## Not covered (known gaps)

- Controllers (`@MessagePattern` thin delegators) — no logic to test.
- Concurrency/TOCTOU beyond the advisory-lock call assertions.
- Real SQL behavior (constraint names, upsert semantics, `onConflict` clauses) — mock-level only. Phase 3 integration tests close this.
- ai-service provider orchestration depth; client/SDK UI tests.
