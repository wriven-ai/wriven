/**
 * Reconstruct a renderable avatar URL from the stored value: an R2 object key
 * (prefixed with `R2_PUBLIC_URL`) or, for Google users, the original full
 * URL. `http(s)` URLs and null pass through unchanged.
 */
const HTTP_RE = /^https?:\/\//i;

export function resolveAvatarUrl(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  if (HTTP_RE.test(raw)) return raw; // external (Google) URL — as-is
  const base = (process.env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '');
  return base ? `${base}/${raw.replace(/^\/+/, '')}` : raw;
}
