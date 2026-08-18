# Wriven

**An AI-native headless CMS platform** — define your own content model, generate and refine content with AI, and deliver it to any frontend through a fast, CDN-cacheable Content Delivery API.

Wriven is a full multi-tenant SaaS: workspaces, projects, role-based access control, usage metering, Stripe subscription billing, and a publishable npm SDK (`@wriven-ai/*`) for consuming content from React and Next.js apps.

---

## Live Environments

| Environment | URL | What it is |
|---|---|---|
| **Main app** | [wriven.tech](https://wriven.tech) | Client application — dashboard, content modeling, AI Co-Writer, billing |
| **Admin panel** | [admin.wriven.tech](https://admin.wriven.tech) | Staff-only platform console (separate identity, audit log, plan management, support tickets) |
| **Demo content site** | [contents.wriven.tech](https://contents.wriven.tech) | Public showcase site rendering published Wriven content through the Delivery API + `@wriven-ai/*` SDK |
| **Public API** | [api.wriven.tech/v1](https://api.wriven.tech/v1) | The single public entry point — the API gateway |

---

## What Wriven Does

1. **Model** — define your own content types and fields (text, rich text, media, references, selects…) per project. No fixed schemas.
2. **Create** — write entries in a structured editor with rich-text editing, inline images, field validation, slugs, draft/publish workflow, and automatic revision history.
3. **Generate** — AI Generate/Refine per field, whole-entry "Draft" composition, and a per-project brand voice + glossary. Every generation is quota-metered, audited, and cost-accounted.
4. **Deliver** — publish to a public, API-key-protected Delivery API with filtering, sorting, pagination, reference expansion, CDN cache headers + tag-based purging, and HMAC-signed webhooks.
5. **Consume** — any frontend reads content through the typed `@wriven-ai/client` SDK, with `@wriven-ai/react` (rich-text renderer) and `@wriven-ai/next` (webhook-driven ISR revalidation + draft preview).

---

## Feature Highlights

**Content management**
- User-defined content types & fields (unique constraints, multi-value, references with expansion)
- Entry lifecycle: drafts, publishing, revisions with restore + per-plan retention
- Rich-text editor (TipTap) with inline media, media library with lightbox
- Media pipeline: presigned direct-to-R2 uploads, per-workspace quotas, keys-only storage (URLs reconstructed at runtime)

**AI generation**
- Standalone Python `ai-service` — prompt building, temperature tuning, structured-output validation with repair-and-retry
- Generate / Refine per field + whole-entry compose; AI Co-Writer panel with history, diff, apply, and undo
- Per-project AI voice: brand voice, glossary, language
- Per-field privacy controls (opt out sensitive fields); eligibility derived from field type
- Hard quota enforcement (atomic advisory-lock reservation), token + cost accounting per model, idempotent generations, audit trail with bounded redaction

**Delivery API**
- Project-scoped API keys (`wrk_…`, hash-only storage, read/preview/manage scopes)
- Published-only reads with `select` / filter / sort / paginate / `include`
- CDN cache headers (`s-maxage`, `Surrogate-Key`) + Cloudflare tag purge on publish
- Preview API for drafts; signed outgoing webhooks (HMAC) with retry/backoff
- Usage metering with dashboard (requests, storage, AI tokens & cost vs. plan limits)

**Multi-tenancy, auth & security**
- User → Workspace → Project → Content hierarchy; invitations with accept-on-signup
- Cascading RBAC (role → permission resolution shared across backend & frontend)
- JWT access/refresh with rotation + refresh-reuse theft detection; httpOnly cookie auth + CSRF double-submit; Google OAuth with account linking; bcrypt (12 rounds)
- Session revocation on password reset; no user-enumeration responses; rate limiting at the edge

**Billing & operations**
- Stripe subscriptions: Checkout, Billing Portal, prorated upgrades, deferred downgrades (Subscription Schedules), webhook reconciliation
- Plans: Free / Starter / Pro — enforced limits (requests, storage, revisions, AI generations)
- Staff admin panel with separate identity, RBAC (admin/moderator/member), audit log, and a workspace-level support ticketing system with threaded conversations

---

## Architecture

Microservices behind a single public gateway. Only the gateway is exposed to the internet; everything else is internal.

```
                        ┌────────────────────────┐
  Browser / Next.js ───▶│   api-gateway (HTTP)   │ :5000  ← only public service
  content-display  ───▶ │  · JWT validation      │        · workspace/project membership
  (Delivery API)        │  · API-key guard       │        · rate limiting · response envelope
                        └───────┬─────────┬─────┘
                          TCP   │         │  TCP
                                ▼         ▼
                   ┌────────────────┐  ┌────────────────┐     HTTP      ┌────────────────┐
                   │  auth-service  │  │  core-service  │──────────────▶│   ai-service   │
                   │  TCP :5001     │  │  TCP :5002     │  (AiClient)   │  FastAPI :8000 │
                   │ identity +     │  │ CMS + delivery │               │ AI generation  │
                   │ tenancy + bill │  │ + media + AI   │               │ prompt/retry   │
                   └───────┬────────┘  └───────┬────────┘               └────────────────┘
                           │                  │
                           └────────┬─────────┘
                                    ▼
                    PostgreSQL (Supabase — single DB, schema-isolated:
                    auth_svc · core_svc)     Cloudflare R2 (media)
```

- **NestJS ↔ NestJS over TCP** (`@nestjs/microservices`, brokerless — no Redis/RabbitMQ needed); message patterns are shared constants from `@wriven/contracts`.
- The gateway validates JWTs locally and **injects identity** (`userId`, scope) into every downstream payload — services trust the edge.
- **core → ai-service is the only HTTP hop** — provider API keys live exclusively in the Python service.
- **No cross-service foreign keys** — tenancy enforced at the edge, schemas fully isolated.

| Service | Tech | Role |
|---|---|---|
| `api-gateway` | NestJS 11 | Public HTTP edge — auth guards, membership guards, rate limiting, response envelope |
| `auth-service` | NestJS 11 (TCP) | Identity, sessions, workspaces/projects/members, invitations, RBAC, Stripe billing |
| `core-service` | NestJS 11 (TCP) | Content types, entries, revisions, media, API keys, Delivery API, webhooks, usage, AI orchestration |
| `ai-service` | FastAPI (Python) | AI content generation — prompt building, structured-output validation + repair |
| `client` | Next.js 16 + React 19 | The SaaS dashboard and marketing site |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS v4, Zustand, TanStack Query, TipTap |
| Backend | NestJS 11 (microservices, TCP transport), FastAPI (Python, uv) |
| Monorepo | Nx + pnpm workspaces |
| Database | PostgreSQL (Supabase), Drizzle ORM + drizzle-kit migrations, schema-per-service isolation |
| Object storage | Cloudflare R2 (S3-compatible, presigned uploads) |
| Auth | JWT (HS256) + refresh rotation & theft detection, Passport + Google OAuth, bcrypt, httpOnly cookies + CSRF double-submit |
| Payments | Stripe (Checkout, Billing Portal, Subscription Schedules, webhooks) |
| AI | Provider-backed LLM generation behind the internal `ai-service` (structured outputs, validation + repair) |
| Rich text | TipTap (ProseMirror), rendered consumer-side by `@wriven-ai/react` |
| Email | Nodemailer (SMTP) |
| Tooling | ESLint 9, Prettier, Jest 30, pytest, Docker |
| Deploy | Frontend → Vercel · Backend → Docker on a VPS · DB → Supabase · Media → Cloudflare R2 + CDN |

---

## Monorepo Layout

```
wriven/
├── apps/
│   ├── client/          # Next.js 16 — dashboard + marketing site
│   ├── api-gateway/     # NestJS — public HTTP edge
│   ├── auth-service/    # NestJS — TCP microservice (identity + tenancy + billing)
│   ├── core-service/    # NestJS — TCP microservice (CMS + delivery + media)
│   └── ai-service/      # FastAPI — AI content generation
├── packages/
│   ├── client/          # @wriven-ai/client — isomorphic, typed Delivery API client
│   ├── react/           # @wriven-ai/react — rich-text (ProseMirror JSON) renderer
│   └── next/            # @wriven-ai/next — webhook → revalidate route + draft preview
├── libs/shared/
│   ├── contracts/       # @wriven/contracts — DTOs, message patterns, error codes, RBAC catalog
│   ├── database/        # @wriven/database — Drizzle client factory
│   ├── common/ · constants/ · types/
├── doc/                 # maintained reference documentation
├── specs/               # feature design docs (one per feature, pre-implementation)
└── plans/               # execution plans for large features
```

### Delivery SDK (`@wriven-ai/*`, published to npm)

| Package | What it does |
|---|---|
| `@wriven-ai/client` | Isomorphic, typed, zero-dependency client for the Delivery API |
| `@wriven-ai/react` | React renderer for Wriven rich-text documents, incl. inline media |
| `@wriven-ai/next` | Next.js helpers: signed-webhook → ISR revalidation route handler, draft preview wiring |

---

## Ecosystem

Wriven ships as three independent repositories:

| Repo | What it is |
|---|---|
| **This repo** — `wriven` | The platform: microservices backend, Next.js client, delivery SDK packages |
| `wriven-admin-panel` | Staff-only admin SPA (Vite + React + TanStack Query/Table + Tailwind v4 + Base UI) — RBAC, audit log, plan management, support tickets. Live at [admin.wriven.tech](https://admin.wriven.tech) |
| `wriven-content-display` | Public showcase site (Next.js 16 App Router) — SSG from live slugs, webhook-driven ISR revalidation, powered entirely by the `@wriven-ai/*` SDK. Live at [contents.wriven.tech](https://contents.wriven.tech) |

---

## Documentation

Maintained reference docs live in [`doc/`](./doc/) — start at [`doc/README.md`](./doc/README.md):

- [Overview](./doc/overview.md) · [Architecture](./doc/architecture.md) · [Database](./doc/database.md)
- [API Reference](./doc/api-reference.md) · [Conventions](./doc/conventions.md) · [Deployment](./doc/deployment.md)
- Per-service guides (`doc/api-gateway/`, `doc/auth-service/`, `doc/core-service/`, `doc/frontend/`, `doc/admin-panel/`)
- Feature specs ([`specs/`](./specs/)) and execution plans ([`plans/`](./plans/))
