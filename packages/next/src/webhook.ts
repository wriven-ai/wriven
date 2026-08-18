import type { WrivenWebhookPayload } from './types';
import { verifyWrivenSignature } from './verify';

/** A path to revalidate: plain string, or with an explicit route type. */
export type RevalidatePath =
  | string
  | { path: string; type?: 'page' | 'layout' };

/** Minimal shape of `next/cache` consumed here (kept peer-dep friendly). */
interface NextCache {
  revalidatePath: (path: string, type?: 'page' | 'layout') => void;
  revalidateTag: (tag: string) => void;
}

export interface WebhookRouteOptions {
  /** The webhook's signing secret (dashboard → Project Settings → Webhooks). */
  secret: string;
  /**
   * Map an event to the paths/tags to revalidate. Return nothing to skip.
   *
   * IMPORTANT (Next.js 15/16): pages prerendered at build time never register
   * their fetch tags in the runtime cache — a tag-only return value is a
   * silent no-op for them. List the pages each content type powers via
   * `paths` and use `tags` only as a complement:
   *
   * ```ts
   * // app/api/wriven/route.ts
   * export const { POST } = createWebhookRoute({
   *   secret: process.env.WRIVEN_WEBHOOK_SECRET!,
   *   revalidate: (p) => ({
   *     paths: [
   *       '/blog',
   *       { path: '/blog/[slug]', type: 'page' }, // dynamic segment — needs `type`
   *     ],
   *     tags: ['proj_…'],
   *   }),
   * });
   * ```
   *
   * A dynamic-segment string like `/blog/[slug]` passed without `type` is
   * treated as a literal URL and matches nothing — always wrap dynamic
   * patterns in `{ path, type: 'page' }`.
   */
  revalidate?: (
    payload: WrivenWebhookPayload,
  ) => { paths?: RevalidatePath[]; tags?: string[] } | void;
  /** Arbitrary side effect per event (logging, queueing, etc.). */
  onEvent?: (payload: WrivenWebhookPayload) => void | Promise<void>;
  /** @internal Test seam — overrides the `next/cache` implementation. */
  cache?: NextCache;
}

/**
 * Build a Next.js App Router route handler that verifies a Wriven webhook and
 * revalidates the affected ISR paths/tags. Re-export `POST` from a route file.
 */
export function createWebhookRoute(options: WebhookRouteOptions) {
  async function POST(request: Request): Promise<Response> {
    const raw = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    if (!verifyWrivenSignature(raw, headers, options.secret)) {
      return new Response('Invalid signature', { status: 401 });
    }

    let payload: WrivenWebhookPayload;
    try {
      payload = JSON.parse(raw) as WrivenWebhookPayload;
    } catch {
      return new Response('Invalid payload', { status: 400 });
    }

    const target = options.revalidate?.(payload);
    if (target && (target.paths?.length || target.tags?.length)) {
      // Prefer the injected seam; otherwise import lazily so `next` stays a
      // peer dependency and isn't bundled.
      const cache: NextCache =
        options.cache ?? ((await import('next/cache')) as unknown as NextCache);
      for (const entry of target.paths ?? []) {
        if (typeof entry === 'string') cache.revalidatePath(entry);
        else cache.revalidatePath(entry.path, entry.type);
      }
      for (const tag of target.tags ?? []) cache.revalidateTag(tag);
    }

    await options.onEvent?.(payload);
    return Response.json({ ok: true, event: payload.event });
  }

  return { POST };
}
