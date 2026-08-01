# 11 — Model A Build Plan (Hosted Dashboard + Delivery API)

Concrete, phased build plan for **Model A** from
[09 — Content Delivery & Plans](./09-content-delivery-and-plans.md): the hosted
SaaS where a customer authors in `app.wriven.com`, creates an API key, and pulls
content into their own site over HTTPS. No customer-side install.

State today: the **authoring half** exists (content types, entries, revisions,
media in `core_svc`; management routes in the gateway behind cookie auth). The
**delivery half** does not. This plan builds it.

Conventions to respect (from [07 — Conventions](./07-conventions.md), [02 — Architecture](./02-architecture.md)):
gateway is the only public edge; services are TCP microservices; no cross-service
FKs; DTOs/patterns/types live in `@wriven/contracts`; response envelope +
error-code shape already standardized.

---

## Phase 0 — Decisions & contracts (do first, ~0.5 day)

Lock these before code; they ripple through every later phase.

- **API version prefix:** all public delivery routes under **`/v1/`**. Frozen
  contract — the studio (doc 10) and customer code pin to it.
- **Public base path:** management stays where it is (cookie auth); delivery is a
  **separate route group** `/v1/projects/:projectId/...` with **token** auth.
- **Token format:** `wrk_<env>_<32+ url-safe random>` — `wrk_live_…` (read),
  `wrk_preview_…` (preview). Store **only** `sha256(token)` + a display `prefix`.
- **Token transport:** `Authorization: Bearer wrk_live_…`.
- **Delivery response shape:** reuse the standard envelope + `Paginated<T>`
  (already in `cms.types.ts`). Delivery entries return **`data` + system fields**,
  never internal author ids beyond what's needed.
- **Add to `@wriven/contracts`:** `ApiKeyView`, `CreateApiKeyDto`,
  `CreateApiKeyResult` (carries the raw token once), `DeliveryQueryDto`, and new
  `CORE_PATTERNS.API_KEY_*` + `CORE_PATTERNS.DELIVERY_*` message patterns.

**Acceptance:** contracts compile; patterns exported; no behavior yet.

---

## Phase 1 — `api_keys` table + service (core_svc) — *unblocks everything*

**Goal:** CRUD for project-scoped API keys, hash-on-create, show-once.

- **Schema** ([apps/core-service/src/db/schema/index.ts](../apps/core-service/src/db/schema/index.ts)) — the table from
  [09 §3](./09-content-delivery-and-plans.md): `id, workspaceId, projectId, name,
  tokenHash, prefix, scope (read|preview|manage), lastUsedAt, expiresAt,
  revokedAt, createdBy, createdAt`. Index on `tokenHash` (hot lookup) + on
  `projectId` (list).
- **Migration:** `pnpm db:core:generate && pnpm db:core:migrate`.
- **Service** `api-keys.service.ts` + `@MessagePattern(CORE_PATTERNS.API_KEY_*)`
  in a controller: `create` (generate raw token → return once, persist hash +
  prefix), `list` (never returns hash/raw), `revoke` (set `revokedAt`),
  `resolve(tokenHash)` (for the guard — returns `{projectId, workspaceId, scope,
  revoked, expired}` or null).

**Security:**
- Generate token with a CSPRNG (`crypto.randomBytes`). Raw token returned **only**
  from `create`, never stored, never logged.
- `tokenHash = sha256(raw)`; lookups are by hash. (sha256 is fine here — tokens
  are high-entropy random, not low-entropy passwords, so no bcrypt needed.)

**Acceptance:** create returns `wrk_live_…` once; DB stores only hash+prefix; list
hides secrets; revoke flips `revokedAt`; `resolve` works against a hash.

---

## Phase 2 — Token auth guard (gateway)

**Goal:** authenticate public delivery requests by API key and inject the scope so
`core_svc` controllers need **zero change** (they already take
`workspaceId`/`projectId`).

- **`ApiKeyGuard`** ([apps/api-gateway/src/auth/](../apps/api-gateway/src/auth/), beside the existing
  `jwt-auth.guard.ts`/`project.guard.ts`): read `Authorization: Bearer wrk_…` →
  `sha256` → call `CORE_PATTERNS.API_KEY_RESOLVE` → reject if missing/revoked/
  expired/scope-mismatch → attach `{projectId, workspaceId, scope}` to the request.
- **Inject downstream:** set the same `X-Workspace-Id`/`X-Project-Id` the cookie
  path already uses (via a `@CurrentProject`-style decorator), so the delivery
  controller calls the existing `ENTRY_LIST`/`ENTRY_GET` patterns unchanged.
