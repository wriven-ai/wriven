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
