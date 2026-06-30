# Wriven — Documentation

Reference documentation for the Wriven backend. Start here.

Wriven is an **AI-native content management and generation SaaS**. The backend is an Nx monorepo of NestJS microservices (plus a Python AI service, not yet built) behind a single public API gateway, with a Next.js frontend.

## Index

**Cross-cutting**

| Doc | Covers |
|-----|--------|
| [01 — Overview](./01-overview.md) | Product, tech stack, monorepo layout, settled architecture decisions |
| [02 — Architecture](./02-architecture.md) | Microservices, gateway, TCP transport, service boundaries, request lifecycle |
| [03 — Database](./03-database.md) | Drizzle ORM, single shared Postgres DB, schema isolation, migrations workflow |
| [06 — API Reference](./06-api-reference.md) | Every gateway endpoint: method, auth, headers, body, responses |
| [07 — Conventions](./07-conventions.md) | Response envelope, error codes, rate limits, env, commands, commit style |
| [08 — Status & Scope](./08-status.md) | What's implemented per module (✅/🟡/🔲) |
| [09 — Content Delivery & Plans](./09-content-delivery-and-plans.md) | How customers connect a site (Delivery API, API keys, webhooks), dashboard control surface, pricing tiers, build order |
| [10 — Embedded Studio](./10-embedded-studio.md) | `@wriven-ai/studio` at the customer's `/wriven` route: cross-origin auth handshake, origin allowlist, editor packaging, distribution |
| [11 — Model A Build Plan](./11-model-a-build-plan.md) | Phased build: api_keys table, token guard, Delivery API, dashboard keys UI, CDN purge, webhooks, preview, plans/metering, media |
| [12 — Invitations](./12-invitations.md) | Pending-invitation token flow, accept-on-signup, project→workspace auto-add, project-list leak fix, member onboarding |
| [13 — Media](./13-media.md) | R2 storage adapter, presigned direct upload, keys-only delivery URLs, media library + field picker, transforms deferred |
| [14 — Webhooks](./14-webhooks.md) | Outgoing webhooks on publish/unpublish/delete, HMAC signing, retry/backoff, consumer verification, dashboard UI |
| [15 — Client SDK](./15-sdk.md) | `@wriven-ai/*` package strategy, dual ESM/CJS publishing foundation, isomorphic typed client design, phased build order |
| [16 — Admin Panel](./admin-panel/README.md) | Platform console (separate repo): `admin`/`moderator`/`member` RBAC, separate `admin_users` identity + audit log + plans tables. [backend.md](./admin-panel/backend.md) (API/guards/schema impl) · [frontend.md](./admin-panel/frontend.md) (React+React Router SPA build guide + design system) |
| [17 — Market Readiness](./17-market-readiness.md) | Gap analysis: what's missing to ship Wriven as a full-fledged headless CMS — prioritized (P0–P3) with effort + current state; path to first paid launch |

**Per service**

| Service | Docs |
|---------|------|
| [api-gateway/](./api-gateway/api-gateway.md) | Responsibilities, guards, controllers, env |
| [auth-service/](./auth-service/auth-service.md) | Identity/tenancy schema, auth flows, tokens, hardening · [members-api.md](./auth-service/members-api.md) (org/workspace member CRUD) |
| [core-service/](./core-service/core-service.md) | Flexible CMS model, content types/entries/revisions/media, validation |

**Frontend**

| Doc | Covers |
|-----|--------|
| [frontend/sidebar.md](./frontend/sidebar.md) | URL-driven scope (workspace→project→feature), nav-config brain vs shell, builders, active-state rule, RBAC seam |

## Status

Current implementation status per module lives in [08 — Status & Scope](./08-status.md).

> Note: `PROJECT.md` and `BACKEND.md` at the repo root are the original product/architecture briefs (git-ignored). This `doc/` set is the maintained, current reference.