- **Hot-path cache:** cache `resolve(tokenHash)` in-memory (or Redis later) with a
  short TTL (~30–60 s) so a busy site doesn't hit the DB per request. Invalidate
  on revoke (or accept the TTL lag).
- **`lastUsedAt`:** update lazily/async (debounced), never block the request.

**Security:** constant-time compare not required (hash lookup is exact match);
**do** rate-limit by key (Phase 8). Scope gate: a `read` key on a preview route →
403. Never echo the token in errors/logs.

**Acceptance:** valid key → request passes with correct scope headers; revoked/
expired/wrong-scope → 401/403; repeated calls hit cache not DB.

---

## Phase 3 — Content Delivery API (the product)

**Goal:** the read endpoints a customer site calls. Published-only, cacheable.

- **New public controller** `apps/api-gateway/src/delivery/delivery.controller.ts`,
  guarded by `ApiKeyGuard`, routes under `/v1/projects/:projectId/...`:
  ```
  GET /v1/projects/:projectId/content/:apiId          # list entries of a type
  GET /v1/projects/:projectId/content/:apiId/:slug     # one entry by slug
  GET /v1/projects/:projectId/media/:id                # resolve media → CDN URL
  ```
- **Read path:** new `CORE_PATTERNS.DELIVERY_LIST/DELIVERY_GET` in `core_svc`
  (or extend `EntriesService` with a `publishedOnly` flag) that **force
  `status = 'published'`** and project the requested fields.
- **Query params** (`DeliveryQueryDto`): `select=` (field projection),
  `filter[key]=` / `filter[key_gt]=` (uses the existing
  `content_entries_data_gin` index), `sort=-publishedAt`, `page`/`limit`
  (reuse `Paginated<T>`), `include=1..2` (expand `reference` fields via
  `FieldDef.refTypeId`, depth-limited).
- **Resolver guards:** unknown `apiId` → 404; `include` depth capped (e.g. ≤3) to
  bound query fan-out.

**Acceptance:** a `wrk_live_` key fetches only published entries of a project;
`select`/`filter`/`sort`/pagination work; references expand to `include` depth;
draft/archived never leak; cross-project key can't read another project.

---

## Phase 4 — Dashboard: API Keys page

**Goal:** UI to manage Phase 1 keys. The sidebar already has the **API Keys** item
([build-project-nav.ts](../apps/client/src/components/sidebar/builders/build-project-nav.ts)) and
permission `API_KEY_VIEW`.

