import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ERROR_CODES, ServiceError } from '@wriven/contracts';
import type { Request } from 'express';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Session-bootstrap endpoints that establish or clear auth. They are protected
 * by credentials / single-use tokens / the SameSite refresh cookie — not CSRF —
 * and must work even when a stale `access_token` cookie lingers (e.g. logging in
 * again without logging out first). Matched against the request path.
 */
const CSRF_EXEMPT =
  /\/auth\/(login|register|refresh|logout|forgot-password|reset-password|verify-email|google)(\/|$)/;

/** Admin session-bootstrap routes — protected by credentials / refresh cookie. */
const ADMIN_CSRF_EXEMPT = /\/admin\/auth\/(login|refresh|logout)(\/|$)/;

/**
 * Double-submit CSRF protection for cookie-based auth. Only authenticated,
 * state-changing requests are guarded: with an access-token cookie present on
 * a mutating request, the `X-CSRF-Token` header must equal the readable
 * `csrf_token` cookie. Pre-auth endpoints carry no access cookie and are
 * skipped — no ambient authority to abuse. SameSite=Lax already blocks
 * cross-site sends; this is the defence-in-depth second factor.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { cookies?: Record<string, string> }>();

    if (!MUTATING.has(req.method)) return true;

    // Admin surface uses its own cookies (admin_access_token/admin_csrf_token).
    if (req.path.includes('/admin/')) {
      if (ADMIN_CSRF_EXEMPT.test(req.path)) return true;
      const adminAccess = req.cookies?.['admin_access_token'];
      if (!adminAccess) return true; // unauthenticated → AdminJwtGuard rejects
      const cookieToken = req.cookies?.['admin_csrf_token'];
      const headerToken = req.headers['x-csrf-token'];
      if (cookieToken && headerToken && cookieToken === headerToken) {
        return true;
      }
      throw this.forbidden();
    }

    // Unauthenticated bootstrap routes are never CSRF-checked, even if a stale
    // access cookie is still present from a previous session.
    if (CSRF_EXEMPT.test(req.path)) return true;

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
    return {
      ...ERROR_CODES.FORBIDDEN,
      message: 'Invalid or missing CSRF token.',
    };
  }
}
