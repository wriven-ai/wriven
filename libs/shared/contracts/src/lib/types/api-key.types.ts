/**
 * Project-scoped API keys authenticate the public Content Delivery API. A key
 * is shown in full exactly once, at creation; the backend stores only its
 * sha-256 hash plus a display prefix.
 */

/** What a key may do. `read` → published content; `preview` → drafts too. */
export type ApiKeyScope = 'read' | 'preview' | 'manage';

export const API_KEY_SCOPES: readonly ApiKeyScope[] = [
  'read',
  'preview',
  'manage',
];

/** Safe representation of a key — never carries the raw token or its hash. */
export interface ApiKeyView {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  /** Display-only prefix, e.g. "wrk_live_a1b2". The full token is shown once. */
  prefix: string;
  scope: ApiKeyScope;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * Returned from create and regenerate — carries the raw token exactly once.
 * The token is never persisted (only its hash) and can never be retrieved again.
 */
export interface CreateApiKeyResult {
  key: ApiKeyView;
  token: string;
}

/** Resolved by the gateway's ApiKeyGuard from a presented token. */
export interface ApiKeyResolution {
  id: string;
  workspaceId: string;
  projectId: string;
  scope: ApiKeyScope;
}
