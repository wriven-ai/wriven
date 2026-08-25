# Wriven — Documentation

Reference documentation for the Wriven backend. Start here.

Wriven is an **AI-native content management and generation SaaS**. The backend is an Nx monorepo of NestJS microservices behind a single public API gateway, with a Next.js frontend, and a Python FastAPI `ai-service` for content generation (called from core-service over HTTP).

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
| [Testing](./testing.md) | Unit-test suites (Jest): philosophy, per-project layout, the `src/testing/` mock toolkit (drizzle-mock, chain/chainOf, serializeFragment), recurring patterns + gotchas, known coverage gaps |
| [AI Governance](./ai-governance.md) | AI data controls, retention, billing/retry policy, and monitoring |
| [Plan Config](./plan-config.md) | Plan tiers (`free`/`starter`/`pro`): pricing, limits, features — managed via the admin panel (not seeded) |
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

**Consumer integration**

| Doc | Covers |
|-----|--------|
| [wriven-display/](./wriven-display/README.md) | Self-contained guide for building a **public read-only frontend** (React + Vite) that displays Wriven content via the Delivery API — credentials, API reference, typed client, rich-text renderer, content-type examples (product/blog/team), full Vite build, troubleshooting. Hand this to an agent building a display site. |

**Operations**

| Doc | Covers |
|-----|--------|
| [deployment.md](./deployment.md) | Deploy runbook (**live in prod**): backend on Render (Blueprint `render.yaml`: gateway public web service at `api.wriven.tech` + auth/core/ai private services), frontend on Vercel (`wriven.tech`), DB on Supabase, `wriven.tech` + `api.wriven.tech` same-site domain (no cookie code change), env strategy, custom domains, Google OAuth, smoke test, troubleshooting |

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
| [08 — Stripe Billing](../specs/08-stripe-billing.md) | Checkout + Billing Portal + subscription webhook reconciler (auth-service), Managed Payments opt-out, event replay |
| [09 — Billing Page Frontend](../specs/09-billing-page-frontend.md) | Dashboard billing page: current plan, Checkout redirect, Portal link |
| [10 — Invoice List](../specs/10-invoice-list.md) | Stripe invoice list on the billing page |
| [11 — Admin Plan Stripe Sync](../specs/11-admin-plan-stripe-sync.md) | Admin plans CRUD ↔ Stripe Products/Prices linking |
| [12 — RBAC Permissions](../specs/12-rbac-permissions.md) | Typed `Permission` catalog, role→permission maps, cascade resolver (backend) |
| [13 — Frontend RBAC](../specs/13-frontend-rbac.md) | `useCan()`/`<Can>`/`<RequirePermission>` against the shared cascade |
| [14 — Usage Metering](../specs/14-usage-metering.md) | Delivery API request counter (`usage_buckets`), batched gateway flush, `GET /usage` + dashboard, soft fail-open overage gate (`USAGE_ENFORCE`) |
| [15 — Plan Revamp & Pricing](../specs/15-plan-revamp-and-pricing.md) | free/starter/pro catalog reshape, revision-retention caps, public `/pricing` |
| [16 — Deferred Plan Downgrade](../specs/16-deferred-plan-downgrade.md) | Downgrades deferred to period end via Stripe Subscription Schedules (`pendingDowngrade`) |
| [17 — Workspace Metrics](../specs/17-workspace-metrics.md) | `GET /stats/workspace` + `/stats/project`, themed stat grids |
| [18 — User Profile](../specs/18-user-profile.md) | Profile page, avatar presign, OTP email verification, downgrade screening |
| [19 — AI Content Generation](../specs/19-ai-content-generation.md) | (superseded by 21) |
| [20 — AI Service Extraction](../specs/20-ai-service-extraction.md) | (superseded by 21) |
| [21 — AI Generation Redesign](../specs/21-ai-generation-redesign.md) | Typed `AiOutput` (scalar/record), whole-entry compose, Generate/Refine model, per-project AI voice, token/cost accounting, standalone ai-service |
| [22 — AI Generation Hardening](../specs/22-ai-generation-hardening.md) | Usage-wire fix, 2xx body validation at the AiClient seam, honest retry semantics, shared richtext schema, compose undo/provenance |

