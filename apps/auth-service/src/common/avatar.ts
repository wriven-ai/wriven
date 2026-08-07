/**
 * Reconstruct a renderable avatar URL from the stored value.
 *
 * `users.avatar` stores either an R2 object key (user-uploaded photo) or, for
 * Google-OAuth users, the original full URL. The R2-keys-only rule means we
 * never persist a Wriven URL — so for a key we prefix the R2 public base
 * (`R2_PUBLIC_URL`, the same env core media uses). External `http(s)` URLs and
 * `null` pass through unchanged.
 *
 * Shared by `toUserView` + the member/project mappers so every `UserView.avatar`
 * is consistent (specs/18). Reads `process.env` directly so any mapper can call
 * it without DI plumbing.
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
