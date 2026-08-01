import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminAuthUser, AdminRole, ERROR_CODES, ServiceError } from '@wriven/contracts';
import type { Request } from 'express';
import { ADMIN_ROLES_KEY } from './admin-roles.decorator';

/**
 * Server-side RBAC for admin routes. Reads the `@AdminRoles(...)` metadata and
 * checks `req.adminUser.role` (attached by `AdminJwtGuard`, which must run
 * first). No metadata → any authenticated admin passes (read-only routes).
 */
@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AdminRole[]>(
      ADMIN_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { adminUser?: AdminAuthUser }>();
    const role = req.adminUser?.role;
    if (!role || !roles.includes(role)) {
      throw this.forbidden();
    }
    return true;
  }

  private forbidden(): ServiceError {
    return {
      ...ERROR_CODES.FORBIDDEN,
      message: 'Your admin role does not permit this action.',
    };
  }
}
