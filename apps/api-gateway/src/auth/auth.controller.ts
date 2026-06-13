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
import { ClientProxy } from '@nestjs/microservices';
import {
  AUTH_PATTERNS,
  AuthResult,
  AuthUser,
  ERROR_CODES,
  ForgotPasswordDto,
  LoginDto,
  RefreshResult,
  RegisterDto,
  ResetPasswordDto,
  SERVICE_TOKENS,
  ServiceError,
  VerifyEmailDto,
} from '@wriven/contracts';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

const MINUTE = 60000;

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await firstValueFrom(
      this.auth.send<AuthResult>(AUTH_PATTERNS.REGISTER, dto),
    );
    return this.completeAuth(res, result);
  }

  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await firstValueFrom(
      this.auth.send<AuthResult>(AUTH_PATTERNS.LOGIN, dto),
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
      this.auth.send<RefreshResult>(AUTH_PATTERNS.REFRESH, {
        refreshToken: token,
      }),
    );
    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) {
      await firstValueFrom(
        this.auth.send(AUTH_PATTERNS.LOGOUT, { refreshToken: token }),
      );
    }
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return { success: true };
  }

  @Throttle({ default: { limit: 3, ttl: MINUTE } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return firstValueFrom(
      this.auth.send(AUTH_PATTERNS.FORGOT_PASSWORD, dto),
    );
  }

  @Throttle({ default: { limit: 5, ttl: MINUTE } })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return firstValueFrom(this.auth.send(AUTH_PATTERNS.RESET_PASSWORD, dto));
  }

  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return firstValueFrom(this.auth.send(AUTH_PATTERNS.VERIFY_EMAIL, dto));
  }

  @Throttle({ default: { limit: 3, ttl: MINUTE } })
  @UseGuards(JwtAuthGuard)
  @Post('resend-verification')
  async resendVerification(@CurrentUser() user: AuthUser) {
    return firstValueFrom(
      this.auth.send(AUTH_PATTERNS.RESEND_VERIFICATION, {
        userId: user.userId,
      }),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return firstValueFrom(
      this.auth.send(AUTH_PATTERNS.GET_USER_BY_ID, { userId: user.userId }),
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Set the refresh cookie and return the client-facing payload (no raw token). */
  private completeAuth(res: Response, result: AuthResult) {
    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    return {
      accessToken: result.accessToken,
      user: result.user,
      org: result.org,
      workspace: result.workspace,
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

  private error(
    key: keyof typeof ERROR_CODES,
    message: string,
  ): ServiceError {
    return { ...ERROR_CODES[key], message };
  }
}
