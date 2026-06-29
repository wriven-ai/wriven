# @wriven-ai/client

Official client for the [Wriven](https://wriven.com) headless CMS Content
Delivery API. Isomorphic (Node 18+, browsers, edge), typed, zero-dependency.

```bash
npm i @wriven-ai/client
```

```ts
import { createClient } from '@wriven-ai/client';

const wriven = createClient({
  projectId: 'YOUR_PROJECT_ID',          // dashboard → API Keys
  token: process.env.WRIVEN_TOKEN!,      // wrk_live_… (published) or wrk_preview_… (drafts)
});

// One entry by slug
const post = await wriven.getEntry('blog_post', 'hello-world', { include: 1 });

// A filtered, sorted, paginated list
const { items, total } = await wriven.getEntries('blog_post', {
  filter: { category: 'news' },
  sort: '-publishedAt',
  limit: 10,
});
```

## Typed entries

```ts
interface Post {
  title: string;
  body: unknown;            // ProseMirror JSON — render with @wriven-ai/react
  cover: { url: string } | null;
}

const post = await wriven.getEntry<Post>('blog_post', 'hello-world');
post.data.title; // string
```

## Options

| Option | Default | Notes |
|--------|---------|-------|
| `projectId` | — | required |
| `token` | — | required; scope decides published vs. drafts |
| `baseUrl` | `https://api.wriven.com` | self-hosted / regional override |
| `fetch` | global `fetch` | inject for older runtimes / tests |
| `timeoutMs` | `10000` | per-request timeout |
| `retries` | `2` | retries on network/5xx (reads only) |

## Query options

`select` · `filter[key]` · `sort` (`-` for desc) · `page` · `limit` · `include`
(0–3, expands references). `cache` / `next` pass through to the framework fetch
(e.g. Next.js ISR). Errors throw a typed `WrivenError` (`status`, `code`).

## Preview / drafts

Use a `wrk_preview_…` token — the API returns drafts automatically and marks
responses uncacheable.

MIT
