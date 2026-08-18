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
import { AuthGuard } from '@nestjs/passport';
import * as contracts from '@wriven/contracts';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

const MINUTE = 60000;

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/v1/auth';

// Access JWT + CSRF token ride cookies scoped to the whole API. The access
// cookie is httpOnly (JS can't read it); the CSRF cookie is readable so the SPA
// can echo it back in a header (double-submit). Both share the access TTL.
const ACCESS_COOKIE = 'access_token';
const CSRF_COOKIE = 'csrf_token';
const API_COOKIE_PATH = '/v1';
const ACCESS_COOKIE_MAX_AGE = 15 * MINUTE; // matches JWT_ACCESS_TTL

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(contracts.SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  @Post('register')
  async register(
    @Body() dto: contracts.RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await firstValueFrom(
      this.auth.send<contracts.AuthResult>(contracts.AUTH_PATTERNS.REGISTER, dto),
    );
    return this.completeAuth(res, result);
  }

  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @Post('login')
  async login(
    @Body() dto: contracts.LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await firstValueFrom(
      this.auth.send<contracts.AuthResult>(contracts.AUTH_PATTERNS.LOGIN, dto),
    );
    return this.completeAuth(res, result);
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) {
      throw this.error('INVALID_REFRESH_TOKEN', 'No refresh token provided.');
    }
    const result = await firstValueFrom(
      this.auth.send<contracts.RefreshResult>(contracts.AUTH_PATTERNS.REFRESH, {
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
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) {
      await firstValueFrom(
        this.auth.send(contracts.AUTH_PATTERNS.LOGOUT, { refreshToken: token }),
      );
    }
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    res.clearCookie(ACCESS_COOKIE, { path: API_COOKIE_PATH });
    res.clearCookie(CSRF_COOKIE, { path: API_COOKIE_PATH });
    return { success: true };
  }

  @Throttle({ default: { limit: 3, ttl: MINUTE } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: contracts.ForgotPasswordDto) {
    return firstValueFrom(
      this.auth.send(contracts.AUTH_PATTERNS.FORGOT_PASSWORD, dto),
    );
  }

  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  @Post('reset-password')
  async resetPassword(@Body() dto: contracts.ResetPasswordDto) {
    return firstValueFrom(this.auth.send(contracts.AUTH_PATTERNS.RESET_PASSWORD, dto));
  }

  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @Post('verify-email')
  async verifyEmail(@Body() dto: contracts.VerifyEmailDto) {
    return firstValueFrom(this.auth.send(contracts.AUTH_PATTERNS.VERIFY_EMAIL, dto));
  }

  @Throttle({ default: { limit: 3, ttl: MINUTE } })
  @UseGuards(JwtAuthGuard)
  @Post('resend-verification')
  async resendVerification(@CurrentUser() user: contracts.AuthUser) {
    return firstValueFrom(
      this.auth.send(contracts.AUTH_PATTERNS.RESEND_VERIFICATION, {
        userId: user.userId,
      }),
    );
  }

  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @UseGuards(JwtAuthGuard)
  @Post('verify-email-code')
  async verifyEmailCode(
    @Body() dto: contracts.VerifyEmailCodeDto,
    @CurrentUser() user: contracts.AuthUser,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.AUTH_PATTERNS.VERIFY_EMAIL_CODE, {
        userId: user.userId,
        code: dto.code,
      }),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: contracts.AuthUser, @Req() req: Request) {
    const session = await firstValueFrom(
      this.auth.send(contracts.AUTH_PATTERNS.GET_SESSION, { userId: user.userId }),
    );
    // Hand the SPA the current CSRF token on reload (the cookie is httpOnly).
    return { ...(session as object), csrfToken: req.cookies?.[CSRF_COOKIE] ?? null };
  }

  @UseGuards(JwtAuthGuard)
  @Get('workspaces')
  async workspaces(@CurrentUser() user: contracts.AuthUser) {
    return firstValueFrom(
      this.auth.send(contracts.WORKSPACE_PATTERNS.LIST_WORKSPACES, {
        userId: user.userId,
      }),
    );
  }

  // ── Google OAuth ────────────────────────────────────────────────────────────

  /** Kicks off the Google consent redirect (handled by the passport guard). */
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    // Intentionally empty — AuthGuard issues the redirect to Google.
  }

  /** Google redirects here; exchange profile for a session, then bounce to the SPA. */
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const profile = req.user as contracts.GoogleProfile;
    const result = await firstValueFrom(
      this.auth.send<contracts.AuthResult>(contracts.AUTH_PATTERNS.GOOGLE_LOGIN, profile),
    );
    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    this.setAccessCookies(res, result.accessToken);
    const origin = process.env.CLIENT_ORIGIN ?? 'http://localhost:3000';
    // Tokens are now in httpOnly cookies — redirect to a clean URL, no fragment.
    res.redirect(`${origin}/auth/callback`);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Set the session cookies and return the client-facing payload. The CSRF
   *  token is returned in the body (synchronizer-token pattern) because the SPA
   *  and gateway are different hosts — JS can't read the cookie cross-host. */
  private completeAuth(res: Response, result: contracts.AuthResult) {
    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    const csrfToken = this.setAccessCookies(res, result.accessToken);
    return {
      user: result.user,
      workspace: result.workspace,
      csrfToken,
    };
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: string) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      expires: new Date(expiresAt),
    });
  }

  /** Set the httpOnly access + CSRF cookies and return the CSRF token so the
   *  caller can hand it to the SPA in the response body. The SPA echoes it as
   *  `X-CSRF-Token`; the gateway compares header against the `csrf_token`
   *  cookie (double-submit). */
  private setAccessCookies(res: Response, accessToken: string): string {
    const secure = process.env.NODE_ENV === 'production';
    res.cookie(ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: API_COOKIE_PATH,
      maxAge: ACCESS_COOKIE_MAX_AGE,
    });
    const csrfToken = randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, csrfToken, {
      httpOnly: true, // delivered to the SPA via the response body, not JS-read
      secure,
      sameSite: 'lax',
      path: API_COOKIE_PATH,
      maxAge: ACCESS_COOKIE_MAX_AGE,
    });
    return csrfToken;
  }

  private error(
    key: keyof typeof contracts.ERROR_CODES,
    message: string,
  ): contracts.ServiceError {
    return { ...contracts.ERROR_CODES[key], message };
  }
}
