Overview

## What Wriven is

Wriven is an **AI-native content management and generation SaaS platform**. AI is positioned as the core product (text + image generation, AI-assisted CMS), not a bolt-on. The CMS is **headless and flexible**: users define their own content types and fields; the platform is multi-tenant via workspaces and projects (User → Workspace → Project → Content).

- GitHub org: `wriven-ai` · npm scope: `@wriven-ai` (publishable packages)
- Internal workspace package scope: `@wriven/*`

## Tech stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 16, React 19, Tailwind CSS **v4** | `apps/client`, deploys to Vercel |
| API Gateway | NestJS 11 (HTTP) | Single public entry point |
| Auth Service | NestJS 11 (TCP microservice) | Identity, sessions, tenancy |
| Core Service | NestJS 11 (TCP microservice) | CMS: content types, entries, media, AI quota/audit (calls ai-service over HTTP) |
| AI Service | FastAPI (Python) | Content generation (prompt build + `select` retry); core → ai-service over HTTP |
| ORM | Drizzle ORM (`drizzle-orm` + `drizzle-kit`) | postgres.js driver |
| Database | PostgreSQL (Supabase) | Single shared DB, schema-isolated per service |
| Object storage | Cloudflare R2 | Store object **keys** only, never URLs |
| Image transforms | ImageKit | Planned, in front of R2 |
| Auth | JWT (HS256) + bcrypt + Passport (Google OAuth) | |
| Email | Nodemailer over SMTP (Mailtrap in dev) | |
| Build | Nx 22.7.5 + pnpm, SWC, webpack (node target) | |
| Lint/Test | ESLint 9, Prettier, Jest 30 | |
| Backend deploy | Hetzner VPS via Docker Compose (planned) | |

## Monorepo layout

```
wriven/
├── apps/
│   ├── client/          # Next.js 16 frontend
│   ├── api-gateway/     # NestJS — public HTTP edge
│   ├── auth-service/    # NestJS — TCP microservice
│   ├── core-service/    # NestJS — TCP microservice (CMS)
│   └── ai-service/      # FastAPI — AI content generation (core → ai-service over HTTP)
├── libs/shared/
│   ├── contracts/       # @wriven/contracts — DTOs, types, message patterns, error codes
│   ├── database/        # @wriven/database — Drizzle client factory + DI module
│   ├── common/          # @wriven/common
│   ├── constants/       # @wriven/constants
│   └── types/           # @wriven/types — role enums, etc.
├── doc/                 # this documentation
├── nx.json · pnpm-workspace.yaml · tsconfig.base.json
```

Workspace packages are linked via pnpm (`workspace:*`) and resolved through TS custom export conditions; Nx manages the project graph and tsconfig project references (`sync.applyChanges: true`).

## Settled architecture decisions

These were chosen deliberately — do not re-litigate:

1. **Nx over Turborepo** — first-class NestJS + Next.js + Python in one graph.
2. **Microservices are intentional** — split by domain (gateway/auth/core/ai), not driven by current scale. Respect the boundaries; don't collapse services.
3. **Single shared Postgres DB, isolated by schema** (`auth_svc`, `core_svc`) — one Supabase project now; the design keeps a future per-service DB split as a config change (see [Database](./database.md)).
4. **R2 object keys only in the DB** — reconstruct URLs at runtime from config, so storage migration is config not data.
5. **No foreign keys across service boundaries** — `user_id` / `workspace_id` in core are plain `uuid`, validated by the gateway.
6. **Shared contracts in `@wriven/contracts`** — DTOs, response types, message patterns, error codes consumed by all services.
7. **Per-service `.env`** — never shared across service boundaries.
8. **pnpm** — controlled Docker builds, no lockfile conflicts.

## Build & run commands

```bash
pnpm dev:gateway      # nx serve api-gateway   (HTTP :5000)
pnpm dev:auth         # nx serve auth-service  (TCP  :5001)
pnpm dev:core         # nx serve core-service  (TCP  :5002)
pnpm dev:client       # nx dev   client
pnpm build            # build all
pnpm db:auth:generate / db:auth:migrate    # Drizzle, auth schema
pnpm db:core:generate / db:core:migrate    # Drizzle, core schema
```

See [Conventions](./conventions.md) for the full command list.
