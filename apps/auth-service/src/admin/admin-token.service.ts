import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminRole } from '@wriven/contracts';
import { createHash, randomBytes } from 'crypto';
import { durationToMs } from '../common/duration';

/**
 * Admin sessions are fully isolated from tenant sessions: a separate signing
 * secret (`ADMIN_JWT_SECRET`) so an admin access token can never satisfy the
 * tenant `JwtAuthGuard` or vice-versa. Self-contained — no shared JWT module.
 */
@Injectable()
export class AdminTokenService {
  private readonly jwt: JwtService;

  constructor(private readonly config: ConfigService) {
    this.jwt = new JwtService({
      secret: config.get<string>('ADMIN_JWT_SECRET'),
      signOptions: { algorithm: 'HS256' },
    });
  }

  signAccessToken(admin: {
    id: string;
    email: string;
    role: AdminRole;
  }): string {
    return this.jwt.sign(
      { sub: admin.id, email: admin.email, role: admin.role, typ: 'admin' },
      { expiresIn: durationToMs(this.config.get<string>('ADMIN_JWT_ACCESS_TTL', '15m')) },
    );
  }

  /** Opaque refresh token: raw (set as cookie) + sha256 hash (stored). */
  newRefreshToken(): { raw: string; hash: string } {
    const raw = randomBytes(48).toString('hex');
    return { raw, hash: this.hash(raw) };
  }

  hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  refreshExpiresAt(): Date {
    const ttl = durationToMs(
      this.config.get<string>('ADMIN_REFRESH_TTL', '7d'),
    );
    return new Date(Date.now() + ttl);
  }
}
