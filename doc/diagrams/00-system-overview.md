# 00 — System Overview

Wriven at a glance: one HTTP edge, three NestJS microservices behind it (TCP), a Next.js client, a Python/FastAPI `ai-service` (HTTP), and the external providers they depend on. AI generation runs in `ai-service`; core-service calls it over HTTP (the only NestJS↔non-NestJS hop).

## Architecture

![Wriven System Overview](./00-system-overview.svg)

> Source: [`00-system-overview.svg`](./00-system-overview.svg) (hand-written SVG; edit directly).


## Protocols & ports

| Link | Protocol | Note |
|------|----------|------|
| client → gateway | HTTP | cookie-based auth (httpOnly access+refresh, in-memory CSRF double-submit) |
| gateway → auth-service | **TCP** | NestJS microservice; `@wriven/contracts` message patterns |
| gateway → core-service | **TCP** | same |
| core-service → ai-service | **HTTP** | the **only** NestJS↔non-NestJS hop; `core.ai.generate` → `POST /generate` (`X-Internal-Secret` auth). Prompt build + `select`/`compose` validate-and-repair live in ai-service; quota, audit, per-project voice, and cost live in core (specs/21). |
| Stripe → gateway | HTTP POST | `/webhooks/stripe` (raw body, forwards to auth-service) |

## Who owns what

| Layer | Owns | Does NOT |
|-------|------|----------|
| **api-gateway** | HTTP edge, JWT validation, workspace/project membership validation, RBAC enforcement for **core** routes | any tables |
| **auth-service** | `auth_svc` (users, workspaces, projects, members, invitations, sessions, tokens, plans, subscriptions, stripe_events, password/email-verification tokens, admin_users, admin_refresh_tokens, admin_audit_log), the RBAC resolver, billing | HTTP surface |
| **core-service** | `core_svc` (content types, entries, revisions, media assets, api keys, webhooks, usage_buckets, ai_generations, ai_profiles, support_tickets + messages/attachments) | authZ — trusts gateway-injected identity |
| **ai-service** | AI content generation (prompt build, temperature, `select`/`compose` validate-and-repair) | no tables (stateless LLM proxy; quota/audit/profile/cost stay in core) |
| **client** | UI, state, cookie handling | backend secrets |

## Hard rules this diagram encodes

- **Single shared Postgres**, isolated by schema (`auth_svc`, `core_svc`). Gateway + ai-service own **no** tables.
- **Gateway injects identity** — after JWT validation it puts `userId` + scope into every TCP payload; downstream services trust it (core-service never re-validates).
- **R2 keys only** — DB stores object **keys**, never full URLs; URLs reconstructed at runtime.
- **All response envelope** — `{ success, data }` / `{ success, error }`; denials → `FORBIDDEN`.

## Deploy (live)

- **Shipped:** gateway/auth/core/ai on **Render** (gateway public at `api.wriven.tech`, the rest private services — [`render.yaml`](../../render.yaml) Blueprint); client on **Vercel** (`wriven.tech`); admin SPA on **`admin.wriven.tech`**; Postgres on **Supabase**; media on Cloudflare R2. Runbook: [doc/deployment.md](../deployment.md). CI is live ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) — `nx affected` lint/typecheck/test/build + an always-on testcontainers job); remaining infra gap: a staging environment — [doc/market-readiness.md](../market-readiness.md).

## Next diagrams

- [01-auth-rbac.md](./01-auth-rbac.md) — auth + RBAC request flow, permission cascade, enforcement layers
- [02-tenancy-data-model.md](./02-tenancy-data-model.md) — users → workspaces → projects → members
