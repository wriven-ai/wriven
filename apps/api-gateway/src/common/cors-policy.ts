/**
 * CORS policy decision, extracted from main.ts so the routing rule is spec'd.
 *
 * Two policies:
 * 1. Delivery API (`/v1/projects/:projectId/content|media/…`) — browser-fetched
 *    from ANY origin (Contentful/Sanity CDA model). Reflect the origin;
 *    credentials OFF — these routes use Bearer API keys, never cookies.
 * 2. Management + admin (everything else) — exact-origin allowlist from
 *    CORS_ORIGINS with credentials (credentials need a specific origin,
 *    never `*`).
 *
 * The prefix `/v1/projects/` alone is NOT enough to classify a request as
 * delivery: the cookie-authenticated management routes for project members,
 * invitations, and project get/rename/delete live under the same prefix
 * (`/v1/projects/:projectId`, `/v1/projects/:projectId/members`, …) and must
 * keep the allowlist + credentials policy — otherwise the browser blocks the
 * client's credentialed fetches to them.
 */

export interface CorsOptions {
  /** `true` reflects the request origin; `false` makes cors error the request. */
  origin: boolean;
  /** Whether `Access-Control-Allow-Credentials` is emitted. */
  credentials: boolean;
}

export function resolveCorsPolicy(
  path: string,
  origin: string,
  allowlist: readonly string[],
): CorsOptions {
  const isDelivery =
    /^\/v1\/projects\/[^/]+\/(content|media)(\/|$)/.test(path);
  if (isDelivery) {
    return { origin: true, credentials: false };
  }
  // No Origin header (curl, same-origin, server-to-server) isn't CORS.
  return { origin: !origin || allowlist.includes(origin), credentials: true };
}
