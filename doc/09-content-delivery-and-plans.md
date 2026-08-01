# 09 — Content Delivery, Website Integration & Plans

How a Wriven customer connects their own website/app to Wriven and pulls content,
what they can control from the dashboard, and the pricing tiers that gate it.

This is the **product/architecture spec** for the "consume content" half of the
platform. The "author content" half (content types, entries, media) already
exists in `core_svc` — see [core-service](./core-service/core-service.md). What is
described here is mostly **not yet built**; the build order is in §6.

---

## 1. The two integration models (pick one to start)

There are exactly two industry patterns for "how does a customer's site connect".
They are not mutually exclusive long-term, but **start with Model A**.

### Model A — Hosted dashboard + Delivery API (Contentful / Sanity hosted / Hygraph)

The customer **never installs Wriven on their site**. They:

1. Author content in the Wriven dashboard at `app.wriven.com`.
2. Create an **API key** (scoped to one project) in the dashboard.
3. Fetch content from their site/app over HTTPS using that key:

```ts
// customer's Next.js site — nothing of "Wriven" runs here except a fetch
const res = await fetch(
  'https://api.wriven.com/v1/projects/PROJECT_ID/content/blog_post?status=published',
  { headers: { Authorization: 'Bearer wrk_live_xxx' } },
);
const { items } = await res.json();
```

- **"They connect at a route on their site"** → in this model the route is on
  *our* side (`api.wriven.com/v1/...`), not theirs. Their site just calls it.
- This is the **default for a SaaS**. Lowest friction, nothing to host, works with
  any stack (Next, Astro, mobile, Go backend, anything that can do HTTP).
- **Recommended first delivery surface.**

### Model B — Embedded Studio at the customer's `/wriven` route (Sanity Studio / Payload `/admin`)

The customer mounts the Wriven authoring UI **inside their own app**, e.g.
`mysite.com/wriven`, by installing an npm package:

```ts
// app/wriven/[[...index]]/page.tsx in the CUSTOMER's Next.js app
import { WrivenStudio } from '@wriven-ai/studio';
import config from '../../wriven.config';
export default function Page() {
  return <WrivenStudio config={config} />;
}
```

- The studio is a React app that talks to the same `api.wriven.com` backend; it
  just lives on *their* domain instead of `app.wriven.com`.
- This is what the phrase **"control their content at the `/wriven` route"**
  describes. It is a **premium / DX feature**, not the foundation.
- Much more work (publishable, versioned, themeable React bundle + config schema +
  auth handshake from a 3rd-party origin). **Defer to a later phase.**

> **Decision:** Build **Model A** now (Delivery API + dashboard-managed API keys).
> Treat **Model B** (`@wriven-ai/studio` embeddable) as a roadmap item once the
> hosted product is real. Most "Sanity-like" perceived value is actually Model A +
> a good dashboard; the embedded studio is differentiation, not table stakes.

---

## 2. The API surface — three distinct APIs

Every mature headless CMS splits its HTTP surface into three. Wriven should too.
Today everything goes through the single gateway with a **session cookie** (the
dashboard). Add two **token-authenticated** public surfaces.

| API | Audience | Auth | Reads | Writes | Cacheable |
|-----|----------|------|-------|--------|-----------|
| **Management API (CMA)** | The dashboard (and power users) | Session cookie / management token | all statuses | yes | no |
| **Content Delivery API (CDA)** | Customer's production site | **read token** (`wrk_live_…`) | `published` only | no | **yes, hard** |
| **Preview API (CPA)** | Customer's preview/staging build | **preview token** (`wrk_preview_…`) | `draft` + `published` | no | no |

Why split CDA vs CPA:

- The **CDA only ever returns `published` entries**, so its responses are
  immutable until a publish event → it can sit behind a CDN with long TTLs.
- The **Preview API returns drafts**, must never be cached, and is used by the
  customer's preview deploys (Next.js draft mode / ISR on-demand).

The Management API is what your existing `core_svc` controllers already are
(`CONTENT_TYPE_*`, `ENTRY_*`). The CDA/CPA are **new read-only endpoints** that
query the same `content_entries` table with a `status` filter and token auth.

### Concrete CDA endpoints (v1)

```
GET /v1/projects/:projectId/content/:apiId            # list entries of a type
GET /v1/projects/:projectId/content/:apiId/:slug      # one entry by slug
GET /v1/projects/:projectId/content/:apiId?<filters>  # filter/sort/paginate
GET /v1/projects/:projectId/media/:id                 # resolve media -> CDN URL
```

Query params (mirror Contentful/Strapi conventions):

- `select=title,body` — field projection (return only requested keys; cheaper).
- `filter[field]=value`, `filter[views_gt]=100` — uses the existing
  `content_entries_data_gin` JSONB index.
- `sort=-publishedAt`, `page`, `limit` — already have `Paginated<T>`.
- `include=2` — resolve `reference` fields N levels deep (the `FieldDef.refTypeId`
  link). Sanity calls this GROQ joins; keep it simple: depth-limited expansion.

