# Wriven — Documentation

Reference documentation for the Wriven backend. Start here.

Wriven is an **AI-native content management and generation SaaS**. The backend is an Nx monorepo of NestJS microservices (plus a Python AI service, not yet built) behind a single public API gateway, with a Next.js frontend.

The docs split into three layers:

- **Reference** (below) — how the system *is*. Stable, current truth.
- **Specs** ([`../specs/`](../specs/)) — feature design docs: what a feature does and why; its schema/endpoints/contracts, definition of done. Drafted via `/create-spec` before implementation.
- **Plans** ([`../plans/`](../plans/)) — execution recipes derived from a spec: ordered steps, files per step, per-step verification. Drafted via `/create-plan`; opt-in (small features skip straight to plan mode).

## Reference

**Cross-cutting**

| Doc | Covers |
|-----|--------|
| [Overview](./overview.md) | Product, tech stack, monorepo layout, settled architecture decisions |
| [Architecture](./architecture.md) | Microservices, gateway, TCP transport, service boundaries, request lifecycle |
| [Database](./database.md) | Drizzle ORM, single shared Postgres DB, schema isolation, migrations workflow |
| [API Reference](./api-reference.md) | Every gateway endpoint: method, auth, headers, body, responses |
| [Conventions](./conventions.md) | Response envelope, error codes, rate limits, env, commands, commit style |
| [Support Tickets](./support-ticket/README.md) | Workspace-level support ticketing: subject + description + ≤3 images + scope dropdown, threaded user↔staff conversation, status/priority. Separate plans: [backend](./support-ticket/backend.md) · [client](./support-ticket/client.md) · [admin-panel](./support-ticket/admin-panel.md) |

**Status & planning**

| Doc | Covers |
|-----|--------|
| [Status & Scope](./status.md) | What's implemented per module (✅/🟡/🔲) |
| [Market Readiness](./market-readiness.md) | Gap analysis: what's missing to ship Wriven as a full-fledged headless CMS — prioritized (P0–P3) with effort + current state; path to first paid launch |

**Per service**

| Service | Docs |
|---------|------|
| [api-gateway/](./api-gateway/api-gateway.md) | Responsibilities, guards, controllers, env |
| [auth-service/](./auth-service/auth-service.md) | Identity/tenancy schema, auth flows, tokens, hardening · [members-api.md](./auth-service/members-api.md) (org/workspace member CRUD) |
| [core-service/](./core-service/core-service.md) | Flexible CMS model, content types/entries/revisions/media, validation |
| [admin-panel/](./admin-panel/README.md) | Platform console: `admin`/`moderator`/`member` RBAC, separate `admin_users` identity + audit log + plans tables · [backend.md](./admin-panel/backend.md) (impl) · [frontend.md](./admin-panel/frontend.md) (SPA build guide) · [api-contract.md](./admin-panel/api-contract.md) (handoff) |

**Frontend**

| Doc | Covers |
|-----|--------|
| [frontend/frontend.md](./frontend/frontend.md) | Stack, project structure, cookie auth + CSRF, Zustand/Query state, the API client, scope, guards, env |
| [frontend/sidebar.md](./frontend/sidebar.md) | Dashboard nav architecture: URL-driven scope, nav-config brain vs shell, builders, active-state rule, RBAC seam |

## Specs

Feature design docs live in [`../specs/`](../specs/). Each describes one feature/area: overview, endpoints, schema, shared contracts, build order, definition of done.

| Spec | Covers |
|------|--------|
| [01 — Content Delivery & Plans](../specs/01-content-delivery-and-plans.md) | How customers connect a site (Delivery API, API keys, webhooks), dashboard control surface, pricing tiers, build order |
| [03 — Media](../specs/03-media.md) | R2 storage adapter, presigned direct upload, keys-only delivery URLs, media library + field picker, transforms deferred |
| [04 — Webhooks](../specs/04-webhooks.md) | Outgoing webhooks on publish/unpublish/delete, HMAC signing, retry/backoff, consumer verification, dashboard UI |
| [05 — Invitations](../specs/05-invitations.md) | Pending-invitation token flow, accept-on-signup, project→workspace auto-add, project-list leak fix, member onboarding |
| [06 — Client SDK](../specs/06-sdk.md) | `@wriven-ai/*` package strategy, dual ESM/CJS publishing foundation, isomorphic typed client design, phased build order |
| [07 — Embedded Studio](../specs/07-embedded-studio.md) | `@wriven-ai/studio` at the customer's `/wriven` route: cross-origin auth handshake, origin allowlist, editor packaging, distribution |
| [14 — Usage Metering](../specs/14-usage-metering.md) | Delivery API request counter (`usage_buckets`), batched gateway flush, `GET /usage` + dashboard, soft fail-open overage gate (`USAGE_ENFORCE`) |

> New spec? Run `/create-spec <feature name>` — it drafts the file under `../specs/` with the next number. (Spec numbering is non-contiguous: `02` graduated to `plans/`.)

## Plans

Execution recipes derived from a spec — ordered steps, files per step, per-step verification. Opt-in: only large/multi-step features need one; small features use plan mode directly.

| Plan | Executes spec | Covers |
|------|---------------|--------|
| [01 — Model A Build Plan](../plans/01-model-a-build-plan.md) | [01 — Content Delivery & Plans](../specs/01-content-delivery-and-plans.md) | Phased build: api_keys table, token guard, Delivery API, dashboard keys UI, CDN purge, webhooks, preview, plans/metering, media |
| [07 — Usage Metering](../plans/07-usage-metering.md) | [14 — Usage Metering](../specs/14-usage-metering.md) | Contracts → schema → core usage module → gateway buffer + enforce + `/usage` → frontend widget → docs |

> New plan? Run `/create-plan <spec number or slug>` — it reads the spec + codebase and drafts `../plans/<NN>-<slug>.md`.

## Status

Current implementation status per module lives in [Status & Scope](./status.md).

> Note: this `doc/` set is the maintained, current reference — the source of truth for the codebase. (The original `PROJECT.md`/`BACKEND.md` briefs have been removed; `doc/` supersedes them.) For agent working rules, see the root [CLAUDE.md](../CLAUDE.md).
