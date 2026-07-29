Market Readiness: Gap Analysis

What's left to ship Wriven as a **full-fledged, sellable headless CMS**. This is a
candid inventory of gaps — not a roadmap promise. Each item: **what** it is,
**why** it matters, **now** (current state), **effort** (S ≤ days · M ≤ 1–2 wks ·
L ≤ 1 mo · XL multi-month).

Priority legend:
- **P0** — blocks charging money / running in production safely. Do first.
- **P1** — table-stakes; a buyer comparing Wriven to Contentful/Sanity expects it.
- **P2** — competitive / scale; needed as you grow past first customers.
- **P3** — nice-to-have / enterprise / growth.

> Reality check: the **core CMS engine is real and works** — content modeling,
> entries, revisions, delivery API, API keys, media, webhooks, the admin platform
> console, plans + enforcement. The gaps below are mostly the **commercial,
> operational, and breadth** layers around that engine.

---

## What's already shipped (snapshot)

So the gaps read in context. ✅ = working.

- ✅ **Auth/tenancy** — register/login/refresh/logout, Google OAuth, email verify,
  password reset, JWT cookies + CSRF; users → workspaces → projects; workspace +
  project members; invitations.
- ✅ **Content** — user-defined content types (8 field types incl. `reference` +
  `media`), entries (draft/published/archived), revisions + restore, unique-field
  enforcement, server validation.
- ✅ **Delivery API** — published reads by content type, reference expansion
  (`include` 0–3), API keys (read/preview/manage scopes), preview via key scope,
  CDN cache tags + Cloudflare purge.
- ✅ **Media** — R2 presigned upload, keys-only delivery, library + field picker,
  inline rich-text images.
- ✅ **Webhooks** — signed (HMAC) POST on publish/unpublish/delete, retry/backoff.
- ✅ **SDK** — `@wriven-ai/client` / `react` / `next` (built, tested; **not yet
  published**).
- ✅ **Admin platform console** (backend) — separate `admin_users` identity, RBAC,
  audit log, metrics, tenant/content/media/key/webhook moderation, plans CRUD +
  assignment, **plan-limit enforcement** (projects, members, entries, content
  types, API keys, webhooks, storage).
- ✅ **Plans/subscriptions** — free/pro/business, limits + enforcement, Stripe-ready
  schema (subscription row per workspace, created on signup).
- 🟡 **Frontend** — tenant dashboard (Next.js) exists; admin-panel SPA in progress
  (separate repo).

---

## P0 — Blocks monetization / safe production

### Billing integration (Stripe) — **XL**
- **What:** actual payments — Checkout, customer portal, subscription lifecycle
  webhooks (created/updated/canceled/past_due), invoices, proration, trials,
  dunning, tax.
- **Why:** you cannot charge anyone. Plans/limits/enforcement exist, but there is
  **no payment path** — every workspace is effectively free.
- **Now:** `subscriptions`/`plans` tables carry Stripe fields
  (`stripeCustomerId`, `stripeSubscriptionId`, price ids) but nothing writes them.
  Pricing + billing pages are UI shells. No Stripe SDK, no webhook handler.
- **Need:** a billing module — create customer on workspace create, Checkout
  session, a Stripe-webhook → update `subscriptions.status`/plan, portal link,
  invoice list. Map Stripe events to the existing subscription model.

### Usage metering — **L**
- **What:** measure API requests/month, asset bandwidth, storage **over time** per
  workspace; enforce + display; overage handling.
- **Why:** plans advertise `apiRequestsPerMonth` / `assetBandwidthGb` but those are
  **never measured or enforced**. Only count-based caps (projects/entries/…) bite.
- **Now:** limit fields exist in plan JSON; storage is checked at upload; **no
  request/bandwidth metering** anywhere.
- **Need:** a metering pipeline (counter per key/workspace per period; e.g.
  increment in the API-key guard → rollup table or Redis), a usage dashboard, and
  block/throttle on overage.

### Production deployment + infra — **L** (user-deferred)
- **What:** deploy gateway + auth + core (+ ai) to prod; managed Postgres,
  container orchestration, autoscaling, health checks, graceful shutdown, env/secret
  management, domains/TLS, CDN.
- **Why:** nothing is live.
- **Now:** all local. R2 + Supabase provisioned.
- **Need:** containerize, pick a host (Fly/Render/Railway/AWS), CI/CD, staging env.

### Transactional email at scale — **S**
- **What:** a real email provider.
- **Why:** verification/reset/invitation emails currently go through **Gmail SMTP**
  — ~500/day cap, deliverability/spam risk. Not production-grade.
- **Now:** `MailService` is SMTP-configurable; documented for Gmail (dev).
- **Need:** swap to Resend/SES/Postmark; SPF/DKIM/DMARC; bounce handling.

