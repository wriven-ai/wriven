# Testing

How the Wriven backend is tested: philosophy, layout, the shared mock toolkit, recurring patterns, and what is deliberately **not** covered.

## Philosophy

- **Unit suites, fully mocked** — no DB, Stripe, R2, or network in unit tests. Services are constructed directly (`new Service(deps)`) with mock dependencies; no `Test.createTestingModule` ceremony for pure constructor-injection services.
- **Specs live next to the code** (`foo.service.ts` + `foo.service.spec.ts`) — the Angular/Nx convention. Shared helpers live in each app's `src/testing/` (never matched by testMatch, excluded from the app tsconfig).
- **Assert behavior, not builder args** — drizzle query-builder fragments (`eq`/`and`/`lt`/`sql`) are treated as opaque: specs assert *which table* was touched, call counts/order, and resolved values. Where the WHERE scope is security-relevant (revoke-by-id, retention cutoff, token-hash lookup), it is pinned via `serializeFragment()` (below) instead of trusted.
- **Error contracts** — thrown `RpcException`s are unwrapped (`err.getError()`) and matched against `ERROR_CODES.X` from `@wriven/contracts`; messages asserted by substring only.
- **Integration tests** exist for auth-service and core-service (see the section below): testcontainers Postgres with the real migrations, Stripe mocked at the client seam. Still uncovered: gateway↔auth↔core TCP e2e journeys.

## What exists

| Project | Suite | Focus |
|---|---|---|
| `@wriven/auth-service` | ~352 tests | Auth flows, billing/webhooks, entitlements, invitations, members/projects/workspaces, cleanup cron, mail, workspace logs, admin (auth/tokens/users/audit/metrics/tenancy/plans), module bootstrap smoke |
| `@wriven/api-gateway` | ~138 tests | All guards (JWT, admin JWT, CSRF, permission, workspace/project, API key + cache, throttler), Google OAuth strategy, exceptions filter, response interceptor, downgrade guard, auth/AI controllers, audit interceptors, usage buffer/enforce, delivery controller (cache tags, project pinning), module bootstrap smoke |
| `@wriven/core-service` | ~197 tests | Entitlements (fail-open/closed + cache), storage (R2 keys), media quota/key-pinning, webhooks (HMAC, retry + timeout), content validator, pricing, period/slug, entries lifecycle + AI provenance, ai.service (quota, idempotent replay), ai-client, api-keys, usage, support, admin read-models (media/metrics/project-usage/webhooks/content-types), module bootstrap smoke |
| `@wriven/contracts` | ~23 tests | RBAC permission matrix — literal expected sets, independent of the role maps under test |

Other suites, outside the Jest projects: ai-service (**pytest**, `cd apps/ai-service && uv run pytest`), `packages/*` SDKs (**node:test** via tsx).

## Running

```bash
pnpm nx test @wriven/auth-service                          # one project
pnpm nx test @wriven/auth-service -- --testPathPatterns invitations   # one file
pnpm nx run-many -t lint typecheck test                    # whole workspace
pnpm nx affected -t lint typecheck test                    # changed code only
```

CI (`.github/workflows/ci.yml`) runs the affected `lint typecheck test build` sweep on PRs and pushes to `main`/`dev`, a full test sweep on `main`, and a separate always-on `integration` job (testcontainers, Docker on the runner). The unit sweep also runs ai-service's pytest via its nx `test` target. No secrets needed.

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

## Integration tests (Phase 3 — auth, Phase 4 started — core)

