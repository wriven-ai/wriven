# Wriven — Agent Instructions

**Wriven** is an AI-native headless CMS SaaS. Nx + pnpm monorepo: NestJS microservices behind a single HTTP gateway, a Next.js client, and a Python AI service (FastAPI, content generation). Frontend deploys to Vercel; all backend services run in Docker on a VPS.

## Source of truth

The maintained reference docs live under **[`doc/`](./doc/)** — start at [`doc/README.md`](./doc/README.md). Read the relevant doc before changing a subsystem:

- [`doc/overview`](./doc/overview.md) · [`doc/architecture`](./doc/architecture.md) · [`doc/database`](./doc/database.md)
- [`doc/api-reference`](./doc/api-reference.md) · [`doc/conventions`](./doc/conventions.md) · [`doc/status`](./doc/status.md)
- Per service: [`api-gateway`](./doc/api-gateway/) · [`auth-service`](./doc/auth-service/) · [`core-service`](./doc/core-service/) · [`admin-panel`](./doc/admin-panel/) · [`frontend`](./doc/frontend/)
- Feature design docs: [`specs/`](./specs/) (every feature gets a spec before implementation)
- Execution plans: [`plans/`](./plans/) (opt-in, large features — derived from a spec via `/create-plan`)

If a doc and the code disagree, **the code wins** — fix the doc.

## Hard rules (non-negotiable)

- **Shared contracts** — DTOs, response types, TCP message patterns, and error codes live in `libs/shared/contracts` (`@wriven/contracts`). Check it before defining anything new; never duplicate a contract inside a service.
- **R2 keys only** — store object **keys** in the DB, never full URLs. Reconstruct URLs at runtime.
- **Microservice boundaries** — don't collapse services:
  - `api-gateway` (HTTP `:5000`) — public edge, validates JWT **locally**, validates workspace/project membership, owns no tables.
  - `auth-service` (TCP `:5001`) — identity + tenancy (users, workspaces, projects, members, invitations).
  - `core-service` (TCP `:5002`) — CMS (content types, entries, media, webhooks, delivery API).
   - `ai-service` (FastAPI `:8000`) — **AI content generation**. Prompt building, temperature, and `select`/`compose` structured-output validation+repair live here; core-service calls it over HTTP behind an `AiClient` seam (the only NestJS↔non-NestJS HTTP call). core keeps the DB-bound work (quota reserve, audit row, per-project AI voice profile, token/cost accounting, field validation); the provider key (`AI_API_KEY`) lives only in ai-service env. All NestJS↔NestJS is TCP. See specs/21.
- **Gateway injects identity** — after JWT validation it puts `userId` + scope into every TCP payload; downstream services trust it (no re-validation).
- **Response envelope** — `{ success, data }` / `{ success, error }`. Use error codes from `@wriven/contracts/errors.ts`; never leak stack traces, internal service names, or DB errors.
- **Message patterns** — dot-namespaced constants from `@wriven/contracts/messages.ts`; never hardcode pattern strings.
- **Database** — single shared Postgres, isolated by schema (`auth_svc`, `core_svc`). Drizzle ORM; each service migrates its own schema. `api-gateway` and `ai-service` own no tables.
- **Auth security** — never reveal whether an email exists (forgot-password always 200; login always `INVALID_CREDENTIALS`); revoke all sessions on password reset; bcrypt rounds 12.
- **Frontend** (`apps/client`, Next.js 16) — cookie-based auth (httpOnly access+refresh, in-memory CSRF double-submit). See [`doc/frontend/frontend.md`](./doc/frontend/frontend.md).

## Workflow

- **Specs** — start a feature with the `/create-spec` command; it drafts `specs/NN-<slug>.md`.
- **Plans** — for large features, `/create-plan <spec>` drafts an execution plan in `plans/NN-<slug>.md`; small features skip straight to plan mode.
- **Tasks** — run everything through `pnpm nx <target> <project>` (build/lint/typecheck/test), never the raw tooling.
- **Commits** — one-line Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`), no body unless essential. Keep frontend and backend changes in **separate commits**. **Never** add an AI/Claude co-author trailer.

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