### Observability — **M**
- **What:** error tracking (Sentry), structured logs + aggregation, uptime/health
  monitoring, APM/traces, alerting.
- **Why:** in production you're blind to failures without it.
- **Now:** Nest `Logger` to stdout only. No error tracking, no alerts.

### Backups & disaster recovery — **S**
- **What:** automated DB backups + point-in-time recovery, restore runbook, R2
  lifecycle/versioning.
- **Why:** data loss = company over.
- **Now:** relying on Supabase defaults; no documented/tested restore.

### Security hardening — **M**
- **What:** CORS origin allowlist (still `origin:true`), per-API-key rate limiting
  on the Delivery API, tenant-side 2FA, admin TOTP/MFA, secret rotation, dependency
  + secret scanning (CI), basic WAF/abuse protection.
- **Why:** table-stakes to be trusted with customer content.
- **Now:** CSRF + global throttle + admin RBAC/audit done; **CORS open**, **no
  per-key rate limit**, **no tenant 2FA**, **admin TOTP not built** (schema only).
- **Cross-ref:** [admin-panel/backend.md §8/§10](./admin-panel/backend.md).

### Automated tests — **L**
- **What:** unit + integration + e2e + load tests.
- **Why:** zero safety net for a multi-service system handling customer data.
- **Now:** **0 test files in `apps/`** (only the SDK packages have tests).
- **Need:** at least integration tests on auth, content CRUD, delivery, enforcement,
  webhooks; a smoke e2e; a load test on the Delivery API.

---

## P1 — Table-stakes CMS features

### GraphQL Delivery API — **L**
- **What:** a GraphQL endpoint alongside REST (schema generated from content types).
- **Why:** Contentful/Hygraph/Sanity all offer it; many buyers expect/require it.
- **Now:** **REST only.** No GraphQL anywhere in the API.

### Full-text / content search — **M**
- **What:** search across entries (Postgres FTS `tsvector`, or Meilisearch/Algolia).
- **Why:** both authors (dashboard) and consumers (delivery) need search; a JSONB
  GIN index exists for filtering but there's no text search.
- **Now:** **none** (filter by field equality only).

### Scheduled publishing — **M**
- **What:** publish/unpublish an entry at a future time; recurring.
- **Why:** standard editorial need.
- **Now:** **not implemented** (publish is immediate only). The plan model even
  lists `scheduledPublishing` as a paid feature — but it doesn't exist yet.

### Localization / i18n — **L**
- **What:** multi-locale content, locale fallbacks, per-locale publish, translation
  workflow.
- **Why:** a primary reason teams pick a headless CMS.
- **Now:** **not implemented.** `locales` appears only as a plan-limit number; no
  locale dimension on entries.

### Content environments (dev/staging/prod) — **L**
- **What:** isolated content spaces per project (e.g. `master`/`staging`), clone,
  promote, schema changes safely.
- **Why:** Contentful's core differentiator; expected for serious teams.
- **Now:** **not implemented.** `environments` is a plan-limit number only.

### On-the-fly image transformations — **M**
- **What:** resize/crop/format/quality via URL params (Sanity-style), focal point.
- **Why:** the one true gap vs Sanity called out in the SDK review; consumers expect
  responsive images without pre-generating.
- **Now:** media served as stored; **no transform service.**
- **Cross-ref:** [03-media.md](../specs/03-media.md) (transforms deferred).

### Richer field types & validation — **M**
- **What:** nested/repeatable **components** (group/object/array), JSON field,
  conditional fields, dedicated slug field, url/email types, per-field validation
  rules (regex, min/max/required messages), default values.
- **Why:** real content models need composition; 8 flat field types is thin.
- **Now:** text/richtext/number/boolean/date/media/select/reference — **no
  nested/component or JSON**, limited validation.

### API documentation — **M**
- **What:** OpenAPI/Swagger spec for the management + delivery API; GraphQL
  playground; an interactive API explorer; auto-generated typed reference.
- **Why:** DX is a buying factor; hand-written docs drift.
- **Now:** prose docs only ([api-reference.md](./api-reference.md)); **no
  OpenAPI/Swagger** (`@nestjs/swagger` not installed).

### Publish the SDK — **S**
- **What:** ship `@wriven-ai/client` / `react` / `next` to npm.
- **Why:** consumers can't install them; the whole DX story depends on it.
- **Now:** built, tested, publint-clean, **not published**. (Blocked earlier on an
  npm 2FA/token issue.)
- **Cross-ref:** [06-sdk.md](../specs/06-sdk.md).

### Admin panel frontend — **L** (in progress, separate repo)
- **What:** the operational console UI.
- **Why:** the backend (this repo) is done; ops can't use it without the UI.
- **Now:** being built in its own repo per [admin-panel/frontend.md](./admin-panel/frontend.md).

---

## P2 — Competitive / scale

