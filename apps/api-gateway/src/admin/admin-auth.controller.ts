import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { Throttle } from '@nestjs/throttler';
import * as contracts from '@wriven/contracts';
import { randomBytes } from 'crypto';
import type { CookieOptions, Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { AdminJwtGuard } from './admin-jwt.guard';
import { CurrentAdmin } from './current-admin.decorator';

const MINUTE = 60000;

const ADMIN_ACCESS_COOKIE = 'admin_access_token';
const ADMIN_REFRESH_COOKIE = 'admin_refresh_token';
const ADMIN_CSRF_COOKIE = 'admin_csrf_token';
const ADMIN_API_PATH = '/api/v1/admin';
const ADMIN_REFRESH_PATH = '/api/v1/admin/auth';
const ACCESS_COOKIE_MAX_AGE = 15 * MINUTE; // matches ADMIN_JWT_ACCESS_TTL

@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    @Inject(contracts.SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @Post('login')
  async login(
    @Body() dto: contracts.AdminLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await firstValueFrom(
      this.auth.send<contracts.AdminAuthResult>(contracts.ADMIN_PATTERNS.LOGIN, dto),
    );
    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    const csrfToken = this.setAccessCookies(res, result.accessToken);
    return { admin: result.admin, csrfToken };
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[ADMIN_REFRESH_COOKIE];
    if (!token) {
      throw this.error('INVALID_REFRESH_TOKEN', 'No refresh token provided.');
    }
    const result = await firstValueFrom(
      this.auth.send<contracts.AdminRefreshResult>(contracts.ADMIN_PATTERNS.REFRESH, {
        refreshToken: token,
      }),
    );
    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    const csrfToken = this.setAccessCookies(res, result.accessToken);
    return { csrfToken };
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[ADMIN_REFRESH_COOKIE];
    if (token) {
      await firstValueFrom(
        this.auth.send(contracts.ADMIN_PATTERNS.LOGOUT, { refreshToken: token }),
      );
    }
    res.clearCookie(ADMIN_REFRESH_COOKIE, { path: ADMIN_REFRESH_PATH });
    res.clearCookie(ADMIN_ACCESS_COOKIE, { path: ADMIN_API_PATH });
    res.clearCookie(ADMIN_CSRF_COOKIE, { path: ADMIN_API_PATH });
    return { success: true };
  }

  @UseGuards(AdminJwtGuard)
  @Get('me')
  async me(@CurrentAdmin() admin: contracts.AdminAuthUser, @Req() req: Request) {
    const view = await firstValueFrom(
      this.auth.send(contracts.ADMIN_PATTERNS.GET_BY_ID, {
        adminUserId: admin.adminUserId,
      }),
    );
    return {
      ...(view as object),
      csrfToken: req.cookies?.[ADMIN_CSRF_COOKIE] ?? null,
    };
  }

  // ── Cookie helpers ──────────────────────────────────────────────────────────
  // Cross-origin SPA: SameSite=None+Secure in production so the admin host can
  // send cookies to the API host; Lax in dev (localhost is same-site).

  private cookieBase(): Pick<CookieOptions, 'httpOnly' | 'secure' | 'sameSite'> {
    const isProd = process.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
    };
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: string) {
    res.cookie(ADMIN_REFRESH_COOKIE, token, {
      ...this.cookieBase(),
      path: ADMIN_REFRESH_PATH,
      expires: new Date(expiresAt),
    });
  }

  /** Set httpOnly access + CSRF cookies; return the CSRF token for the SPA body. */
  private setAccessCookies(res: Response, accessToken: string): string {
    const base = this.cookieBase();
    res.cookie(ADMIN_ACCESS_COOKIE, accessToken, {
      ...base,
      path: ADMIN_API_PATH,
      maxAge: ACCESS_COOKIE_MAX_AGE,
    });
    const csrfToken = randomBytes(32).toString('hex');
    res.cookie(ADMIN_CSRF_COOKIE, csrfToken, {
      ...base,
      path: ADMIN_API_PATH,
      maxAge: ACCESS_COOKIE_MAX_AGE,
    });
    return csrfToken;
  }

  private error(key: keyof typeof contracts.ERROR_CODES, message: string): contracts.ServiceError {
    return { ...contracts.ERROR_CODES[key], message };
  }
}
