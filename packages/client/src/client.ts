import { WrivenError } from './errors';
import type {
  ClientOptions,
  Paginated,
  QueryOptions,
  WrivenClient,
  WrivenEntry,
} from './types';

const DEFAULT_BASE_URL = 'https://api.wriven.tech';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;

function buildQuery(query?: QueryOptions): string {
  if (!query) return '';
  const params = new URLSearchParams();
  if (query.select) {
    params.set('select', Array.isArray(query.select) ? query.select.join(',') : query.select);
  }
  if (query.sort) params.set('sort', query.sort);
  if (query.page != null) params.set('page', String(query.page));
  if (query.limit != null) params.set('limit', String(query.limit));
  if (query.include != null) params.set('include', String(query.include));
  if (query.filter) {
    for (const [key, value] of Object.entries(query.filter)) {
      params.set(`filter[${key}]`, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Extended fetch init that includes Next.js-specific cache control options. */
interface FetchInit extends RequestInit {
  next?: { revalidate?: number | false; tags?: string[] };
}

/**
 * Create a Wriven delivery client. Isomorphic (Node 18+, browsers, edge) and
 * dependency-free. A `wrk_preview_…` token automatically returns drafts.
 */
export function createClient(options: ClientOptions): WrivenClient {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const baseFetch = options.fetch ?? globalThis.fetch;
  if (typeof baseFetch !== 'function') {
    throw new WrivenError('No fetch implementation available — pass `fetch` in options.', 0, 'NO_FETCH');
  }
  // Bind the global fetch to globalThis — an unbound reference throws "Illegal
  // invocation" in browsers. A caller-supplied fetch is used as-is.
  const doFetch: typeof fetch = options.fetch ? baseFetch : baseFetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = Math.max(0, options.retries ?? DEFAULT_RETRIES);

  async function request<T>(path: string, query?: QueryOptions): Promise<T> {
    const url = `${baseUrl}/v1/projects/${options.projectId}/content/${path}${buildQuery(query)}`;
    const headers = { Authorization: `Bearer ${options.token}` };

    let lastError: WrivenError | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      // Honor a caller signal in addition to the timeout (incl. one already aborted).
      const onAbort = () => controller.abort();
      if (query?.signal?.aborted) controller.abort();
      else query?.signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const fetchOptions: FetchInit = {
          headers,
          signal: controller.signal,
        };
        if (query?.cache) fetchOptions.cache = query.cache;
        if (query?.next) fetchOptions.next = query.next;
        const res = await doFetch(url, fetchOptions as RequestInit);
        const body = await res.json().catch(() => null);

        if (!res.ok || (body && body.success === false)) {
          const code = body?.error?.code ?? 'REQUEST_FAILED';
          const message = body?.error?.message ?? `Request failed with status ${res.status}.`;
          // Retry server errors; surface client errors immediately.
          if (res.status >= 500 && attempt < maxRetries) {
            lastError = new WrivenError(message, res.status, code);
            await sleep(250 * 2 ** attempt);
            continue;
          }
          throw new WrivenError(message, res.status, code);
        }
        // Gateway wraps responses as { success, data }.
        return (body?.data ?? body) as T;
      } catch (err) {
        if (err instanceof WrivenError) throw err;
        // A caller-initiated abort must never be retried — surface it at once.
        if (query?.signal?.aborted) {
          throw new WrivenError('Request aborted by caller.', 0, 'ABORTED');
        }
        // Network/timeout → retry, else give up.
        lastError = new WrivenError(
          err instanceof Error ? err.message : 'Network request failed.',
          0,
          'NETWORK_ERROR',
        );
        if (attempt < maxRetries) {
          await sleep(250 * 2 ** attempt);
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timer);
        query?.signal?.removeEventListener('abort', onAbort);
      }
    }
    throw lastError ?? new WrivenError('Request failed.', 0);
  }

  return {
    getEntry<TData = Record<string, unknown>>(type: string, slug: string, query?: QueryOptions) {
      return request<WrivenEntry<TData>>(
        `${encodeURIComponent(type)}/${encodeURIComponent(slug)}`,
        query,
      );
    },
    async getEntries<TData = Record<string, unknown>>(type: string, query?: QueryOptions) {
      const result = await request<Paginated<WrivenEntry<TData>>>(
        encodeURIComponent(type),
        query,
      );
      return { ...result, hasNextPage: result.page * result.limit < result.total };
    },
    async getAllEntries<TData = Record<string, unknown>>(type: string, query?: QueryOptions) {
      const all: WrivenEntry<TData>[] = [];
      for await (const entry of this.iterateEntries<TData>(type, query)) all.push(entry);
      return all;
    },
    async *iterateEntries<TData = Record<string, unknown>>(type: string, query?: QueryOptions) {
      // Page size caps at the API maximum; `limit` on a pagination helper would
      // mean "stop early", which callers express by breaking out of the loop.
      const pageSize = 100;
      for (let page = 1; ; page++) {
        const result = await request<Paginated<WrivenEntry<TData>>>(
          encodeURIComponent(type),
          { ...query, page, limit: pageSize },
        );
        for (const entry of result.items) yield entry;
        if (page * result.limit >= result.total) return;
      }
    },
  };
}