### Granular RBAC & custom roles — **L**
- Field-level / content-type-level permissions, custom roles. Now: coarse workspace
  (owner/admin/member/guest) + project (admin/editor/viewer) roles only.

### SSO / SAML / SCIM — **L**
- Enterprise login. Plan model flags `sso` as a Business feature — **not built**.

### Real-time collaboration — **XL**
- Concurrent editing, presence, comments/annotations, mentions, activity feed,
  content-history diff UI. Now: none (last-write-wins; revisions stored but no diff
  UI/locking).

### AI service (the "AI-native" promise) — **XL**
- The product is described as "AI-native content generation"; `apps/ai-service` is a
  **FastAPI skeleton only** (`main.py` + README). AI authoring/assist/generation is
  unbuilt. The editor has an AI chat panel UI but no backend.

### Webhook management depth — **M**
- Delivery logs + retry history UI, more event types, signature docs, test-send.
  Now: create/list/update/delete + signed delivery + retry exist; **no logs UI**.

### Digital asset management — **M**
- Folders, tags, media search, focal point, video processing, alt/SEO metadata.
  Now: flat library + alt text only.

### Scale hardening — **M**
- Metrics/media-usage caching (full COUNT/SUM per dashboard load today), keyset
  pagination (OFFSET today), sort-column indexes, Redis, read replicas, connection
  pooling review.
- **Cross-ref:** [admin-panel/backend.md §9](./admin-panel/backend.md).

### Editorial workflow — **L**
- Approval stages beyond draft/published/archived, content locking, bulk operations,
  draft preview links per entry. Now: 3 statuses, no workflow.

### Tenant-side audit log — **M**
- Who-changed-what within a workspace (the admin console has its own audit log;
  tenants don't). Expected for teams/compliance.

### Import / export / migration tooling — **M**
- Bulk import/export (JSON/CSV), content-model migration scripts, a CLI. Now: none.

---

## P3 — Nice-to-have / growth / compliance

- **Integrations** — Zapier/Make, native connectors, starter templates, sample apps.
- **Compliance** — SOC 2, GDPR data export/delete tooling, DPA, cookie consent,
  sub-processor list. (GDPR "delete user" is currently FK-blocked → returns CONFLICT.)
- **Growth** — referrals, in-app notifications + preferences, onboarding checklist,
  status page.
- **Multi-region / edge** — geo-distributed delivery, advanced caching tiers.
- **Codegen** — typed `getEntries('blog_post')` from a project's content model
  (SDK Phase 4 in [06-sdk.md](../specs/06-sdk.md)).

---

## Suggested path to a first paid launch (MVP-to-market)

A pragmatic sequence — ship something chargeable without boiling the ocean:

1. **Make it sellable:** Stripe billing + usage metering + production deploy +
   transactional email. (P0)
2. **Make it safe:** observability + backups/DR + security hardening (CORS,
   per-key rate limit, secret/dep scanning) + a baseline integration test suite. (P0)
3. **Make it credible:** publish the SDK, finish the admin SPA, add OpenAPI docs,
   scheduled publishing, full-text search, on-the-fly image transforms. (P1)
4. **Make it competitive:** GraphQL, localization, environments, richer field
   types/components, granular RBAC. (P1→P2)
5. **Differentiate:** ship the AI service (the "AI-native" promise), real-time
   collaboration, DAM. (P2)

> **Minimum to charge money:** the P0 block. Everything compiles and the CMS works;
> what's missing to *sell* it is payments, metering, deploy, email, monitoring,
> backups, and a security pass. That's the honest gap between "working MVP" and
> "product in the market."

---

## Quick reference — biggest gaps at a glance

| Gap | Priority | Effort | State |
|-----|----------|--------|-------|
| Stripe billing | P0 | XL | schema-ready, unbuilt |
| Usage metering (API/bandwidth) | P0 | L | limits defined, unmeasured |
| Production deploy + infra | P0 | L | local only |
| Transactional email at scale | P0 | S | Gmail SMTP (dev) |
| Observability | P0 | M | stdout logs only |
| Backups / DR | P0 | S | Supabase defaults |
| Security hardening (CORS, key rate-limit, 2FA) | P0 | M | partial |
| Automated tests | P0 | L | 0 in apps |
| GraphQL API | P1 | L | none |
| Full-text search | P1 | M | none |
| Scheduled publishing | P1 | M | none |
| Localization (i18n) | P1 | L | none |
| Content environments | P1 | L | none |
| Image transformations | P1 | M | none |
| Richer fields / components | P1 | M | 8 flat types |
| OpenAPI / API docs | P1 | M | prose only |
| Publish SDK | P1 | S | built, unpublished |
| Admin panel UI | P1 | L | in progress |
| SSO/SAML | P2 | L | flag only |
| AI service | P2 | XL | skeleton |
| Real-time collab | P2 | XL | none |
