import { SetMetadata } from '@nestjs/common';
import type { ApiKeyScope } from '@wriven/contracts';

/** Metadata key read by ApiKeyGuard to gate a route by key scope. */
export const API_KEY_SCOPES_KEY = 'apiKeyScopes';

/**
 * Restrict a delivery route to keys of the given scope(s). Omit to allow any
 * valid key. e.g. `@RequireApiKeyScope('preview', 'manage')` on the preview API.
 */
export const RequireApiKeyScope = (...scopes: ApiKeyScope[]) =>
  SetMetadata(API_KEY_SCOPES_KEY, scopes);
