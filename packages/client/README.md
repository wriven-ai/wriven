# @wriven-ai/client

[![npm](https://img.shields.io/npm/v/@wriven-ai/client)](https://www.npmjs.com/package/@wriven-ai/client)
[![license](https://img.shields.io/npm/l/@wriven-ai/client)](./LICENSE)
[![types](https://img.shields.io/badge/types-included-blue)](#typed-entries)

Official client for the [Wriven](https://wriven.com) headless CMS **Content
Delivery API**. Fetch published content from any JS/TS runtime — Node 18+,
browsers, edge, Bun, Deno.

- **Zero dependencies** — one small isomorphic module, ESM + CJS
- **Fully typed** — type your entry `data` with generics
- **Resilient by default** — timeouts, exponential-backoff retries on 5xx and
  network errors, typed errors, caller-friendly aborts

```bash
npm i @wriven-ai/client
pnpm add @wriven-ai/client
```

> Rendering the rich-text body in React? Add
> [`@wriven-ai/react`](https://www.npmjs.com/package/@wriven-ai/react).
> Building on Next.js? Add
> [`@wriven-ai/next`](https://www.npmjs.com/package/@wriven-ai/next)
> for webhook → ISR revalidation.

## Table of contents

- [Quickstart](#quickstart)
- [Authentication](#authentication)
- [API](#api)
  - [`createClient(options)`](#createclientoptions)
  - [`getEntry(type, slug, query?)`](#getentrytype-slug-query)
  - [`getEntries(type, query?)`](#getentriestype-query)
- [Query options](#query-options)
- [Typed entries](#typed-entries)
- [Pagination](#pagination)
- [Reference expansion](#reference-expansion)
- [Errors](#errors)
- [Timeouts, retries, and aborts](#timeouts-retries-and-aborts)
- [Next.js caching](#nextjs-caching)
- [Preview / drafts](#preview--drafts)
- [Self-hosting](#self-hosting)
- [FAQ](#faq)

## Quickstart

```ts
import { createClient } from '@wriven-ai/client';

const wriven = createClient({
  projectId: 'YOUR_PROJECT_ID',        // dashboard → Project → API Keys
  token: process.env.WRIVEN_TOKEN!,    // see Authentication below
});

// One entry by slug (reference fields expanded one level)
const post = await wriven.getEntry('blog_post', 'hello-world', { include: 1 });

// A filtered, sorted, paginated list
const { items, total } = await wriven.getEntries('blog_post', {
  filter: { category: 'news' },
  sort: '-publishedAt',
  limit: 10,
});
```

## Authentication

Delivery tokens are project-scoped API keys created in the dashboard
(**Project → API Keys**). Send one as the client `token`; the scope decides
what you can see:

| Token prefix | Scope | Sees |
|--------------|-------|------|
| `wrk_live_…` | read | published entries only |
| `wrk_preview_…` | preview | published **+ draft** entries |
| `wrk_admin_…` | manage | published **+ draft** entries (management key) |

A token can never read another project — requests to a mismatched
`projectId` are rejected with `FORBIDDEN`.

## API

### `createClient(options)`

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `projectId` | `string` | — | **required** — the project the token belongs to |
| `token` | `string` | — | **required** — delivery token (`wrk_…`) |
| `baseUrl` | `string` | `https://api.wriven.tech` | override for self-hosted / regional |
| `fetch` | `typeof fetch` | global `fetch` | inject for tests or older runtimes |
| `timeoutMs` | `number` | `10000` | per-attempt timeout |
| `retries` | `number` | `2` | extra attempts on network errors / 5xx |

Throws immediately if no `fetch` implementation is available.

### `getEntry(type, slug, query?)`

```ts
const post = await wriven.getEntry<Post>('blog_post', 'hello-world', {
  select: 'title,body',   // project only these data fields
  include: 1,             // expand reference fields (0–3 levels)
});
```

Resolves to a single [`WrivenEntry`](#typed-entries). Throws `WrivenError`
with `code: 'NOT_FOUND'` (404) if no entry with that slug is visible to the
token's scope.

### `getEntries(type, query?)`

```ts
const page1 = await wriven.getEntries<Post>('blog_post', { limit: 20, page: 1 });
// → { items: WrivenEntry<Post>[], page: 1, limit: 20, total: 137 }
```

Resolves to a `Paginated<WrivenEntry<TData>>` — `{ items, page, limit, total }`.

## Query options

Both methods accept the same options, mirroring the Delivery API's query
parameters (validated server-side):

| Option | Type | Server rule | Example |
|--------|------|-------------|---------|
| `select` | `string \| string[]` | comma-separated data field keys | `['title', 'slug']` → `?select=title,slug` |
| `filter` | `Record<string, string \| number \| boolean>` | **equality only**, on `data` fields; nested operators rejected with `VALIDATION_ERROR` | `{ category: 'news' }` → `?filter[category]=news` |
| `sort` | `string` | one of `publishedAt` (default), `createdAt`, `updatedAt`, `slug`; prefix `-` for descending | `'-publishedAt'` |
| `page` | `number` | `≥ 1` | `2` |
| `limit` | `number` | `1–100`, default `20` | `50` |
| `include` | `number` | `0–3` — depth to expand `reference` fields | `1` |
| `cache` | `RequestCache` | passed through to `fetch` | `'force-cache'` |
| `next` | `{ revalidate?, tags? }` | passed through to `fetch` (Next.js) | `{ tags: ['blog'] }` |
| `signal` | `AbortSignal` | per-request cancellation | see [aborts](#timeouts-retries-and-aborts) |

## Typed entries

`data` holds the entry's user-defined fields — type it with a generic:

```ts
import type { WrivenEntry, WrivenMedia } from '@wriven-ai/client';

interface Post {
  title: string;
  body: unknown;                 // ProseMirror JSON → render with @wriven-ai/react
  cover: WrivenMedia | null;     // media fields are resolved objects
  tags: string[];                // select fields
}

const post = await wriven.getEntry<Post>('blog_post', 'hello-world');
post.data.title;         // string
post.cover?.url;         // nope — `cover` lives inside `data`
post.data.cover?.url;    // string | undefined
```

`WrivenEntry` shape:

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | entry id |
| `type` | `string` | content type apiId, e.g. `"blog_post"` |
| `slug` | `string` | unique within the type |
| `data` | `TData` | the entry's fields (you type this) |
| `publishedAt` | `string \| null` | ISO timestamp; `null` for drafts |
| `updatedAt` | `string` | ISO timestamp |

`media` fields are always resolved server-side to `WrivenMedia`
(`{ id, url, alt, width, height, mime }`) — never raw asset ids.

## Pagination

Most of the time you don't paginate at all — ask for what you need:

```ts
// Everything (fetches pages internally)
const posts = await wriven.getAllEntries<Post>('blog_post');

// A UI page
const { items, hasNextPage } = await wriven.getEntries<Post>('blog_post', { page: 1, limit: 10 });
```

Streaming large sets entry by entry (100 per fetch, lazily):

```ts
for await (const post of wriven.iterateEntries<Post>('blog_post')) render(post);
```

Walking pages yourself is just `page` + `hasNextPage`:

```ts
const res = await wriven.getEntries<Post>('blog_post', { page: 2, limit: 10 });
if (res.hasNextPage) loadMore();
```

## Reference expansion

`reference` fields hold entry ids by default. Pass `include` (0–3) to expand
them inline to nested entries:

```ts
// author: reference → blog_author
const post = await wriven.getEntry('blog_post', 'hello-world', { include: 1 });
post.data.author;        // WrivenEntry<AuthorData> | string
                         // (unpublished/deleted refs stay as raw ids)
```

Unresolved references remain the raw id string — check with
`typeof post.data.author === 'string'`.

## Errors

Every failure throws a typed `WrivenError`:

```ts
import { isWrivenError } from '@wriven-ai/client';

try {
  await wriven.getEntry('blog_post', 'missing');
} catch (err) {
  if (isWrivenError(err)) {
    err.status;  // 404 — HTTP status (0 for network/timeout/abort)
    err.code;    // 'NOT_FOUND' — machine-readable code
    err.message; // human-readable message
  }
}
```

Common API codes: `UNAUTHORIZED` (401, bad token) · `FORBIDDEN` (403, token ↔
project mismatch or plan limit) · `NOT_FOUND` (404) · `VALIDATION_ERROR`
(422, bad query params) · `RATE_LIMITED` (429). SDK-side codes:
`NETWORK_ERROR` (status 0) and `ABORTED` (caller cancelled).

## Timeouts, retries, and aborts

- **Timeout** — each attempt gets `timeoutMs` (default 10 s). A timeout counts
  as a network error and is retried.
- **Retries** — network errors and `5xx` responses are retried up to `retries`
  times (default 2) with exponential backoff (250 ms · 2^attempt). `4xx`
  responses are never retried.
- **Abort** — pass an `AbortSignal` per request. A caller abort **never
  retries**; it rejects immediately with `code: 'ABORTED'`.

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 5_000);
await wriven.getEntries('blog_post', { signal: controller.signal });
```

## Next.js caching

`cache` and `next` pass straight through to `fetch`, so ISR works naturally:

```ts
// Fetch with a tag, then purge it from a webhook (see @wriven-ai/next)
const posts = await wriven.getEntries('blog_post', {
  next: { revalidate: 60, tags: ['blog'] },
});
```

Pair with
[`createWebhookRoute`](https://www.npmjs.com/package/@wriven-ai/next) calling
`revalidateTag('blog')` on `entry.published` for instant cache invalidation.

## Preview / drafts

Use a `wrk_preview_…` (or `wrk_admin_…`) token — drafts are returned
automatically, no extra flags. Draft responses are marked uncacheable by the
API. Keep preview tokens server-side only (e.g. a `/api/preview` route), never
in shipped client code.

## Self-hosting

```ts
const wriven = createClient({
  projectId: process.env.WRIVEN_PROJECT_ID!,
  token: process.env.WRIVEN_TOKEN!,
  baseUrl: 'https://cms.example.com', // your gateway origin
});
```

## FAQ

**Is it isomorphic?** Yes — no Node APIs; uses the platform `fetch`
(injectable via the `fetch` option). Node ≥ 18, all evergreen browsers, edge
runtimes, Bun, Deno.

**ESM or CJS?** Both. `exports` maps `.mjs` / `.cjs` with per-format type
declarations, so `import` and `require` both work with correct types.

**Can I write content with it?** No — the Delivery API is strictly read-only.
Content is authored in the Wriven dashboard.

**Why is my filter rejected?** Filters are exact-match on `data` fields and
must be flat strings/numbers/booleans — operators like
`filter[rating][gte]=4` are intentionally unsupported.

MIT
