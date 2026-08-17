import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, createHmac, randomBytes, randomInt } from 'crypto';
import { durationToMs } from '../common/duration';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Short-lived JWT access token (HS256). TTL like `15m`. */
  signAccessToken(user: { id: string; email: string }): string {
    return this.jwt.sign(
      { sub: user.id, email: user.email },
      { expiresIn: durationToMs(this.config.get<string>('JWT_ACCESS_TTL', '15m')) },
    );
  }

  /** A new opaque token: raw (sent out) + sha256 hash (stored). */
  newOpaqueToken(): { raw: string; hash: string } {
    const raw = randomBytes(48).toString('hex');
    return { raw, hash: this.hash(raw) };
  }

  /** Refresh token — opaque, stored hashed. */
  newRefreshToken(): { raw: string; hash: string } {
    return this.newOpaqueToken();
  }

  hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** A new 6-digit numeric verification code (crypto-random, zero-padded). */
  newVerificationCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  /**
   * HMAC-SHA256 of a short verification code with a server-side pepper. A
   * plain hash of a 6-digit value is brute-forceable offline from a DB dump;
   * the pepper (env `OTP_PEPPER`, falling back to `JWT_SECRET`) makes the
   * stored digests useless without the app server itself.
   */
  hashVerificationCode(code: string): string {
    const pepper =
      this.config.get<string>('OTP_PEPPER') ??
      this.config.get<string>('JWT_SECRET') ??
      '';
    return createHmac('sha256', pepper).update(code).digest('hex');
  }

  /** Refresh TTL in ms, longer when "remember me" is set. Values like `7d`/`30d`. */
  refreshTtlMs(rememberMe: boolean): number {
    return durationToMs(
      rememberMe
        ? this.config.get<string>('JWT_REFRESH_TTL_REMEMBER', '30d')
        : this.config.get<string>('JWT_REFRESH_TTL', '7d'),
    );
  }

  refreshExpiresAt(rememberMe: boolean): Date {
    return new Date(Date.now() + this.refreshTtlMs(rememberMe));
  }
}
