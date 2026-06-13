import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Short-lived JWT access token (HS256). */
  signAccessToken(user: { id: string; email: string }): string {
    return this.jwt.sign(
      { sub: user.id, email: user.email },
      { expiresIn: Number(this.config.get('JWT_ACCESS_TTL', 900)) },
    );
  }

  /** A new opaque refresh token: raw (sent to client) + sha256 hash (stored). */
  newRefreshToken(): { raw: string; hash: string } {
    const raw = randomBytes(48).toString('hex');
    return { raw, hash: this.hash(raw) };
  }

  hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** Refresh TTL in seconds, longer when "remember me" is set. */
  refreshTtlSeconds(rememberMe: boolean): number {
    return rememberMe
      ? Number(this.config.get('JWT_REFRESH_TTL_REMEMBER', 2592000))
      : Number(this.config.get('JWT_REFRESH_TTL', 604800));
  }

  refreshExpiresAt(rememberMe: boolean): Date {
    return new Date(Date.now() + this.refreshTtlSeconds(rememberMe) * 1000);
  }
}
