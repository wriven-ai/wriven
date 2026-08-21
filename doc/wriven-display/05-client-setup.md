# 05 — Client setup (the "install Wriven npm" step)

## The official SDK (recommended)

Wriven's SDK is **published on npm** (`@wriven-ai/client@0.2.x`):

| Package | What it does |
|---------|--------------|
| `@wriven-ai/client` | `createClient()`, `getEntry()`, `getEntries()`, `getAllEntries()` (auto-pagination), `iterateEntries()` (async generator), `isWrivenError()` — typed, isomorphic, zero-dep; `Paginated` carries a computed `hasNextPage` |
| `@wriven-ai/react` | `<WrivenRichText>` renderer for rich-text fields |
| `@wriven-ai/next` | Next.js webhook + signature verification (not needed for Vite) |

```bash
npm install @wriven-ai/client        # core
npm install @wriven-ai/react          # optional: rich-text renderer
```

```ts
import { createClient } from '@wriven-ai/client';
const wriven = createClient({
  projectId: import.meta.env.VITE_WRIVEN_PROJECT_ID,
  token: import.meta.env.VITE_WRIVEN_TOKEN,     // wrk_live_…
});
const posts = await wriven.getEntries('blog_post', { sort: '-publishedAt', limit: 10 });
```

The SDK adds typed responses, retries on 5xx, a request timeout, and a typed
`WrivenError`. Use it.

---

## The typed `fetch` client (no-dependency alternative)

Prefer to skip the dependency? The helper below is ~50 lines, zero deps, and has
the **exact same API as `@wriven-ai/client`** (`getEntries` / `getEntry` /
`QueryOptions` / `WrivenError`) — useful as a no-install fallback, or just to see
what the SDK does under the hood.

---

## The typed client (copy this into your project)

Create **`src/lib/wriven.ts`**:

```ts
// src/lib/wriven.ts
// Minimal, typed Wriven Delivery API client.
// API-compatible with @wriven-ai/client so you can swap later without changes.

export interface WrivenEntry<TData = Record<string, unknown>> {
  id: string;
  type: string;
  slug: string;
  data: TData;
  publishedAt: string | null;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface WrivenMedia {
  id: string;
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  mime: string | null;
}

export interface QueryOptions {
  /** Field keys to return → `select=a,b`. string | string[] */
  select?: string | string[];
  /** Equality filters → `filter[key]=value`. */
  filter?: Record<string, string | number | boolean>;
  /** Sort key; prefix `-` for descending, e.g. `-publishedAt`. */
  sort?: string;
  page?: number;
  /** Page size. Default 20, max 100. */
  limit?: number;
  /** Depth (0–3) to expand `reference` fields inline. */
  include?: number;
  /** Per-request AbortSignal. */
  signal?: AbortSignal;
}

/** Thrown for any non-success response or transport failure. */
export class WrivenError extends Error {
  readonly status: number; // HTTP status (0 for network failures)
  readonly code: string;   // machine error code from the envelope
  constructor(message: string, status: number, code = 'REQUEST_FAILED') {
    super(message);
    this.name = 'WrivenError';
    this.status = status;
    this.code = code;
  }
}

const BASE_URL = (import.meta.env.VITE_WRIVEN_BASE_URL ?? '').replace(/\/$/, '');
const PROJECT_ID = import.meta.env.VITE_WRIVEN_PROJECT_ID ?? '';
const TOKEN = import.meta.env.VITE_WRIVEN_TOKEN ?? '';

if (!BASE_URL || !PROJECT_ID || !TOKEN) {
  // Fail loud in dev if env is missing; in prod this skips (Vite inlines '' ).
  console.warn(
    '[wriven] Missing env: set VITE_WRIVEN_BASE_URL, VITE_WRIVEN_PROJECT_ID, VITE_WRIVEN_TOKEN',
  );
}

/**
 * The Delivery API path. Public surface is `/v1/projects/…` (the dashboard's
 * management API shares the same `/v1` root). If EVERY request 404s, your Wriven
 * gateway predates
 * the global-prefix fix and serves these at `/api/v1/v1/projects/…` instead —
 * change this line to that path (or, better, update Wriven).
 */
const CONTENT_BASE = `${BASE_URL}/v1/projects/${PROJECT_ID}/content`;

function buildQuery(q?: QueryOptions): string {
  if (!q) return '';
  const p = new URLSearchParams();
  if (q.select) p.set('select', Array.isArray(q.select) ? q.select.join(',') : q.select);
  if (q.sort) p.set('sort', q.sort);
  if (q.page != null) p.set('page', String(q.page));
  if (q.limit != null) p.set('limit', String(q.limit));
  if (q.include != null) p.set('include', String(q.include));
  if (q.filter) for (const [k, v] of Object.entries(q.filter)) p.set(`filter[${k}]`, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function request<T>(path: string, query?: QueryOptions): Promise<T> {
  const url = `${CONTENT_BASE}/${path}${buildQuery(query)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: query?.signal,
    });
  } catch (err) {
    throw new WrivenError(err instanceof Error ? err.message : 'Network request failed.', 0, 'NETWORK_ERROR');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success === false) {
    const code = body?.error?.code ?? 'REQUEST_FAILED';
    const message = body?.error?.message ?? `Request failed with status ${res.status}.`;
    throw new WrivenError(message, res.status, code);
  }
  return (body?.data ?? body) as T;
}