> New spec? Run `/create-spec <feature name>` — it drafts the file under `../specs/` with the next number. (Spec numbering is non-contiguous: `02` graduated to `plans/`.)

## Plans

Execution recipes derived from a spec — ordered steps, files per step, per-step verification. Opt-in: only large/multi-step features need one; small features use plan mode directly.

| Plan | Executes spec | Covers |
|------|---------------|--------|
| [01 — Model A Build Plan](../plans/01-model-a-build-plan.md) | [01 — Content Delivery & Plans](../specs/01-content-delivery-and-plans.md) | Phased build: api_keys table, token guard, Delivery API, dashboard keys UI, CDN purge, webhooks, preview, plans/metering, media |
| [02 — Stripe Billing](../plans/02-stripe-billing.md) | [08](../specs/08-stripe-billing.md) | Billing module, webhook reconciler, replay script |
| [03 — Billing Page Frontend](../plans/03-billing-page-frontend.md) | [09](../specs/09-billing-page-frontend.md) | Dashboard billing page |
| [04 — Admin Plan Stripe Sync](../plans/04-admin-plan-stripe-sync.md) | [11](../specs/11-admin-plan-stripe-sync.md) | Plans CRUD ↔ Stripe linking |
| [05 — RBAC Permissions](../plans/05-rbac-permissions.md) | [12](../specs/12-rbac-permissions.md) | Permission catalog + cascade |
| [06 — Frontend RBAC](../plans/06-frontend-rbac.md) | [13](../specs/13-frontend-rbac.md) | `useCan()` gating |
| [07 — Usage Metering](../plans/07-usage-metering.md) | [14 — Usage Metering](../specs/14-usage-metering.md) | Contracts → schema → core usage module → gateway buffer + enforce + `/usage` → frontend widget → docs |
| [08 — Plan Revamp & Pricing](../plans/08-plan-revamp-and-pricing.md) | [15](../specs/15-plan-revamp-and-pricing.md) | Catalog reshape + pricing page |
| [09 — Deferred Plan Downgrade](../plans/09-deferred-plan-downgrade.md) | [16](../specs/16-deferred-plan-downgrade.md) | Subscription Schedule downgrade flow |
| [10 — Workspace Metrics](../plans/10-workspace-metrics.md) | [17](../specs/17-workspace-metrics.md) | Stats endpoints + stat grids |
| [11 — User Profile](../plans/11-user-profile.md) | [18](../specs/18-user-profile.md) | Profile page + OTP verify |
| [12 — AI Content Generation](../plans/12-ai-content-generation.md) | [19](../specs/19-ai-content-generation.md) | (superseded by plan 14) |
| [13 — AI Service Extraction](../plans/13-ai-service-extraction.md) | [20](../specs/20-ai-service-extraction.md) | (superseded by plan 14) |
| [14 — AI Generation Redesign](../plans/14-ai-generation-redesign.md) | [21](../specs/21-ai-generation-redesign.md) | Typed AiOutput, compose, voice profile, ai-service extraction |
| [15 — AI Generation Hardening](../plans/15-ai-generation-hardening.md) | [22](../specs/22-ai-generation-hardening.md) | Review-hardening fixes |

> New plan? Run `/create-plan <spec number or slug>` — it reads the spec + codebase and drafts `../plans/<NN>-<slug>.md`.

## Status

Current implementation status per module lives in [Status & Scope](./status.md).

> Note: this `doc/` set is the maintained, current reference — the source of truth for the codebase. (The original `PROJECT.md`/`BACKEND.md` briefs have been removed; `doc/` supersedes them.) For agent working rules, see the root [CLAUDE.md](../CLAUDE.md).
