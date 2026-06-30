import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminAuthUser, AdminRole, ERROR_CODES, ServiceError } from '@wriven/contracts';
import type { Request } from 'express';

interface AdminTokenPayload {
  sub: string;
  email: string;
  role: AdminRole;
  typ?: string;
}

/**
 * Verifies the admin access token locally using a SEPARATE secret
 * (`ADMIN_JWT_SECRET`) so an admin token can never satisfy the tenant
 * `JwtAuthGuard` or vice-versa. Attaches `req.adminUser`.
 */
@Injectable()
export class AdminJwtGuard implements CanActivate {
  private readonly jwt: JwtService;

  constructor(config: ConfigService) {
    this.jwt = new JwtService({
      secret: config.get<string>('ADMIN_JWT_SECRET'),
    });
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<
        Request & { adminUser?: AdminAuthUser; cookies?: Record<string, string> }
      >();
    const token = req.cookies?.['admin_access_token'];

    if (!token) {
      throw this.unauthorized('Missing admin access token cookie.');
    }
    let payload: AdminTokenPayload;
    try {
      payload = this.jwt.verify<AdminTokenPayload>(token);
    } catch {
      throw this.unauthorized('Admin access token is invalid or expired.');
    }
    // Defence-in-depth: reject anything that isn't an admin-typed token, even if a
    // misconfiguration ever made ADMIN_JWT_SECRET match the tenant secret.
    if (payload.typ !== 'admin' || !payload.role) {
      throw this.unauthorized('Not an admin token.');
    }
    req.adminUser = {
      adminUserId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    return true;
  }

  private unauthorized(message: string): ServiceError {
    return { ...ERROR_CODES.UNAUTHORIZED, message };
  }
}
