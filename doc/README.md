# Wriven — Documentation

Reference documentation for the Wriven backend. Start here.

Wriven is an **AI-native content management and generation SaaS**. The backend is an Nx monorepo of NestJS microservices (plus a Python AI service, not yet built) behind a single public API gateway, with a Next.js frontend.

## Index

| Doc | Covers |
|-----|--------|
| [01 — Overview](./01-overview.md) | Product, tech stack, monorepo layout, settled architecture decisions |
| [02 — Architecture](./02-architecture.md) | Microservices, gateway, TCP transport, service boundaries, request lifecycle |
| [03 — Database](./03-database.md) | Drizzle ORM, single shared Postgres DB, schema isolation, migrations workflow |
| [04 — Auth Service](./04-auth-service.md) | Identity/tenancy schema, all auth flows, tokens, security hardening |
| [05 — Core Service (CMS)](./05-core-service.md) | Flexible content model, content types/entries/revisions/media, validation |
| [06 — API Reference](./06-api-reference.md) | Every gateway endpoint: method, auth, headers, body, responses |
| [07 — Conventions](./07-conventions.md) | Response envelope, error codes, rate limits, env, commands, commit style |

## Status snapshot

| Area | Status |
|------|--------|
| Monorepo scaffold (Nx + pnpm) | ✅ |
| api-gateway (HTTP edge) | ✅ |
| auth-service (TCP) — register/login/refresh/logout/forgot/reset/verify/OAuth | ✅ |
| core-service (TCP) — flexible CMS (content types, entries, revisions, media schema) | ✅ |
| JWT guard + workspace-membership guard | ✅ |
| Rate limiting | ✅ |
| Drizzle on single shared Supabase Postgres | ✅ |
| ai-service (FastAPI) | 🔲 Not started |
| Media upload (R2 presign) | 🔲 Schema only |
| Docker Compose / deploy | 🔲 Not started |

> Note: `PROJECT.md` and `BACKEND.md` at the repo root are the original product/architecture briefs (git-ignored). This `doc/` set is the maintained, current reference.
