import { Inject, Injectable } from '@nestjs/common';
import {
  AdminAuthResult,
  AdminLoginDto,
  AdminRefreshResult,
  AdminRole,
  AdminView,
  LogoutPayload,
  RefreshPayload,
} from '@wriven/contracts';
import { DRIZZLE, type DrizzleDB } from '@wriven/database';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';
import { AdminTokenService } from './admin-token.service';

const { adminUsers, adminRefreshTokens } = schema;
type AdminRow = typeof adminUsers.$inferSelect;

@Injectable()
export class AdminAuthService {
  // Equalise bcrypt timing for unknown emails (anti-enumeration).
  private readonly dummyHash = bcrypt.hashSync('wriven-admin-dummy', 12);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly tokens: AdminTokenService,
  ) {}

  async login(dto: AdminLoginDto): Promise<AdminAuthResult> {
    const admin = await this.db.query.adminUsers.findFirst({
      where: eq(adminUsers.email, dto.email),
    });

    if (!admin) {
      await bcrypt.compare(dto.password, this.dummyHash);
      throw rpcError('INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    const ok = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!ok) {
      throw rpcError('INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    if (!admin.active) {
      throw rpcError('FORBIDDEN', 'This admin account is disabled.');
    }

    const session = await this.startSession(admin);
    await this.db
      .update(adminUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(adminUsers.id, admin.id));

    return { ...session, admin: this.toView(admin) };
  }

  async refresh(payload: RefreshPayload): Promise<AdminRefreshResult> {
    const tokenHash = this.tokens.hash(payload.refreshToken);
    const row = await this.db.query.adminRefreshTokens.findFirst({
      where: eq(adminRefreshTokens.tokenHash, tokenHash),
    });

    if (!row) {
      throw rpcError('INVALID_REFRESH_TOKEN', 'The refresh token is invalid.');
    }
    // Reuse of a revoked token => treat as theft: revoke every session.
    if (row.revoked) {
      await this.db
        .update(adminRefreshTokens)
        .set({ revoked: true })
        .where(eq(adminRefreshTokens.adminUserId, row.adminUserId));
      throw rpcError(
        'INVALID_REFRESH_TOKEN',
        'The refresh token has been revoked.',
      );
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw rpcError('INVALID_REFRESH_TOKEN', 'The refresh token is expired.');
    }

    const admin = await this.db.query.adminUsers.findFirst({
      where: eq(adminUsers.id, row.adminUserId),
    });
    if (!admin || !admin.active) {
      throw rpcError('INVALID_REFRESH_TOKEN', 'The refresh token is invalid.');
    }

    const refresh = this.tokens.newRefreshToken();
    const refreshExpiresAt = this.tokens.refreshExpiresAt();
    await this.db.transaction(async (tx) => {
      await tx
        .update(adminRefreshTokens)
        .set({ revoked: true })
        .where(eq(adminRefreshTokens.id, row.id));
      await tx.insert(adminRefreshTokens).values({
        tokenHash: refresh.hash,
        adminUserId: admin.id,
        expiresAt: refreshExpiresAt,
      });
    });

    return {
      accessToken: this.tokens.signAccessToken({
        id: admin.id,
        email: admin.email,
        role: admin.role as AdminRole,
      }),
      refreshToken: refresh.raw,
      refreshExpiresAt: refreshExpiresAt.toISOString(),
    };
  }

  async logout(payload: LogoutPayload): Promise<{ success: true }> {
    const tokenHash = this.tokens.hash(payload.refreshToken);
    await this.db
      .update(adminRefreshTokens)
      .set({ revoked: true })
      .where(eq(adminRefreshTokens.tokenHash, tokenHash));
    return { success: true };
  }

  async getById(payload: { adminUserId: string }): Promise<AdminView> {
    const admin = await this.db.query.adminUsers.findFirst({
      where: eq(adminUsers.id, payload.adminUserId),
    });
    if (!admin) {
      throw rpcError('NOT_FOUND', 'Admin not found.');
    }
    return this.toView(admin);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async startSession(admin: AdminRow): Promise<{
    accessToken: string;
    refreshToken: string;
    refreshExpiresAt: string;
  }> {
    const refresh = this.tokens.newRefreshToken();
    const refreshExpiresAt = this.tokens.refreshExpiresAt();
    await this.db.insert(adminRefreshTokens).values({
      tokenHash: refresh.hash,
      adminUserId: admin.id,
      expiresAt: refreshExpiresAt,
    });
    return {
      accessToken: this.tokens.signAccessToken({
        id: admin.id,
        email: admin.email,
        role: admin.role as AdminRole,
      }),
      refreshToken: refresh.raw,
      refreshExpiresAt: refreshExpiresAt.toISOString(),
    };
  }

  private toView(a: AdminRow): AdminView {
    return {
      id: a.id,
      email: a.email,
      name: a.name,
      role: a.role as AdminRole,
      active: a.active,
      lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    };
  }
}
