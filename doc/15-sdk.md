# 15 — Client SDK & Package Strategy

Plan for the consumer-facing SDK ecosystem. Goal: a **strong, scalable
foundation** — typed, isomorphic, dual-format, versioned — that can grow into
framework adapters without rework. Backend (Delivery API, keys, preview,
webhooks) is already done; this is purely the consumer DX layer.

## Naming & package layout

Public scope is **`@wriven-ai`** (matches `@wriven-ai/studio` in doc/10). The
internal Nx scope `@wriven/*` stays private (never published).

| Package | Purpose | Phase |
|---------|---------|-------|
| **`@wriven-ai/client`** | Core delivery client — `createClient`, `getEntry(s)`, querying, preview. Isomorphic (Node / browser / edge). | 1 |
| `@wriven-ai/react` | Render helpers — `<WrivenRichText>` for the ProseMirror body (text + inline media nodes), hooks. | 2 |
| `@wriven-ai/next` | Next.js glue — ISR `revalidatePath` webhook handler, preview/draft mode wiring. | 3 |
| `@wriven-ai/management` | (Later, optional) write/admin API client. **Separate** from the read client — never overload `client`. | later |

This mirrors the proven Prismic/Sanity/Storyblok split: one core `client`, then
per-framework siblings. Start with **`@wriven-ai/client`** only.

## Where it lives — the monorepo (not a separate repo)

A new **publishable Nx library**:
```
libs/sdk/                      # → publishes as @wriven-ai/client
  src/index.ts
  package.json
  tsconfig.lib.json
```
Scaffold: `pnpm nx g @nx/js:lib sdk --publishable --importPath=@wriven-ai/client`.

**Why monorepo:** the SDK reuses the Delivery response types from
`@wriven/contracts` (`DeliveryEntry`, `Paginated`, `WebhookPayload`, …) via
**type-only imports** — so SDK types can never drift from the real API. Consumers
only ever see the published, built package; the monorepo is invisible to them.

**Critical rule:** import from contracts with `import type { … }` ONLY. Contracts
pulls NestJS/class-validator (server deps) — `import type` is erased at build, so
none of that ships. If any value import sneaks in, the browser bundle bloats →
caught by the size check (below). Consider a types-only entry in contracts later
if this gets fragile.

## Build & publishing foundation (2026 best practice)

The thing most SDKs get wrong is dual ESM/CJS + types. Lock it down from day one:

- **Bundler: `tsup`** (or `tsdown`, its Rolldown-based successor — faster, same
  DX). Default for new TS libs in 2026; correct dual-output defaults.
  `tsup src/index.ts --format esm,cjs --dts` → `index.mjs` / `index.cjs` /
  per-format `.d.ts` + `.d.cts`.
- **`exports` map** with `types` **first**, then `import`, then `require`:
  ```jsonc
  {
    "type": "module",
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.mjs",
        "require": "./dist/index.cjs"
      }
    },
    "main": "./dist/index.cjs",
    "module": "./dist/index.mjs",
    "types": "./dist/index.d.ts",
    "sideEffects": false,
    "files": ["dist"]
  }
  ```
  Per-format declarations (`.d.ts` + `.d.cts`) so TS resolves correct types for
  both `import` and `require` (TS 4.7+).
- **Validate before publish** — `prepublishOnly` runs both:
  - **`publint`** — lints the `exports`/build for packaging mistakes.
  - **`@arethetypeswrong/cli`** — confirms ESM **and** CJS consumers get correct
    types. These two catch ~all dual-package bugs.
- **`sideEffects: false`** + ESM → tree-shakeable.
- **No Node-only built-ins** in the core client (no `node:crypto`, `fs`). Use the
  global `fetch` (Node 18+, browsers, edge) so one build runs everywhere. Allow a
  `fetch` injection option for older/custom runtimes.
- **Bundle-size budget** in CI (e.g. `size-limit`) — guards against accidental
  contracts/value imports.

## Core client design (`@wriven-ai/client`)

Isomorphic, zero-dependency, typed. Shape:

```ts
import { createClient } from '@wriven-ai/client';

const wriven = createClient({
  projectId: 'proj_…',
  token: process.env.WRIVEN_TOKEN!,   // wrk_live_… or wrk_preview_…
  // baseUrl?     defaults to https://api.wriven.com
  // preview?     boolean — or just use a preview token
  // fetch?       inject a custom fetch (SSR/edge/test)
});

const post  = await wriven.getEntry('blog_post', 'hello-world', { include: 1 });
const posts = await wriven.getEntries('blog_post', {
  filter: { category: 'news' }, sort: '-publishedAt', limit: 10,
});
```

Foundation decisions that enable scale:
- **Typed responses** off `@wriven/contracts` (`DeliveryEntry`, `Paginated<T>`).
  Later: optional generic `getEntries<T>()` + a codegen path that emits per-project
  types from the content model (Sanity/Hygraph do this — big DX win, Phase 4).
- **Query builder = a typed options object** (`select`, `filter`, `sort`, `page`,
  `limit`, `include`) mapped to query params — matches doc/06. No bespoke DSL.
- **Versioned API** — pin `/v1` in the client; bump deliberately. The API path
  already carries the version, so a `@wriven-ai/client@2` can target `/v2`
  without breaking `@1`.
- **Errors** — throw a typed `WrivenError` (status + code + message), mirroring
  the gateway envelope. Predictable for consumers.
- **Resilience** — built-in retry with backoff on 5xx/network (off for 4xx),
  request timeout, both configurable. (Don't retry non-idempotent — reads only.)
- **Preview** — a preview token flips to drafts automatically (server already
  keys off scope); also expose `client.preview()` returning a draft-scoped clone.
- **Caching hints** — pass through `next: { revalidate }`/`cache` options when a
  framework fetch is used, so Next.js consumers get ISR for free.

## Versioning & release

- **SemVer**, independent per package. `@wriven-ai/client` versions on its own
  cadence (decoupled from the app).
- **Nx Release** (`pnpm nx release`) for version + changelog + publish, or
  Changesets if you want PR-driven changelogs. Pick one; wire into CI later.
- **`provenance`** on publish (`npm publish --provenance`) once CI exists — supply
  chain trust, now standard.
- Tag pre-1.0 releases `next`/`beta` while the API surface settles; reach `1.0`
  only when the client API is stable.

## Build order

1. **Phase 1 — `@wriven-ai/client`**: scaffold publishable lib; tsup dual build;
   `exports` + publint + are-the-types-wrong; `createClient` + `getEntry(s)` +
   querying + preview + typed errors + retry. Ship `0.1.0`/`next`.
2. **Phase 2 — `@wriven-ai/react`**: `<WrivenRichText>` renderer for body JSON
   (handles the inline media `image` nodes from doc/13) + a `useEntry` helper.
3. **Phase 3 — `@wriven-ai/next`**: webhook → `revalidatePath` handler, draft mode
   + preview wiring, typed `fetch` cache options.
4. **Phase 4 — typed codegen** (optional, high DX): a CLI that reads a project's
   content types and emits `.d.ts` so `getEntries('blog_post')` returns a fully
   typed entry.

## Definition of done (Phase 1)

- `npm i @wriven-ai/client` works in Node, browser, edge, ESM **and** CJS.
- `publint` + `are-the-types-wrong` clean. Types resolve for `import` and
  `require`. Tree-shakeable, no server deps in the bundle.
- Matches every example already in `/docs` (delivery-api, querying, preview) and
  the Project ID + token surfaced on the API Keys page.

## Sources (build/publish foundation)

- [TypeScript ESM/CJS publishing pitfalls (Liran Tal)](https://lirantal.com/blog/typescript-in-2025-with-esm-and-cjs-npm-publishing)
- [Dual publishing with tsup + are-the-types-wrong (johnnyreilly)](https://johnnyreilly.com/dual-publishing-esm-cjs-modules-with-tsup-and-are-the-types-wrong)
- [Publishing npm packages — complete guide 2026 (reintech)](https://reintech.io/blog/publishing-npm-packages-complete-guide-2026)
- [Best TypeScript build tools 2026 (PkgPulse)](https://www.pkgpulse.com/guides/best-typescript-build-tools-2026)
- [tsup vs tsdown vs unbuild 2026 (PkgPulse)](https://www.pkgpulse.com/guides/tsup-vs-tsdown-vs-unbuild-typescript-library-bundling-2026)