> **GraphQL later, REST first.** REST + field selection covers 95% of needs and is
> trivially cacheable. A GraphQL endpoint over the same resolver is a phase-2 add.

---

## 3. API keys — the missing table

There is **no `api_keys` table today** (confirmed: nothing in `core_svc`,
gateway, or contracts references it). This is the single biggest gap for "connect
your website". It belongs in `core_svc`, scoped to a project.

```ts
// apps/core-service/src/db/schema/index.ts  (new table)
export const apiKeys = coreSchema.table('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  projectId: uuid('project_id').notNull(),
  name: text('name').notNull(),                 // "Production site", "Preview"
  // store ONLY a hash, never the raw key (same rule as passwords / R2 keys)
  tokenHash: text('token_hash').notNull(),      // sha-256 of the raw token
  prefix: text('prefix').notNull(),             // "wrk_live_a1b2" shown in UI
  scope: text('scope').notNull().default('read'), // read | preview | manage
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Rules (security — read carefully):

- **Show the raw token exactly once**, at creation, then never again. Store only
  `sha256(token)`. This is the same discipline as the existing "R2 keys only,
  never URLs" decision.
- Token format: `wrk_<env>_<random>` e.g. `wrk_live_<32 hex>`,
  `wrk_preview_<32 hex>`. The `prefix` column holds the first ~12 chars for
  display ("Production · wrk_live_a1b2…").
- **Verification path is hot** (every CDA request). Hash the incoming token, look
  up by hash with an index, check `revokedAt is null` and `expiresAt`. Cache the
  lookup in memory/Redis with a short TTL so the DB isn't hit per request.
- The gateway resolves the token → `{ projectId, workspaceId, scope }` and injects
  the existing `X-Workspace-Id` / `X-Project-Id` headers downstream, so
  `core_svc` controllers **need no change** — they already take those ids.
- `scope` gates which API the key may call (a `read` key hitting the Preview API →
  403).

---

## 4. What the customer controls from the dashboard

This is the "how much can they do" answer. Group it by scope level (matches the
existing sidebar: workspace → project → feature).

### Workspace level
- Members & roles (exists — `members-api`), billing/plan, usage stats, workspace
  settings, delete. *(Plan, billing, usage are currently mock — see §5/§6.)*

### Project level — the content control surface
| Capability | Status | Notes |
|-----------|--------|-------|
| **Content modeling** — define content types & fields | ✅ schema | `text, richtext, number, boolean, date, media, select, reference` already in `FieldDef`. UI = schema builder. |
| **Authoring** — create/edit entries, draft→publish, archive | ✅ schema | `content_entries.status` + publish flow exist. |
| **Versioning** — view/restore revisions | ✅ schema | `content_revisions` exists; needs UI. |
| **Media library** — upload, alt text, reuse | ✅ schema | `media_assets` (R2 keys); needs upload + ImageKit transform URLs. |
| **References** — link entries to entries | ✅ schema | `FieldDef.refTypeId`; delivery `include=` expands them. |
| **API keys** — create/scope/revoke read & preview tokens | 🔲 **missing** | §3. The thing that makes the site "connect". |
| **Webhooks** — notify the site on publish to trigger rebuild/ISR | 🔲 missing | §3-adjacent; HMAC-signed. See below. |
| **Preview URLs** — point a content type at the site's preview route | 🔲 missing | Stored per content type: `https://site.com/preview?slug={slug}`. |
| **Localization** — multiple locales per entry | 🔲 future | Plan-gated; schema change (locale column or per-locale `data`). |
| **Scheduled publish** — publish at a future time | 🔲 future | `publishedAt` in future + a worker. |
| **Roles/RBAC on content** — editor vs viewer vs admin | 🟡 seam | `useCan()` stub on frontend; backend roles exist at member level. |

### Webhooks (publish → rebuild)
The bridge that makes a static site update when content changes:

- Customer registers a URL (`https://site.com/api/revalidate`) + which events
  (`entry.published`, `entry.unpublished`, `entry.deleted`).
- On publish, `core_svc` emits an event; a dispatcher POSTs an **HMAC-SHA256
  signed** payload (signature in `X-Wriven-Signature`, with a timestamp to reject
  replays). Customer verifies with constant-time compare.
- Customer's handler calls Next.js `revalidatePath()` / on-demand ISR. This is the
  standard Jamstack loop and what makes "edit in Wriven → site updates" feel live.

---

## 5. Pricing plans

Headless CMS pricing uses three levers, usually combined: **per-seat**,
**usage-based** (API requests + bandwidth + asset storage), and **per-project /
environment**. Recommendation for Wriven: a **tiered plan with usage caps**, with
the AI generation budget as a distinctive 4th lever (Wriven is AI-native).

Gate on the dimensions you can actually meter cheaply: **projects, members, API
requests/mo, bandwidth/mo, asset storage, AI credits/mo, and feature flags**
(webhooks, preview, localization, embedded studio, custom roles).

