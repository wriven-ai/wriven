/**
 * Public types for the Wriven delivery client. Intentionally decoupled from the
 * server's internal `@wriven/contracts` so the SDK has a stable, self-contained
 * published API surface.
 */

/** A delivery entry. `data` is the entry's fields, typed by the caller. */
export interface WrivenEntry<TData = Record<string, unknown>> {
  id: string;
  /** Content type apiId, e.g. "blog_post". */
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

/** Resolved shape of a `media` field (or array member) in delivery responses. */
export interface WrivenMedia {
  id: string;
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  mime: string | null;
}

/** Query parameters for list/get reads (mirrors the Delivery API). */
export interface QueryOptions {
  /** Field keys to return; string or array → `select=a,b`. */
  select?: string | string[];
  /** Equality filters on data fields → `filter[key]=value`. */
  filter?: Record<string, string | number | boolean>;
  /** Sort key; prefix `-` for descending, e.g. `-publishedAt`. */
  sort?: string;
  page?: number;
  limit?: number;
  /** Depth (0–3) to expand reference fields inline. */
  include?: number;
  /** Pass-through fetch cache control (e.g. Next.js). */
  cache?: RequestCache;
  /** Pass-through framework fetch options (e.g. Next.js `next.revalidate`). */
  next?: { revalidate?: number | false; tags?: string[] };
  /** Per-request AbortSignal. */
  signal?: AbortSignal;
}

export interface ClientOptions {
  /** Project id (from the dashboard → API Keys). */
  projectId: string;
  /** A delivery token: `wrk_live_…` (published) or `wrk_preview_…` (drafts). */
  token: string;
  /** Delivery API base URL. Default: https://api.wriven.com */
  baseUrl?: string;
  /** Custom fetch (SSR/edge/tests). Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Per-request timeout in ms. Default 10000. */
  timeoutMs?: number;
  /** Retry attempts on network/5xx errors (reads only). Default 2. */
  retries?: number;
}

export interface WrivenClient {
  /** A single published (or draft, with a preview token) entry by slug. */
  getEntry<TData = Record<string, unknown>>(
    type: string,
    slug: string,
    query?: QueryOptions,
  ): Promise<WrivenEntry<TData>>;
  /** A paginated list of entries of a type. */
  getEntries<TData = Record<string, unknown>>(
    type: string,
    query?: QueryOptions,
  ): Promise<Paginated<WrivenEntry<TData>>>;
}
