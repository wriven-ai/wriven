# 10 — Embedded Studio (`@wriven-ai/studio` at the customer's `/wriven` route)

Plan for **Model B** from [09 — Content Delivery & Plans](./09-content-delivery-and-plans.md):
the customer mounts the Wriven authoring UI **inside their own app** at e.g.
`mysite.com/wriven`, by installing an npm package. This is the Sanity Studio /
Payload `/admin` pattern.

> **Read this first:** the embedded studio is **a client of the Management API**,
> not a replacement for it. It renders editor UI on the customer's domain and
> talks to `api.wriven.com`. Therefore **everything in doc 09 §2/§3 (the API +
> token auth) is still a prerequisite.** Choosing the `/wriven` route does not
> remove API work — it *adds* a frontend + a cross-origin auth handshake + an
> origin allowlist on top of it.

---

## 1. What the customer installs

```ts
// CUSTOMER's Next.js app:  app/wriven/[[...index]]/page.tsx
'use client';
import { WrivenStudio } from '@wriven-ai/studio';
import config from '../../wriven.config';

export default function StudioPage() {
  return <WrivenStudio config={config} basePath="/wriven" />;
}
```

```ts
// CUSTOMER's wriven.config.ts
import { defineConfig } from '@wriven-ai/studio';

export default defineConfig({
  projectId: 'proj_abc123',
  apiHost: 'https://api.wriven.com',
  // schema (content types) is pulled from the API at runtime — no local schema file
  theme: { accent: '#000' }, // optional
});
```

- The package is a **client-only React component library** that mounts anywhere
  (Next app-router client component, Vite, CRA). It owns its own sub-routing under
  `basePath`.
- It does **not** ship content schema — it fetches the project's content types
  from the API on load. (Sanity ships schema-as-code; Wriven keeps schema in the
  DB, so the studio is simpler: runtime-driven.)

---

## 2. The hard problem: cross-origin auth

The dashboard (`app.wriven.com`) authenticates with an **httpOnly session cookie +
CSRF** — that works because it is same-origin with the API. The embedded studio
runs on **`mysite.com`**, a different origin. Third-party cookies to
`api.wriven.com` are blocked by modern browsers (Safari ITP, Chrome 3p-cookie
deprecation). **So the studio cannot use the cookie auth.** It must use
**bearer tokens**, minted by a login handshake.

### The handshake (Sanity-style popup + `postMessage`)

```
1. Studio loads on mysite.com/wriven. Checks studio storage for a token. None.
2. Studio opens a popup → app.wriven.com/studio-login?project=proj_abc&origin=https://mysite.com
3. User authenticates on app.wriven.com  (existing cookie auth — SAME origin, works).
4. app.wriven.com server checks: is `origin` in proj_abc's allowed-origins list?
      - no  → show error, refuse.
      - yes → mint a SHORT-LIVED studio JWT { sub: userId, projectId, role, exp ~15m }.
5. The login page calls  window.opener.postMessage({ token, refresh }, "https://mysite.com")
      (targetOrigin pinned to the exact origin — never "*").
6. Studio receives token, closes popup, stores it, calls api.wriven.com with
      Authorization: Bearer <studio jwt>.  CORS allows mysite.com.
7. Refresh: token short-lived; refresh via a silent hidden-iframe/popup re-handshake
      or a refresh token kept in studio storage.
```

Security rules (non-negotiable):

- **`postMessage` targetOrigin must be the exact registered origin**, never `*`.
  On the receiving side, verify `event.origin` equals `app.wriven.com`.
- The mint endpoint **must** validate the requesting `origin` against the
  project's allowlist (§3) **server-side** before issuing a token.
- Studio JWT is **project-scoped and role-scoped** — it can only touch that one
  project, with that member's role. Short TTL (~15 min) + refresh.
- Studio tokens are a **distinct token class** from the CDA `wrk_live_` read keys
  (doc 09 §3). Read keys = machine, long-lived, content read. Studio tokens =
  human, short-lived, management scope. Don't conflate.

> This is the single biggest piece of new work and the main reason Model B is a
> later phase. It is its own auth surface.

---

## 3. Per-project origin allowlist (CORS + handshake gate)

Customer registers the domains their studio runs on. Used by **both** the CORS
layer and the token-mint gate.