/** List published entries of a content type. */
export function getEntries<TData = Record<string, unknown>>(
  type: string,
  query?: QueryOptions,
): Promise<Paginated<WrivenEntry<TData>>> {
  return request<Paginated<WrivenEntry<TData>>>(encodeURIComponent(type), query);
}

/** Get a single published entry by slug. */
export function getEntry<TData = Record<string, unknown>>(
  type: string,
  slug: string,
  query?: QueryOptions,
): Promise<WrivenEntry<TData>> {
  return request<WrivenEntry<TData>>(
    `${encodeURIComponent(type)}/${encodeURIComponent(slug)}`,
    query,
  );
}

/** Convenience namespace (mirrors the SDK's `client.getEntries/getEntry`). */
export const wriven = { getEntries, getEntry };
```

### Using it

```ts
import { wriven, type WrivenEntry } from '@/lib/wriven';

// define a TS interface that matches your content type's fields
interface ProductData {
  name: string;
  price: number;
  description: unknown;          // richtext (ProseMirror JSON)
  image: { url: string; alt: string | null } | null;
  category: string;
  featured: boolean;
}

const { items, total } = await wriven.getEntries<ProductData>('product', {
  filter: { category: 'shoes' },
  sort: '-publishedAt',
  limit: 12,
});

const product = await wriven.getEntry<ProductData>('product', 'running-shoe', { include: 1 });
```

---

## Env config recap

`.env.local`:

```bash
VITE_WRIVEN_BASE_URL=http://localhost:5000
VITE_WRIVEN_PROJECT_ID=<project id>
VITE_WRIVEN_TOKEN=wrk_live_…
```

- These are inlined at build time by Vite.
- Restart `npm run dev` after changing `.env.local`.
- For production builds, provide the same vars to your build environment
  (e.g. Vercel/Netlify project env vars). They end up in the bundle — that's fine for
  a `read` key.

---

## Optional: Vite dev proxy (skip CORS during dev)

Not required (CORS is enabled on the gateway), but useful to avoid preflights and
keep the origin tidy. In `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // anything hitting /wriven-api on the dev server is forwarded to the gateway
      '/wriven-api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/wriven-api/, ''),
      },
    },
  },
});
```

If you use the proxy, set `VITE_WRIVEN_BASE_URL=/wriven-api` in dev so the browser
calls same-origin `/wriven-api/v1/projects/…` and Vite forwards it. (You'll still
want the real base URL for production builds.)

---

## Using the published `@wriven-ai/client`

Already on npm — swap the vendored helper for it directly. The official API:

```ts
import { createClient } from '@wriven-ai/client';

const wriven = createClient({
  projectId: import.meta.env.VITE_WRIVEN_PROJECT_ID,
  token: import.meta.env.VITE_WRIVEN_TOKEN,       // wrk_live_… or wrk_preview_…
  baseUrl: import.meta.env.VITE_WRIVEN_BASE_URL,  // optional, defaults to https://api.wriven.tech
  // fetch?, timeoutMs?, retries?
});

const posts = await wriven.getEntries('blog_post', { sort: '-publishedAt', limit: 10 });
const post  = await wriven.getEntry('blog_post', 'launching-wriven', { include: 1 });
```

`getEntries` / `getEntry` signatures and the `QueryOptions` keys match the client
above exactly. The official client also adds: automatic retry on 5xx/network,
request timeout, AbortSignal support, and Next.js `fetch` cache pass-through
(`cache`, `next` options). For a Vite SPA you don't need those extras.

The rich-text renderer from `@wriven-ai/react`:

```tsx
import { WrivenRichText } from '@wriven-ai/react';
<WrivenRichText value={entry.data.body} />
```

Install it with `npm install @wriven-ai/react`. Prefer to skip the dependency?
The vendored equivalent is in [06-rendering.md](./06-rendering.md) — same code.

Next: [06-rendering.md](./06-rendering.md) — rendering entries, media, and rich text.