`apps/auth-service/test/integration/` and `apps/core-service/test/integration/` — **real Postgres via testcontainers** (one ephemeral `postgres:16-alpine` container per spec file, the service's REAL migrations from `src/db/migrations`, `truncate()` between tests). Docker required; never touches dev/prod DBs.

```bash
pnpm nx test-integration @wriven/auth-service   # docker must be running
pnpm nx test-integration @wriven/core-service
```

- Separate `jest.integ.config.cts` + `tsconfig.integration.json` per app; each unit suite excludes `test/` and stays docker-free. Targets are `cache: false` (docker side effects).
- auth-service seams covered: invitation `accept` (upsert/`setWhere` guest-upgrade, no-downgrade, FK constraints, quota throw → real tx rollback with the invitation left pending), billing `swapPlan` (deferred downgrade pendingChange from the Stripe item period, upgrade mirror, Stripe-failure → no partial DB write, reactivation, free cancel), **seat-quota advisory lock** (parallel claims on the last seat serialize — exactly one wins, loser rolls back), **webhook reconciler** (event-id re-delivery is a true no-op via the real unique index, strictly-older events skip state writes but dedupe, same-second applies, unmapped price → tx rollback of the idempotency insert), **cleanup cron** (exact expired-set deletes; revoked-but-unexpired refresh tokens kept for theft detection; retention window honored with the 90d default).
- core-service seams covered (Phase 4 start): **usage upsert** (repeat flushes accumulate through the real `(workspace, period)` unique index — never overwrite; period + workspace isolation; `read()` composition), **revision pruning** (the raw cap-bound DELETE keeps only the newest `cap` revisions of THIS entry — the other entry's history untouched), **delivery reads** (JSONB equality filters, published-only visibility vs preview, draft-slug NOT_FOUND, cross-project tenant isolation).
- Helpers: `test-db.ts` per app (`startTestDb()` → container/db/truncate/stop). Core's pre-creates a stub `auth_svc.projects` — migration 0003 backfills `project_id` from it (in prod the auth schema exists on the shared DB; in a core-only container it must be stubbed).
- Still uncovered: gateway↔auth↔core TCP e2e journeys.

## Adding a new module — checklist

Every new service/guard/interceptor follows the same bar:

1. **Spec lives next to the code** (`foo.service.ts` + `foo.service.spec.ts`), built around a `makeService()` factory that does `new Service(deps)` with mocks. No `Test.createTestingModule` for pure constructor-injection services — only the module smoke uses it.
2. **Reuse `src/testing/` helpers** (`createDbMock`, `chain`/`writeChain`, `chainOf`, `serializeFragment`, `configStub`, `setEnv`). Extend them; don't invent local one-off mocks.
3. **Coverage bar per unit**: the happy path, every distinct error the code throws (unwrapped `RpcException` vs `ERROR_CODES.X`), and any clock/boundary condition (fake timers + `useRealTimers()` in `afterEach`; date fixtures far-future/past, never "a few months out").
4. **Writes use `writeChain`** and are asserted via `chainOf(...).values/.set` — a dropped `.returning()` must fail the spec. **Security-relevant WHERE scopes are pinned** with `serializeFragment` (revoke-by-id, retention cutoffs, quota predicates) — never trusted.
5. **Never trust the code under test for crypto** — recompute hashes/HMACs/sha256 token digests from the presented input and compare.
6. **Wiring is already covered** — a new provider registered in `AppModule` is exercised by the `app.module.spec.ts` bootstrap smoke automatically.
7. **Persistence claims** (unique constraints, upserts, tx rollback, advisory locks) get an **integration spec** in `apps/auth-service/test/integration/` (or the core equivalent when it exists) — unit mocks cannot catch SQL-shape regressions.
8. **Gateway routes**: controllers are skipped when they purely delegate; guards, cookie/CSRF handling, payload shaping, and envelope mapping DO get specs.
9. **Python side**: new ai-service behavior gets pytest under `apps/ai-service/tests/` (runs through the same nx `test` target).
10. **Before pushing**: `pnpm nx test <project>` green + `pnpm nx run-many -t lint typecheck -p <project>`. CI's affected sweep handles the rest.

## Not covered (known gaps)

- Controllers (`@MessagePattern` thin delegators) — no logic to test.
- Concurrency/TOCTOU beyond the proven seat-quota advisory lock (other write paths assume serialized access by design).
- ai-service provider orchestration depth; client/SDK UI tests.