| Lever | Free | Pro | Team | Enterprise |
|-------|------|-----|------|-----------|
| Price | $0 | ~$19/mo flat | ~$99/mo + seats | custom |
| Workspaces | 1 | 1 | unlimited | unlimited |
| Projects | 1 | 3 | 10 | unlimited |
| Members / seats | 2 | 5 | 15 (+$/seat) | custom |
| Content entries | 1k | 25k | 100k | custom |
| **CDA requests / mo** | 100k | 1M | 5M | custom + overage |
| **Bandwidth / mo** | 10 GB | 100 GB | 500 GB | custom |
| Asset storage | 1 GB | 25 GB | 100 GB | custom |
| **AI credits / mo** | small trial | included pool | larger pool | custom |
| Revisions retained | 10 | 50 | unlimited | unlimited |
| Webhooks | — | ✅ | ✅ | ✅ |
| Preview API | — | ✅ | ✅ | ✅ |
| Localization | — | — | ✅ | ✅ |
| Custom roles (RBAC) | — | — | ✅ | ✅ + SSO |
| Embedded Studio (Model B) | — | — | ✅ | ✅ |
| Support | community | email | priority | SLA + onboarding |

Notes / rationale:

- **Free tier mirrors the market** (Contentful/Sanity both give ~100k API
  requests + ~10 GB free) — it's the standard acquisition funnel; match it.
- **The CDA is the metered hot path.** Meter requests + bandwidth at the gateway
  per API key; that is your usage signal *and* your overage billing basis.
- **AI credits are the Wriven-specific lever** — the product is positioned
  AI-native, so a per-plan generation budget (text/image) is a natural, defensible
  paid axis competitors don't have.
- **Per-seat only kicks in at Team+** — keep Free/Pro flat so solo devs and small
  teams don't hit a seat wall (Sanity's per-seat model is its most-complained-about
  axis; avoid it early).
- Enforcement = a `plan` record on the workspace + middleware that checks the
  relevant limit before the action and on a metered counter. Today plan/billing is
  **mock** — see §6.

---

## 6. Build order (roadmap)

Smallest path from "authoring works" to "a real website pulls live content".

1. **`api_keys` table + service** (`core_svc`) — schema (§3), create/list/revoke
   message patterns, hash-on-create, show-once response. *Unblocks everything.*
2. **Token auth guard** (gateway) — `Authorization: Bearer wrk_…` → resolve key →
   inject `X-Project-Id`/`X-Workspace-Id` + `scope`. Cache lookups.
3. **Content Delivery API** (gateway → `core_svc` read path) — the `GET /v1/...`
   endpoints in §2, `published`-only, with `select` / `filter` / `sort` /
   pagination over the existing GIN index.
4. **Dashboard: API Keys page** — the sidebar already has the `API Keys` item;
   wire create/copy-once/revoke UI to step 1.
5. **CDN + cache headers** on the CDA — `Cache-Control` + surrogate keys per
   project/type; purge on publish.
6. **Webhooks** (§4) — registration table + HMAC-signed dispatch on publish; the
   Jamstack rebuild loop.
7. **Preview API** (`wrk_preview_` scope) — same read path, drafts allowed, no
   cache; + per-content-type preview URL setting.
8. **Plans & metering** — `plan` on workspace, usage counters at the gateway,
   limit enforcement; replace mock billing UI.
9. **Media delivery** — R2 key → ImageKit transform URL resolution in the CDA
   (`?w=800&format=auto`).
10. **(Later) `@wriven-ai/studio`** — the embedded Model B route. Only after the
    hosted product is solid.
11. **(Later) GraphQL + on-demand AI fields.**

---

## 7. Documentation to keep

Per the repo's doc-maintenance rule, when these features land, document them here
and in the per-service docs. Specifically:

- This file (`09`) — keep §1–§6 current as decisions firm up.
- New **`doc/06-api-reference.md`** entries for every `/v1/...` CDA/CPA endpoint
  (method, token scope, params, response).
- **`doc/core-service/`** — the `api_keys` table + delivery read path.
- A new **`doc/integration-guide.md`** aimed at *customers* (not internal): "How to
  connect your Next.js/Astro/mobile app to Wriven" — quickstart, token creation,
  fetch examples, webhooks, preview mode. This becomes public docs later.
- **`doc/08-status.md`** — flip each roadmap item ✅ as it ships.

---

## Sources

Research backing the patterns and pricing above:

- [Contentful — Content Delivery API](https://www.contentful.com/developers/docs/references/content-delivery-api/)
- [Sanity — Top headless CMS platforms 2026](https://www.sanity.io/top-5-headless-cms-platforms-2026)
- [Strapi — Headless CMS security best practices 2026](https://strapi.io/blog/headless-cms-security)
- [Contentstack — API security essentials for headless CMS](https://www.contentstack.com/blog/all-about-headless/api-security-essentials-for-an-efficient-headless-cms)
- [Headless CMS pricing comparison 2026 (Sanity/Contentful/Strapi)](https://www.buildmvpfast.com/api-costs/cms)
- [ElmapiCMS — Headless CMS pricing 2026](https://elmapicms.com/mp/headless-cms-pricing)
- [Headless CMS architecture guide 2025](https://blog.rakshastack.com/headless-cms-architecture/)
</invoke>
