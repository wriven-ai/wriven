import { WrivenError } from './errors';
import type {
  ClientOptions,
  Paginated,
  QueryOptions,
  WrivenClient,
  WrivenEntry,
} from './types';

const DEFAULT_BASE_URL = 'https://api.wriven.com';
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

/**
 * Create a Wriven delivery client. Isomorphic (Node 18+, browsers, edge) and
 * dependency-free. A `wrk_preview_…` token automatically returns drafts.
 */
export function createClient(options: ClientOptions): WrivenClient {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new WrivenError('No fetch implementation available — pass `fetch` in options.', 0, 'NO_FETCH');
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = Math.max(0, options.retries ?? DEFAULT_RETRIES);

  async function request<T>(path: string, query?: QueryOptions): Promise<T> {
    const url = `${baseUrl}/v1/projects/${options.projectId}/content/${path}${buildQuery(query)}`;
    const headers = { Authorization: `Bearer ${options.token}` };

    let lastError: WrivenError | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      // Honor a caller signal in addition to the timeout.
      const onAbort = () => controller.abort();
      query?.signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const res = await doFetch(url, {
          headers,
          signal: controller.signal,
          ...(query?.cache ? { cache: query.cache } : {}),
          // Next.js fetch extension — ignored by other runtimes.
          ...(query?.next ? ({ next: query.next } as RequestInit) : {}),
        });
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
        // Network/timeout/abort → retry, else give up.
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
      return request<WrivenEntry<TData>>(`${type}/${slug}`, query);
    },
    getEntries<TData = Record<string, unknown>>(type: string, query?: QueryOptions) {
      return request<Paginated<WrivenEntry<TData>>>(type, query);
    },
  };
}
