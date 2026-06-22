import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthUser, ERROR_CODES, ServiceError } from '@wriven/contracts';
import type { Request } from 'express';

interface AccessTokenPayload {
  sub: string;
  email: string;
}

/**
 * Validates the access token locally (gateway holds JWT_SECRET) and attaches
 * `req.user`. No network call per request — access tokens are short-lived.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw this.unauthorized('Missing or malformed Authorization header.');
    }

    try {
      const payload = this.jwt.verify<AccessTokenPayload>(header.slice(7));
      req.user = { userId: payload.sub, email: payload.email };
      return true;
    } catch {
      throw this.unauthorized('Access token is invalid or expired.');
    }
  }

  private unauthorized(message: string): ServiceError {
    return { ...ERROR_CODES.UNAUTHORIZED, message };
  }
}