```ts
// new table in core_svc (or auth_svc — wherever project settings live)
export const allowedOrigins = coreSchema.table('allowed_origins', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull(),
  origin: text('origin').notNull(),          // "https://mysite.com" (scheme+host+port, exact)
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- Gateway CORS becomes **dynamic per project** — reflect `Origin` only if it is in
  the project's allowlist (don't use a static `*` or single env origin for the
  studio API paths).
- Dashboard UI: a "Studio domains" section in **Project Settings** to add/remove
  origins. (The existing project settings page is the natural home.)

---

## 4. Packaging the editor — the big refactor

Today the editing UI lives in `apps/client` as **Next.js app-router pages** using
server components, `next/navigation`, the Zustand store, and the **cookie-based**
`api.ts`. None of that can ship inside a customer's bundle. To package it, the
editor must become **framework-agnostic, client-only React**:

| Today (apps/client) | For the studio package |
|---------------------|------------------------|
| Next app-router pages + server components | Pure client React components, no RSC |
| `next/navigation` (`useRouter`/`usePathname`) | Router-agnostic; internal router under `basePath` |
| `api.ts` with httpOnly cookie + CSRF | **Token-injected** API client (bearer from §2), passed via context |
| Zustand store wired to dashboard session | Self-contained studio state, seeded from config |
| Tailwind v4 global theme tokens | Scoped styles (CSS layers / prefix) so it can't fight the host app's CSS |

Two ways to organize:

- **(A) Shared core lib, two shells.** Extract the editor (content-type builder,
  entry editor, media library, revisions) into a publishable lib
  (`libs/studio-core` → `@wriven-ai/studio`). Both `apps/client` (dashboard) and
  the embeddable package render the **same** components, differing only in the
  injected API client + router + auth. **Recommended** — one editor, no fork.
- **(B) Separate codebase.** Faster to start, guarantees drift and double
  maintenance. Avoid.

**Practical consequence for *now*:** even before building Model B, write the
`apps/client` editor pages as **portable client components** (no business logic in
server components, API access through an injectable client, no hard `next/*`
imports inside editor components). That makes the future extraction cheap instead
of a rewrite.

### Distribution

- Publish under the existing npm scope **`@wriven-ai`** (see [01 — Overview](./01-overview.md)).
- Bundle with a library bundler (tsup / Vite library mode); `react` + `react-dom`
  as **peerDependencies**.
- Strict **semver** — it runs inside customers' builds, so breaking changes are
  expensive. Pin an API version (`/v1`) the studio targets.

---

## 5. Build order for Model B

Prereqs (from doc 09 — must exist first): the Management API, token auth, project
scoping. Then:

1. **Make the `apps/client` editor portable** — client-only components, injectable
   token API client, no `next/*` inside editor components. (Do this *as* you build
   the dashboard editor, not after.)
2. **Origin allowlist** — table (§3) + Project Settings UI + dynamic CORS on the
   gateway for studio API paths.
3. **Studio token mint + handshake** — `app.wriven.com/studio-login` page,
   server-side origin check, short-lived project-scoped JWT, `postMessage` return,
   refresh path. (§2 — the core lift.)
4. **Extract `@wriven-ai/studio`** — shared-core lib (option A), token API client,
   internal router with `basePath`, scoped styles, runtime schema fetch.
5. **`defineConfig` + bundle + publish** to `@wriven-ai` (peer-dep react).
6. **Customer quickstart docs** — the `app/wriven/[[...index]]/page.tsx` snippet,
   config, domain registration, auth flow. (Goes in the public integration guide,
   doc 09 §7.)
7. **Plan-gate it** — embedded studio is a Team+ feature (doc 09 §5).

---

## 6. Honest recommendation

- The `/wriven` embedded studio is **real differentiation** but it is a **phase-2+
  feature**: it needs the whole API (doc 09) *plus* a second auth system *plus* a
  package extraction. It is the most expensive single feature on the roadmap.
- **Sequence:** ship **Model A** (hosted dashboard + Delivery API) first — that is
  a complete, sellable product. While building the dashboard editor, follow §4's
  portability rules so the studio extraction later is a packaging job, not a
  rewrite.
- Do **not** start Model B by forking the dashboard. The moment you have two
  editor codebases you have lost.

---

## Sources

- [Sanity — embedded Studio model / top platforms 2026](https://www.sanity.io/top-5-headless-cms-platforms-2026)
- [Contentstack — API security essentials (token + CORS)](https://www.contentstack.com/blog/all-about-headless/api-security-essentials-for-an-efficient-headless-cms)
- [Strapi — headless CMS security best practices 2026](https://strapi.io/blog/headless-cms-security)
