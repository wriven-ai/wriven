# Wriven — Agent Instructions

**Wriven** is an AI-native headless CMS SaaS. Nx + pnpm monorepo: NestJS microservices behind a single HTTP gateway, a Next.js client, a Python AI service (FastAPI, content generation), and publishable delivery-SDK packages (`packages/*`, `@wriven-ai/*`). Client deploys to Vercel; backend services deploy to Render as Docker containers from [`render.yaml`](./render.yaml) (gateway = public web service at `api.wriven.tech`; auth/core/ai = internal private services). See [`doc/deployment.md`](./doc/deployment.md).

## Source of truth

The maintained reference docs live under **[`doc/`](./doc/)** — start at [`doc/README.md`](./doc/README.md). Read the relevant doc before changing a subsystem:

- Root: [`DOCKER_SETUP.md`](./DOCKER_SETUP.md) (Docker deployment) · [`doc/deployment.md`](./doc/deployment.md) (Render deployment, prod env) · [`apps/ai-service/README.md`](./apps/ai-service/README.md) (uv workflow, health endpoints)
- [`doc/overview`](./doc/overview.md) · [`doc/architecture`](./doc/architecture.md) · [`doc/database`](./doc/database.md)
- [`doc/api-reference`](./doc/api-reference.md) · [`doc/conventions`](./doc/conventions.md) · [`doc/status`](./doc/status.md)
- Cross-cutting: [`doc/ai-governance.md`](./doc/ai-governance.md) (AI data controls, retention, billing/retry policy) · [`doc/plan-config.md`](./doc/plan-config.md) (plan tiers + limits, admin-managed — not seeded) · [`doc/support-ticket/`](./doc/support-ticket/) · [`doc/market-readiness.md`](./doc/market-readiness.md)
- Per service: [`api-gateway`](./doc/api-gateway/) · [`auth-service`](./doc/auth-service/) · [`core-service`](./doc/core-service/) · [`admin-panel`](./doc/admin-panel/) · [`frontend`](./doc/frontend/) (incl. [`sidebar.md`](./doc/frontend/sidebar.md) — dashboard nav architecture)
- Reference: [`doc/diagrams/`](./doc/diagrams/) (system diagrams — RBAC request flow, tenancy model, billing, AI generation flow) · [`doc/wriven-display/`](./doc/wriven-display/) (self-contained guide for building external display apps on the Delivery API — no Wriven source access needed)
- Feature design docs: [`specs/`](./specs/) (every feature gets a spec before implementation, `NN-<slug>.md`)
- Execution plans: [`plans/`](./plans/) (opt-in, large features — derived from a spec via `/create-plan`; plan numbering is independent of spec numbering, e.g. specs/21 ↔ plans/14)

If a doc and the code disagree, **the code wins** — fix the doc.

## Hard rules (non-negotiable)

- **Shared contracts** — DTOs, response types, TCP message patterns, and error codes live in `libs/shared/contracts` (`@wriven/contracts`). Check it before defining anything new; never duplicate a contract inside a service.
- **R2 keys only** — store object **keys** in the DB, never full URLs. Reconstruct URLs at runtime.
- **Microservice boundaries** — don't collapse services:
  - `api-gateway` (HTTP `:5000`) — public edge, validates JWT **locally**, validates workspace/project membership, owns no tables. Also hosts the Google OAuth passport strategy and verifies admin JWTs.
  - `auth-service` (TCP `:5001`) — identity + tenancy (users, workspaces, projects, members, invitations) **and billing** (Stripe subscriptions/webhooks, plans, usage metering — `STRIPE_SECRET_KEY` lives only here; auth also *signs* admin JWTs, gateway verifies them via shared `ADMIN_JWT_SECRET`).
  - `core-service` (TCP `:5002`) — CMS (content types, entries, media, webhooks, delivery API). Enforces plan quotas by calling auth-service over TCP for entitlements/limits — never assume open access when auth is unreachable.
   - `ai-service` (`apps/ai-service`, FastAPI `:8000`, Python + **uv**) — **AI content generation**. Prompt building, temperature, and `select`/`compose` structured-output validation+repair live here; core-service calls it over HTTP behind an `AiClient` seam (the only NestJS↔non-NestJS HTTP call). core keeps the DB-bound work (quota reserve, audit row, per-project AI voice profile, token/cost accounting, field validation); the provider key (`AI_API_KEY`) lives only in ai-service env. All NestJS↔NestJS is TCP. See specs/21.
