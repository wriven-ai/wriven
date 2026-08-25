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

## Phase 3 — Integration tests (pending)

**Goal:** prove persistence + wiring claims the mocks can't see. Testcontainers Postgres, real service boot, real migrations (`drizzle-kit push`), no live Stripe/R2 (stripe-mock container or recorded fixtures; MinIO for S3-compatible).

Priority seams, highest first:

1. **billing `swapPlan`** — tx rollback when Stripe call fails mid-swap; `pendingChange` two-phase schedule state
2. **invitation `accept`** — `onConflictDoUpdate` + `setWhere: role='guest'` upsert under real unique constraints
3. **quota asserts** — advisory lock actually serializes concurrent seat claims (TOCTOU)
4. **webhook reconciler** — `stripeEvents` idempotency via real unique index; stale-guard with real timestamps
5. **cleanup cron** — `lt(expiresAt, now)` deletes exactly expired rows

Setup decisions pending: testcontainers vs docker-compose dev DB, per-suite schema isolation (`create schema` per run), CI job shape (separate workflow or same).

## Out of scope / deferred

- E2E journeys (login → create → publish) — few, lowest priority
- ai-service pytest depth (provider orchestration)
- Client/SDK UI tests
- Controllers, benchmarks/load tests
