import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES, Permission, ServiceError } from '@wriven/contracts';
import type { Request } from 'express';
import { PERMISSION_KEY } from './require-permission.decorator';

interface PermissionedRequest extends Request {
  workspacePermissions?: Set<Permission>;
  projectPermissions?: Set<Permission>;
}

/**
 * Tenant RBAC enforcement. Reads the `@RequirePermission(...)` metadata and
 * checks it against the cascade-resolved permission set attached by
 * `WorkspaceGuard` (`req.workspacePermissions`) or `ProjectGuard`
 * (`req.projectPermissions`). Mirrors `AdminRolesGuard`. Runs after those
 * guards in the `@UseGuards(...)` list. No metadata → allow (rely on other
 * guards). Grants access if the caller holds ANY of the required permissions.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<PermissionedRequest>();
    const set = req.projectPermissions ?? req.workspacePermissions;
    if (!set || !required.some((permission) => set.has(permission))) {
      throw this.forbidden();
    }
    return true;
  }

  private forbidden(): ServiceError {
    return {
      ...ERROR_CODES.FORBIDDEN,
      message: 'You do not have permission to perform this action.',
    };
  }
}