- **Gateway injects identity** — after JWT validation it puts `userId` + scope into every TCP payload; downstream services trust it (no re-validation).
- **Response envelope** — `{ success, data }` / `{ success, error }`. Use error codes from `@wriven/contracts/errors.ts`; never leak stack traces, internal service names, or DB errors.
- **Message patterns** — dot-namespaced constants from `@wriven/contracts/messages.ts`; never hardcode pattern strings.
- **Database** — single shared Postgres, isolated by schema (`auth_svc`, `core_svc`). Local dev: `docker-compose.yml` (Postgres-only); prod: Supabase. Drizzle ORM; each service migrates its own schema. `api-gateway` and `ai-service` own no tables.
- **Auth security** — never reveal whether an email exists (forgot-password always 200; login always `INVALID_CREDENTIALS`); revoke all sessions on password reset; bcrypt rounds 12.
- **Frontend** (`apps/client`, Next.js 16) — cookie-based auth (httpOnly access+refresh, in-memory CSRF double-submit). See [`doc/frontend/frontend.md`](./doc/frontend/frontend.md).

## Workflow

- **Specs** — start a feature with the `/create-spec` command; it drafts `specs/NN-<slug>.md`.
- **Plans** — for large features, `/create-plan <spec>` drafts an execution plan in `plans/NN-<slug>.md`; small features skip straight to plan mode.
- **Learning** — `/explain-me <topic>` explains any feature/module (spec → docs → code trace, decisions + file map) — interview-prep oriented.
- **Tasks** — run everything through `pnpm nx <target> <project>` (build/lint/typecheck/test), never the raw tooling.
- **Commits** — one-line Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`), no body unless essential. Keep frontend and backend changes in **separate commits**. **Never** add an AI/Claude co-author trailer.

## Commands

All via `pnpm` + `nx` (root `package.json` scripts wrap the common ones). Project config lives in each `package.json` `nx` block + plugin inference — **no `project.json` files**.

```bash
# Dev
pnpm dev:gateway        # api-gateway (:5000)
pnpm dev:auth           # auth-service (:5001)
pnpm dev:core           # core-service (:5002)
pnpm dev:ai             # ai-service (uv run uvicorn, :8000)
pnpm dev:client         # Next.js client
pnpm dev:all            # everything in parallel

# Build / lint / typecheck / test
pnpm nx build|lint|typecheck|test <project>   # any project
pnpm nx test-integration @wriven/auth-service # testcontainers specs (Docker required)
pnpm nx run-many -t build lint typecheck      # whole workspace
pnpm nx affected -t lint test                 # changed code only

# Database (drizzle-kit, per service)
pnpm db:auth:generate | migrate | push | studio
pnpm db:core:generate | migrate | push | studio
pnpm db:auth:seed       # tsx --env-file=apps/auth-service/.env
pnpm billing:replay     # re-process a stored Stripe event (auth-service script)

# Single test file
cd apps/ai-service && uv run pytest tests/test_guardrails.py   # ai-service (pytest)
cd packages/client && pnpm tsx --test test/client.test.ts      # SDK packages (node:test via tsx)

# SDK packages
pnpm sdk:build | sdk:test | sdk:check | sdk:publish
```

Notes:
- ai-service deps managed with **uv** (`uv lock` to update, `uv run` to execute) — see [`apps/ai-service/README.md`](./apps/ai-service/README.md).
- Jest per-project: the three NestJS apps (`api-gateway`, `auth-service`, `core-service`) and `libs/shared/contracts` each have `jest.config.cts` + `tsconfig.spec.json`; auth-service adds `jest.integ.config.cts` + `tsconfig.integration.json` for the testcontainers specs (`*.integ.spec.ts` under `test/integration/` — excluded from the unit suite, which must stay Docker-free) (ts-jest, nodenext, node env; apps add a `reflect-metadata` setupFile) — run via `pnpm nx test <project>`. Spec tsconfigs must keep `moduleResolution: nodenext` (inherited) — overriding to `node10` breaks `customConditions` and stripe/postgres typings. Other suites: ai-service (pytest), `packages/*` (node:test).
- NestJS builds run with `isolatedModules` + `emitDecoratorMetadata`: a type referenced in a decorated signature (e.g. `@Req() req: AuditRequest`) must be brought in via `import type` or a namespace import (`import * as contracts from '@wriven/contracts'` — which is why contract types in decorated params work). A plain named type import fails TS1272 in the production webpack build only — `pnpm dev` / `nx serve` won't hard-fail on it. Run `pnpm nx build <service>` before pushing backend changes.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
