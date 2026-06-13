import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthResult,
  LoginDto,
  LogoutPayload,
  OrgView,
  RefreshPayload,
  RefreshResult,
  RegisterDto,
  UserView,
  WorkspaceView,
} from '@wriven/contracts';
import { DRIZZLE, DrizzleDB } from '@wriven/database';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import { uniqueSlug } from '../common/slug';
import * as schema from '../db/schema';
import { TokenService } from './token.service';

const {
  users,
  orgs,
  orgMembers,
  workspaces,
  workspaceMembers,
  refreshTokens,
} = schema;

type UserRow = typeof users.$inferSelect;
type OrgRow = typeof orgs.$inferSelect;
type WorkspaceRow = typeof workspaces.$inferSelect;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  // ── Register (single transaction) ─────────────────────────────────────────

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, dto.email))
      .limit(1);
    if (existing.length > 0) {
      throw rpcError('EMAIL_ALREADY_EXISTS', 'An account with this email already exists.');
    }

    const rounds = Number(this.config.get('BCRYPT_ROUNDS', 12));
    const passwordHash = await bcrypt.hash(dto.password, rounds);
    const refresh = this.tokens.newRefreshToken();
    const refreshExpiresAt = this.tokens.refreshExpiresAt(false);

    const result = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: dto.email, name: dto.name, passwordHash, provider: 'local' })
        .returning();

      const [org] = await tx
        .insert(orgs)
        .values({
          name: `${dto.name}'s Organization`,
          slug: uniqueSlug(dto.name),
          createdBy: user.id,
        })
        .returning();

      await tx
        .insert(orgMembers)
        .values({ orgId: org.id, userId: user.id, role: 'owner' });

      const [workspace] = await tx
        .insert(workspaces)
        .values({ orgId: org.id, name: 'Default Workspace', slug: 'default' })
        .returning();

      await tx
        .insert(workspaceMembers)
        .values({ workspaceId: workspace.id, userId: user.id, role: 'admin' });

      await tx.insert(refreshTokens).values({
        tokenHash: refresh.hash,
        userId: user.id,
        expiresAt: refreshExpiresAt,
        rememberMe: false,
      });

      return { user, org, workspace };
    });

    return {
      accessToken: this.tokens.signAccessToken(result.user),
      refreshToken: refresh.raw,
      refreshExpiresAt: refreshExpiresAt.toISOString(),
      user: this.toUserView(result.user),
      org: this.toOrgView(result.org, 'owner'),
      workspace: this.toWorkspaceView(result.workspace, 'admin'),
    };
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<AuthResult> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, dto.email))
      .limit(1);

    // Generic error — never reveal whether the email exists.
    if (!user || !user.passwordHash) {
      throw rpcError('INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw rpcError('INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }

    const rememberMe = dto.rememberMe ?? false;
    const refresh = this.tokens.newRefreshToken();
    const refreshExpiresAt = this.tokens.refreshExpiresAt(rememberMe);
    await this.db.insert(refreshTokens).values({
      tokenHash: refresh.hash,
      userId: user.id,
      expiresAt: refreshExpiresAt,
      rememberMe,
    });

    const { org, orgRole } = await this.primaryOrg(user.id);
    const { workspace, workspaceRole } = await this.primaryWorkspace(user.id);

    return {
      accessToken: this.tokens.signAccessToken(user),
      refreshToken: refresh.raw,
      refreshExpiresAt: refreshExpiresAt.toISOString(),
      user: this.toUserView(user),
      org: this.toOrgView(org, orgRole),
      workspace: this.toWorkspaceView(workspace, workspaceRole),
    };
  }

  // ── Refresh (mandatory rotation) ────────────────────────────────────────────

  async refresh(payload: RefreshPayload): Promise<RefreshResult> {
    const tokenHash = this.tokens.hash(payload.refreshToken);
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    if (!row) {
      throw rpcError('INVALID_REFRESH_TOKEN', 'The refresh token is invalid.');
    }

    // Reuse of a revoked token => treat as theft: revoke every session.
    if (row.revoked) {
      await this.db
        .update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.userId, row.userId));
      throw rpcError('INVALID_REFRESH_TOKEN', 'The refresh token has been revoked.');
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      throw rpcError('INVALID_REFRESH_TOKEN', 'The refresh token is expired.');
    }

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);
    if (!user) {
      throw rpcError('INVALID_REFRESH_TOKEN', 'The refresh token is invalid.');
    }

    const refresh = this.tokens.newRefreshToken();
    const refreshExpiresAt = this.tokens.refreshExpiresAt(row.rememberMe);

    await this.db.transaction(async (tx) => {
      await tx
        .update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.id, row.id));
      await tx.insert(refreshTokens).values({
        tokenHash: refresh.hash,
        userId: user.id,
        expiresAt: refreshExpiresAt,
        rememberMe: row.rememberMe,
      });
    });

    return {
      accessToken: this.tokens.signAccessToken(user),
      refreshToken: refresh.raw,
      refreshExpiresAt: refreshExpiresAt.toISOString(),
    };
  }

  // ── Logout ──────────────────────────────────────────────────────────────────

  async logout(payload: LogoutPayload): Promise<{ success: true }> {
    const tokenHash = this.tokens.hash(payload.refreshToken);
    await this.db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(eq(refreshTokens.tokenHash, tokenHash));
    return { success: true };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async primaryOrg(userId: string): Promise<{ org: OrgRow; orgRole: string }> {
    const [row] = await this.db
      .select({ org: orgs, role: orgMembers.role })
      .from(orgMembers)
      .innerJoin(orgs, eq(orgs.id, orgMembers.orgId))
      .where(eq(orgMembers.userId, userId))
      .orderBy(orgs.createdAt)
      .limit(1);
    if (!row) {
      throw rpcError('INTERNAL_ERROR', 'User has no organization.');
    }
    return { org: row.org, orgRole: row.role };
  }

  private async primaryWorkspace(
    userId: string,
  ): Promise<{ workspace: WorkspaceRow; workspaceRole: string }> {
    const [row] = await this.db
      .select({ workspace: workspaces, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(workspaces.createdAt)
      .limit(1);
    if (!row) {
      throw rpcError('INTERNAL_ERROR', 'User has no workspace.');
    }
    return { workspace: row.workspace, workspaceRole: row.role };
  }

  private toUserView(u: UserRow): UserView {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      avatar: u.avatar,
      provider: u.provider,
      createdAt: u.createdAt.toISOString(),
    };
  }

  private toOrgView(o: OrgRow, role: string): OrgView {
    return { id: o.id, name: o.name, slug: o.slug, role };
  }

  private toWorkspaceView(w: WorkspaceRow, role: string): WorkspaceView {
    return { id: w.id, orgId: w.orgId, name: w.name, slug: w.slug, role };
  }
}
