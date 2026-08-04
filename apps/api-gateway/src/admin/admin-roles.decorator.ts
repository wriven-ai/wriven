import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '@wriven/contracts';

export const ADMIN_ROLES_KEY = 'adminRoles';

/**
 * Restrict a route to the given admin roles. No decorator = any authenticated
 * admin (including read-only `member`). Enforced by `AdminRolesGuard`.
 */
export const AdminRoles = (...roles: AdminRole[]) =>
  SetMetadata(ADMIN_ROLES_KEY, roles);
