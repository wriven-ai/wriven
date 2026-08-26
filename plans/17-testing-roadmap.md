# 17 — Testing Roadmap

Execution plan for the backend test effort. Unit layers (Phases 1–2) are **complete**; integration (Phase 3) is pending opt-in.

> No backing spec — this plan captures the agreed testing strategy itself. Reference doc: [`doc/testing.md`](../doc/testing.md).

## Phase 1 — Jest infrastructure + core suites ✅

**Branches:** `feat/testing` (merged via dev) · **Commits:** `b320a68`…`7650c19`

- Per-project Jest: `api-gateway`, `auth-service`, `core-service`, `libs/shared/contracts` (`jest.config.cts` + `tsconfig.spec.json`, ts-jest, nodenext recipe, `reflect-metadata` setupFile)
- `src/testing/` helper layer per app: `createDbMock` / `chain` / `chainOf` / `serializeFragment`, `configStub`, `setEnv`, fixtures, stripe-mock
- Suites: auth (auth flows, billing, webhook reconciler, entitlements, authorization, admin plans, tokens, mail templates, utils) · gateway (all guards, filter, interceptor, downgrade math) · core (entitlements fail-open/closed, storage/media keys, webhooks HMAC, validator, pricing) · contracts (RBAC matrix, literal expected sets)
- CI workflow: affected `lint typecheck test` on PRs + pushes to `main`/`dev`; full test sweep on `main`
- ~362 tests. Spec bugs found and fixed during development: 15+. Service bugs: 0.

## Phase 2 — auth-service depth ✅

**Branch:** `feat/testing-auth-depth` · **Commits:** `2490465`, `55ee77d` (+ `e148ad0`/`6c9c5d3` docs)

- 13 auth spec files, +121 tests → auth-service at 343: invitations, members, projects, workspaces, cleanup cron, mail, workspace-logs, admin (auth/token/users/audit/metrics/tenancy)
- Review-hardened: WHERE scopes pinned via `serializeFragment` (invite revoke by id, admin theft-response revoke-all, retention cutoffs)
- `doc/testing.md` + this roadmap written and indexed

### Phase 2b — gateway/core leftovers ✅ (commit `55ee77d`)

- Gateway +32 tests: api-key guard (bearer extraction, scope gate, 30s hash-keyed cache incl. null-caching), usage buffer (per-bucket aggregation, month-boundary split, threshold = distinct buckets), usage enforce (fail-open, RATE_LIMITED at limit, read cache), delivery controller (project pinning, preview never cached, CDN surrogate tags)
- Core +52 tests: entries lifecycle (publish/unpublish/reslug webhook matrix, revision versioning, unique-field conflicts, AI-provenance forging guards), ai.service (validation-before-metering, quota gate, idempotent replay incl. key-reuse/expired/failed-code classes, provider-failure audit finalize, `:free` cost pricing), api-keys (sha256-only storage verified by recomputation, scope prefixes, rotate/revoke)

**Unit scope is now complete across all services.** Remaining untested: controllers only (thin `@MessagePattern` delegators — not worth unit specs). Totals: auth 343 · gateway 81 · core 120 · contracts 23 = **567 tests**.

## Phase 3 — Integration tests (started)

**Goal:** prove persistence + wiring claims the mocks can't see. Testcontainers Postgres (`@testcontainers/postgresql`, one `postgres:16-alpine` per spec file), REAL migrations from `src/db/migrations`, `truncate()` between tests, Stripe mocked at the client seam. Run: `pnpm nx test-integration @wriven/auth-service` (docker required; `cache: false`; unit suite stays docker-free via `testPathIgnorePatterns`).

**Done (commit `17c2224`, 17 tests):**
- Infrastructure: `test/integration/test-db.ts` helper + smoke spec
- ~~billing `swapPlan`~~ — NOTE: swapPlan is sequential Stripe-then-DB writes (reconciler converges), not one tx. Proven instead: downgrade `pendingChange` from the real Stripe item period, upgrade mirror, **Stripe-failure → no partial DB write**, reactivation, free-cancel mirror
- ~~invitation `accept`~~ — upsert/`setWhere` guest-upgrade under the real unique constraint, no-downgrade of higher roles, FK ordering, **quota throw → real tx rollback (invitation left pending, no seat consumed)**

Priority seams remaining:

~~3. **quota asserts** — DONE: two PARALLEL invitation accepts on the last free seat → the `pg_advisory_xact_lock` serializes them; exactly one seat row lands, the loser rolls back to pending (`quota-lock.integ.spec.ts`)~~
~~4. **webhook reconciler** — DONE: re-delivery of a known event id is a true no-op (real `stripe_events` unique index, row drift preserved), strictly-older events skip the state write but are still deduped, same-second events apply, unmapped price → INTERNAL_ERROR with the idempotency insert ROLLED BACK (`webhook-idempotency.integ.spec.ts`)~~
~~5. **cleanup cron** — DONE: real `lt(expiresAt, now)` deletes exactly the expired set per token table; revoked-but-unexpired refresh tokens KEPT for theft detection; activity logs cut at the retention window, default 90d (`cleanup-cron.integ.spec.ts`)~~

CI: a dedicated `integration` job in `.github/workflows/ci.yml` runs `pnpm nx run-many -t test-integration` on every PR/push (ubuntu runners ship Docker; no extra setup).

**Phase 3 core seams complete — 27 integration tests.** Remaining backlog: replicate the integration harness in core-service if/when a core seam needs it; e2e journeys (lowest priority).

Setup decisions pending: testcontainers vs docker-compose dev DB, per-suite schema isolation (`create schema` per run), CI job shape (separate workflow or same).

## Out of scope / deferred

- E2E journeys (login → create → publish) — few, lowest priority
- ai-service pytest depth (provider orchestration)
- Client/SDK UI tests
- Controllers, benchmarks/load tests
