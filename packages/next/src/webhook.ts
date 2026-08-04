import { verifyWrivenSignature } from './verify';
import type { WrivenWebhookPayload } from './types';

export interface WebhookRouteOptions {
  /** The webhook's signing secret (dashboard → Project Settings → Webhooks). */
  secret: string;
  /**
   * Map an event to the paths/tags to revalidate. Return nothing to skip.
   * e.g. `(p) => ({ paths: [\`/blog/\${p.entry.slug}\`, '/blog'] })`
   */
  revalidate?: (
    payload: WrivenWebhookPayload,
  ) => { paths?: string[]; tags?: string[] } | void;
  /** Arbitrary side effect per event (logging, queueing, etc.). */
  onEvent?: (payload: WrivenWebhookPayload) => void | Promise<void>;
}

/**
 * Build a Next.js App Router route handler that verifies a Wriven webhook and
 * revalidates the affected ISR paths/tags. Re-export `POST` from a route file:
 *
 * ```ts
 * // app/api/wriven/route.ts
 * import { createWebhookRoute } from '@wriven-ai/next';
 * export const { POST } = createWebhookRoute({
 *   secret: process.env.WRIVEN_WEBHOOK_SECRET!,
 *   revalidate: (p) => ({ paths: [`/blog/${p.entry.slug}`, '/blog'] }),
 * });
 * ```
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
      // Imported lazily so `next` stays a peer dependency and isn't bundled.
      // Cast to a minimal shape so the build is independent of Next's version.
      const cache = (await import('next/cache')) as unknown as {
        revalidatePath: (path: string) => void;
        revalidateTag: (tag: string) => void;
      };
      for (const path of target.paths ?? []) cache.revalidatePath(path);
      for (const tag of target.tags ?? []) cache.revalidateTag(tag);
    }

    await options.onEvent?.(payload);
    return Response.json({ ok: true, event: payload.event });
  }

  return { POST };
}
