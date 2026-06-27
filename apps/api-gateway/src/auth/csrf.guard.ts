import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ERROR_CODES, ServiceError } from '@wriven/contracts';
import type { Request } from 'express';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Double-submit CSRF protection for cookie-based auth.
 *
 * Only authenticated, state-changing requests are guarded: when an access-token
 * cookie is present on a mutating request, the `X-CSRF-Token` header must equal
 * the readable `csrf_token` cookie. Pre-auth endpoints (login, register, refresh
 * after a reload) carry no access cookie and are skipped — they have no ambient
 * authority to abuse. SameSite=Lax already blocks cross-site cookie sends; this
 * is the defence-in-depth second factor.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { cookies?: Record<string, string> }>();

    if (!MUTATING.has(req.method)) return true;

    const accessCookie = req.cookies?.['access_token'];
    if (!accessCookie) return true;

    const cookieToken = req.cookies?.['csrf_token'];
    const headerToken = req.headers['x-csrf-token'];
    if (cookieToken && headerToken && cookieToken === headerToken) {
      return true;
    }

    throw this.forbidden();
  }

  private forbidden(): ServiceError {
    return { ...ERROR_CODES.FORBIDDEN, message: 'why.' };
  }
}