- Page at `app/(dashboard)/w/[wsSlug]/p/[projSlug]/api-keys/page.tsx`: list keys
  (name, prefix, scope, lastUsed, created), **create** (dialog → name + scope →
  show raw token **once** with copy, warn it won't be shown again), **revoke**
  (confirm). Reuse existing dialog/table patterns + `projectApi`-style client.
- Add `apiKeyApi` to [lib/api.ts](../apps/client/src/lib/api.ts) (cookie auth — this is dashboard
  management, not delivery).

**Acceptance:** create → token shown once + copyable; reload → only prefix; revoke
removes it; a created key actually works against Phase 3.

---

## Phase 5 — CDN + cache invalidation (purge on publish)

**Goal:** make the Delivery API fast and cheap. Research-backed pattern:
**Surrogate-Key (cache-tag) headers + targeted purge on publish.**

- **Cache headers** on delivery responses: `Cache-Control: public, s-maxage=…,
  stale-while-revalidate=…` + a **`Surrogate-Key`** header tagging the response
  with the ids it depends on, e.g. `proj_<id> type_<apiId> entry_<id>`.
- **Purge on publish:** when `ENTRY_PUBLISH`/unpublish/delete fires, `core_svc`
  emits an event; a dispatcher calls the CDN purge API for the affected tags
  (`entry_<id>`, `type_<apiId>`, and list tags). Purge **by tag, not wildcard** —
  list endpoints carry the ids they include so they invalidate when any member
  changes.
- CDN choice: front `api.wriven.com` delivery paths with a tag-purge-capable CDN
  (Fastly surrogate keys, or Cloudflare cache-tags on the paid tier). Management +
  preview paths are **never** cached.

**Acceptance:** repeated GET of a published entry is a CDN hit; publishing an edit
purges just that entry + its lists; drafts/preview never cached.

---

## Phase 6 — Webhooks (publish → site rebuild)

**Goal:** the Jamstack loop — content change triggers the customer's ISR/rebuild.

- **`webhooks` table** (core_svc): `projectId, url, events[] (entry.published|
  entry.unpublished|entry.deleted), secret, active, createdBy`.
- **Dispatcher:** on the same publish events as Phase 5, POST a JSON payload to
  registered URLs.
- **Signing (security):** `X-Wriven-Signature: sha256=<hmac>` over the raw body
  using the per-webhook `secret`, plus `X-Wriven-Timestamp`. Customer verifies
  with **constant-time** compare and **rejects stale timestamps** (replay guard).
  Retry with backoff on non-2xx; cap retries.
- **Dashboard UI:** Project Settings → Webhooks (add URL + events, show secret
  once, delivery log later).

**Acceptance:** publish → signed POST hits the registered URL; bad signature is
rejectable by the receiver; retries on failure; customer's Next.js
`revalidatePath` fires.

---

## Phase 7 — Preview API (drafts)

**Goal:** let the customer's preview deploy read drafts.

- Same delivery controller/read path, but a **`wrk_preview_`** scoped key is
  allowed to pass `status=draft|published`. `ApiKeyGuard` enforces scope.
- **Never cached** (`Cache-Control: private, no-store`).
- Per-content-type **preview URL** setting (`https://site.com/preview?slug={slug}`)
  stored on the content type → dashboard "Open preview" button.

**Acceptance:** preview key returns drafts; read key on preview route → 403;
preview responses uncached.

---

## Phase 8 — Plans, metering, rate limits

**Goal:** enforce the tiers in [09 §5](./09-content-delivery-and-plans.md) and meter
the billable hot path.

- **`plan` on the workspace** (auth_svc): tier + limits (projects, members,
  requests/mo, bandwidth, storage, AI credits, feature flags).
- **Limit enforcement:** middleware/guards check the relevant cap before
  create-project / add-member / create-key, and feature flags gate webhooks /
  preview / localization.
- **Metering:** count delivery **requests + bandwidth per API key / project** at
  the gateway (the CDA is the billable signal). Aggregate to a usage counter;
  surface in the (currently mock) Usage + Billing pages.
- **Rate limiting:** per-key request rate limit at the gateway (protects the
  backend, enforces tier ceilings). Return `429` + `Retry-After`.

**Acceptance:** exceeding a plan limit is blocked with a clear error; usage page
shows real request/bandwidth numbers; per-key rate limit returns 429.

---

## Phase 9 — Media delivery (R2 → ImageKit)

**Goal:** turn stored R2 keys into transformable CDN URLs (the "keys only" rule
pays off here).

- Delivery media endpoint + entry `media` fields resolve `r2Key` → an **ImageKit**
  URL at runtime, honoring transform params (`?w=800&format=auto&q=80`).
- Upload path (dashboard): signed direct-to-R2 upload, persist key + dims/mime in
  `media_assets` (table exists).

**Acceptance:** a `media` field in a delivery response returns a working
transformable URL; resizing via query params works; DB still stores only keys.

---

## Phase 10 — Public integration guide (customer-facing docs)

**Goal:** the docs a customer reads to connect. New `doc/integration-guide.md`
(later promoted to public site):
quickstart, create a token, fetch examples (Next.js / Astro / fetch), filtering &
field selection, preview mode, webhooks/ISR. Update
[06 — API Reference](./06-api-reference.md) with every `/v1/...` route and
[08 — Status](./08-status.md) as phases ship.

---

## Suggested sequencing

**Ship-blocking core (MVP delivery):** Phase 0 → 1 → 2 → 3 → 4. After Phase 4 a
real external site can pull live published content with a dashboard-managed key —
that is a sellable product.

**Production-hardening:** 5 (CDN) → 6 (webhooks) → 7 (preview). Makes it
fast + Jamstack-native.

**Commercialize:** 8 (plans/metering) → 9 (media) → 10 (docs).

Keep [08 — Status](./08-status.md) in lockstep; document each table/endpoint in the
owning per-service doc as it lands (repo doc-maintenance rule).

---

## Sources

- [Fastly — API caching with surrogate keys](https://www.fastly.com/documentation/solutions/tutorials/full-site-delivery/enabling-api-caching-with-surrogate-keys/)
- [Granular cache invalidation for headless CMS](https://focusreactive.com/granular-cache-invalidation-for-headless-cms/)
- [Headless CMS content caching strategies](https://headlesscms.guide/guides/content-caching-strategies)
- [Contentful — Content Delivery API](https://www.contentful.com/developers/docs/references/content-delivery-api/)
- [Contentstack — API security essentials (tokens, CORS, signing)](https://www.contentstack.com/blog/all-about-headless/api-security-essentials-for-an-efficient-headless-cms)
- [Strapi — headless CMS security best practices 2026](https://strapi.io/blog/headless-cms-security)
