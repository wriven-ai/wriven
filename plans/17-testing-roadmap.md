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

**Branch:** `feat/testing-auth-depth` · **Commit:** `2490465` (+ `e148ad0` docs)

- 13 new spec files, +121 tests → auth-service at 343: invitations, members, projects, workspaces, cleanup cron, mail, workspace-logs, admin (auth/token/users/audit/metrics/tenancy)
- Review-hardened: WHERE scopes pinned via `serializeFragment` (invite revoke by id, admin theft-response revoke-all, retention cutoffs)
- `doc/testing.md` written and indexed

**Unit scope is now complete.** Remaining untested: controllers only (thin `@MessagePattern` delegators — not worth unit specs).

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
