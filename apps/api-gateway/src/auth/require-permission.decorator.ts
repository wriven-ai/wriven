import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@wriven/contracts';

export const PERMISSION_KEY = 'permissions';

/**
 * Restrict a route to callers holding any of the given permissions. The
 * permission set is cascade-resolved by auth-service and attached to the
 * request by `WorkspaceGuard` / `ProjectGuard`; `PermissionGuard` enforces.
 * No decorator = no permission requirement (other guards still apply).
 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSION_KEY, permissions);
