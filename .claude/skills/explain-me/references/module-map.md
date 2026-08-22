# Wriven module map — topic routing

Routes a topic to its spec(s), plan(s), docs, diagram, and code roots.
Verify code paths with Glob/Grep — the map is a starting point, code wins.

| Topic (aliases) | Spec | Plan | Docs | Diagram | Code roots |
|---|---|---|---|---|---|
| Auth & sessions (login, tokens, JWT, refresh, cookies, forgot-password) | — | — | `doc/auth-service/auth-service.md`, `doc/frontend/frontend.md` | `doc/diagrams/01-auth-rbac.md` | `apps/auth-service/src` (auth), `apps/api-gateway/src` (guards), `apps/client` (cookie/CSRF) |
| Tenancy: workspaces, projects, members, invitations (invite, roles) | `05` | — | `doc/auth-service/members-api.md` | `doc/diagrams/02-tenancy-data-model.md` | `apps/auth-service/src` (workspaces/members/invitations) |
| RBAC & permissions (roles, permission cascade) | `12`, `13` | `05`, `06` | `doc/auth-service/auth-service.md` | `doc/diagrams/01-auth-rbac.md` (+ `01b`, `01c`) | `libs/shared/contracts` (permissions), `apps/api-gateway/src` (guards), `apps/client` |
| Stripe billing (payment, subscription, checkout, invoices, pricing) | `08`, `09`, `10` | `02`, `03` | `doc/auth-service/auth-service.md`, `doc/api-reference.md` | `doc/diagrams/05-billing.md` | `apps/auth-service/src` (billing, webhooks — `STRIPE_SECRET_KEY` lives only here) |
| Plans & limits (tiers, quotas, plan-config) | `01`, `15`, `16` | `01`, `08`, `09` | `doc/plan-config.md` | `doc/diagrams/05-billing.md` | `apps/auth-service/src` (plans), core quota checks call auth over TCP |
| Usage metering (metering, quotas enforcement) | `14` | `07` | `doc/ai-governance.md` (billing/retry) | `doc/diagrams/09-usage-metering.md` | `apps/auth-service/src`, `apps/core-service/src` |
| Core CMS (content types, entries, publishing, drafts) | — | — | `doc/core-service/core-service.md` | `doc/diagrams/04-core-cms.md` | `apps/core-service/src` |
| Media (uploads, R2, images, files) | `03` | — | `doc/core-service/core-service.md` | — | `apps/core-service/src` (media) — R2 **keys** in DB, URLs reconstructed at runtime |
| Webhooks (outgoing webhooks, delivery) | `04` | — | `doc/core-service/core-service.md` | `doc/diagrams/06-webhooks.md` | `apps/core-service/src` (webhooks) |
| Delivery API & SDK (public content, publishing pipeline) | `01`, `06`, `07` | `01` | `doc/wriven-display/` | `doc/diagrams/04-core-cms.md` | `apps/core-service/src` (delivery), `packages/*` (`@wriven-ai/*`) |
| AI generation (content generation, prompts, select/compose, voice profile) | `19`, `20`, `21`, `22` | `12`–`15` | `apps/ai-service/README.md`, `doc/ai-governance.md` | `doc/diagrams/10-ai-generation-flow.md`, `11-ai-output-model.md` | `apps/ai-service` (FastAPI, uv), `apps/core-service/src` (`AiClient` seam, quota/audit/voice) |
| Workspace activity logs (audit log, activity) | `23` | `16` | `doc/status.md` | — | `apps/api-gateway/src` (audit interceptor), `apps/core-service/src`, `apps/client` (activity log UI) |
| Workspace metrics (dashboard stats) | `17` | `10` | `doc/auth-service/auth-service.md` | — | `apps/auth-service/src`, `apps/client` |
| User profile (account settings) | `18` | `11` | `doc/frontend/frontend.md` | — | `apps/auth-service/src`, `apps/client` |
| Admin (admin panel, admin JWT, /admin/*) | `11` | `04` | `doc/admin-panel/` | `doc/diagrams/07-admin-panel.md` | `apps/api-gateway/src` (admin verification), sibling repo `wriven-admin-panel/` (hand-mirrored DTOs — no `@wriven/contracts`) |
| Frontend client (Next.js app, sidebar, dashboard) | various | various | `doc/frontend/frontend.md`, `doc/frontend/sidebar.md` | `doc/diagrams/08-frontend.md` | `apps/client` — cookie auth (httpOnly + CSRF double-submit) |
| Support tickets | — | — | `doc/support-ticket/` | — | `apps/core-service/src` or `apps/auth-service/src` (Glob `support`/`ticket`) |
| Gateway architecture (routing, TCP, envelope, identity injection) | — | — | `doc/api-gateway/api-gateway.md`, `doc/conventions.md`, `doc/architecture.md` | `doc/diagrams/00-system-overview.md` | `apps/api-gateway/src`, `libs/shared/contracts` |
| Database (schemas, migrations, Drizzle) | — | — | `doc/database.md` | `doc/diagrams/02-tenancy-data-model.md` | `apps/auth-service/drizzle` / `apps/core-service` schema dirs |
| Deployment (Render, Docker, prod env) | — | — | `doc/deployment.md`, `DOCKER_SETUP.md` | — | `render.yaml`, per-service `Dockerfile` |
| Cross-cutting contracts (DTOs, error codes, TCP patterns) | — | — | `doc/conventions.md`, `doc/api-reference.md` | — | `libs/shared/contracts` (`errors.ts`, `messages.ts`) |

Notes:

- Specs `01`–`23` and plans `01`–`16` live in `specs/` and `plans/`; numbering
  between them is independent (spec 21 ↔ plan 14).
- `doc/status.md` — what's shipped per area; useful for "current state" context.
- Admin-panel and content-display are **separate repos** under the umbrella
  folder — this map only routes into the `wriven/` monorepo itself.
