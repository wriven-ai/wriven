# Wriven Display — Frontend Integration Guide

This folder is a **complete, self-contained guide** for building a frontend that
displays content managed by **Wriven** (an AI-native headless CMS). It is written
for an AI coding agent (or a developer) that will create a **React + Vite** project
that fetches and renders public Wriven content — **products, blog posts, team
members**, etc.

> **You do not need access to the Wriven source code to use this guide.** Everything
> required to build the display app is documented here. Read these files in order.

---

## What you are building

A **public, read-only website** (no login, no auth UI, no complexity) that pulls
**published** content from a Wriven project over HTTP and renders it. Think of it
like a storefront, a blog, or a marketing site whose content is authored in the
Wriven dashboard and served by the Wriven **Delivery API**.

Examples of what the site might contain:

- **Products** — catalog + detail pages
- **Blog posts** — article list + full article rendering (rich text + images)
- **Team members** — staff/author profiles
- **Categories / tags** — taxonomy used to filter the above

---

## How Wriven works (30-second version)

1. Content is authored in the **Wriven dashboard** (a separate hosted app).
2. Each **project** exposes a **read-only Delivery API**.
3. You authenticate with a **project-scoped API key** (`wrk_live_…`).
4. Your frontend calls `GET /v1/projects/{projectId}/content/{apiId}` and renders
   the JSON. That's it. **Nothing of Wriven runs inside your app** — just `fetch`.

A `read` key returns **published content only** and is **safe to expose in a
browser bundle** (exactly like Contentful/Sanity delivery tokens). See
[02-getting-credentials.md](./02-getting-credentials.md) for the security model.

---

## Install the Wriven SDK

Wriven ships an official SDK, **published on npm** (`0.1.0`):

```bash
npm install @wriven-ai/client      # core delivery client (typed, isomorphic, zero-dep)
npm install @wriven-ai/react        # optional: <WrivenRichText> renderer
```

```ts
import { createClient } from '@wriven-ai/client';
const wriven = createClient({
  projectId: import.meta.env.VITE_WRIVEN_PROJECT_ID,
  token: import.meta.env.VITE_WRIVEN_TOKEN, // wrk_live_…
});
const posts = await wriven.getEntries('blog_post', { sort: '-publishedAt', limit: 10 });
```

Prefer the SDK. If you'd rather skip the dependency, [05-client-setup.md](./05-client-setup.md)
also includes a tiny typed `fetch` helper (~50 lines, zero-dep) with the identical
API — useful as a no-install fallback or to understand what the SDK does under the hood.

---

## File map (read in order)

| # | File | What it covers |
|---|------|----------------|
| — | [README.md](./README.md) | This index + quickstart |
| 1 | [01-what-is-wriven.md](./01-what-is-wriven.md) | Headless-CMS model, delivery-only integration, architecture, why no auth is needed |
| 2 | [02-getting-credentials.md](./02-getting-credentials.md) | Get `projectId` + API key from the dashboard, scopes, security rules, base URL, verify with `curl`, CORS |
| 3 | [03-delivery-api.md](./03-delivery-api.md) | Endpoints, query params (`select`/`filter`/`sort`/`page`/`limit`/`include`), response envelope, entry shape, error codes, pagination, caching |
| 4 | [04-content-model.md](./04-content-model.md) | Content types, field types, how `media` / `richtext` / `reference` fields resolve in responses, modeling guidance |
| 5 | [05-client-setup.md](./05-client-setup.md) | The typed `fetch` client (full code), env config, Vite proxy option, the official `@wriven-ai/*` SDK reference |
| 6 | [06-rendering.md](./06-rendering.md) | React rendering patterns: typed data, media, **rich text renderer (full vendored component)**, references, dates, loading/error/empty states |
| 7 | [07-content-type-examples.md](./07-content-type-examples.md) | Ready-to-use content types: `product`, `blog_post`, `team_member` — field definitions + sample data + component sketches |
| 8 | [08-vite-build-guide.md](./08-vite-build-guide.md) | Step-by-step: scaffold the Vite app, deps, folder structure, router, data hooks, pages, run, deploy |
| 9 | [09-troubleshooting.md](./09-troubleshooting.md) | FAQ: 401/403/404, CORS, empty results, media not resolving, blank rich text, rate limits |

---

## Quickstart (TL;DR)

```bash
# 1. Scaffold
npm create vite@latest wriven-display -- --template react-ts
cd wriven-display && npm install
npm install react-router-dom

# 2. Env — fill these in from the Wriven dashboard (see 02-getting-credentials.md)
cat > .env.local <<'EOF'
VITE_WRIVEN_BASE_URL=http://localhost:5000
VITE_WRIVEN_PROJECT_ID=<your project id>
VITE_WRIVEN_TOKEN=<wrk_live_... read key>
EOF

# 3. Drop in the client from 05-client-setup.md -> src/lib/wriven.ts

# 4. Fetch published entries of a content type
const posts = await wriven.list('blog_post', { sort: '-publishedAt', limit: 10 });

# 5. Run
npm run dev
```

Then read [08-vite-build-guide.md](./08-vite-build-guide.md) for the full build.

---

## Conventions used in this guide

- All code is **TypeScript + React + Vite**.
- HTTP examples use the global `fetch` (works in browser, Node 18+, edge).
- Every Delivery API response is wrapped in `{ success, data }` / `{ success, error }`.
- Timestamps are ISO 8601 strings (or `null`).
- Field names like `blog_post`, `publishedAt`, `wrk_live_…` are literal — match them exactly.
