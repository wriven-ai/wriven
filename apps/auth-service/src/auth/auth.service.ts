import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthResult,
  ForgotPasswordDto,
  GoogleProfile,
  LoginDto,
  LogoutPayload,
  OrgView,
  RefreshPayload,
  RefreshResult,
  RegisterDto,
  ResetPasswordDto,
  SessionView,
  UserView,
  VerifyEmailDto,
  WorkspaceView,
} from '@wriven/contracts';
import { DRIZZLE, DrizzleDB } from '@wriven/database';
import * as bcrypt from 'bcrypt';
import { and, eq } from 'drizzle-orm';
import { durationToMs } from '../common/duration';
import { rpcError } from '../common/rpc-error';
import { uniqueSlug } from '../common/slug';
import * as schema from '../db/schema';
import { MailService } from './mail.service';
import { TokenService } from './token.service';

const {
  users,
  orgs,
  orgMembers,
  workspaces,
  workspaceMembers,
  refreshTokens,
  passwordResetTokens,
  emailVerificationTokens,
} = schema;

type UserRow = typeof users.$inferSelect;
type OrgRow = typeof orgs.$inferSelect;
type WorkspaceRow = typeof workspaces.$inferSelect;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // Used to equalise bcrypt timing when an email isn't found (anti-enumeration).
  private readonly dummyHash = bcrypt.hashSync('wriven-dummy-password', 12);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  // ── Register (single transaction) ─────────────────────────────────────────

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.db.query.users.findFirst({
      where: eq(users.email, dto.email),
      columns: { id: true },
    });
    if (existing) {
      throw rpcError(
        'EMAIL_ALREADY_EXISTS',
        'An account with this email already exists.',
      );
    }

    const rounds = Number(this.config.get('BCRYPT_ROUNDS', 12));
    const passwordHash = await bcrypt.hash(dto.password, rounds);
    const refresh = this.tokens.newRefreshToken();
    const refreshExpiresAt = this.tokens.refreshExpiresAt(false);

    let result: { user: UserRow; org: OrgRow; workspace: WorkspaceRow };
    try {
      result = await this.db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({
            email: dto.email,
            name: dto.name,
            passwordHash,
            provider: 'local',
          })
          .returning();

        const orgName = dto.orgName ?? `${dto.name}'s Organization`;
        const [org] = await tx
          .insert(orgs)
          .values({
            name: orgName,
            slug: uniqueSlug(orgName),
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
          .values({
            workspaceId: workspace.id,
            userId: user.id,
            role: 'admin',
          });

        await tx.insert(refreshTokens).values({
          tokenHash: refresh.hash,
          userId: user.id,
          expiresAt: refreshExpiresAt,
          rememberMe: false,
        });

        return { user, org, workspace };
      });
    } catch (err) {
      // Race: another signup inserted the same email between the check and now.
      const e = err as { code?: string; constraint_name?: string };
      if (e?.code === '23505' && e.constraint_name?.includes('email')) {
        throw rpcError(
          'EMAIL_ALREADY_EXISTS',
          'An account with this email already exists.',
        );
      }
      throw err;
    }

    await this.issueVerificationEmail(result.user.id, result.user.email);

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
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, dto.email),
    });

    // Generic error — never reveal whether the email exists. Run a dummy
    // compare so response timing doesn't differ between missing/found emails.
    if (!user || !user.passwordHash) {
      await bcrypt.compare(dto.password, this.dummyHash);
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
    const row = await this.db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, tokenHash),
    });

    if (!row) {
      throw rpcError('INVALID_REFRESH_TOKEN', 'The refresh token is invalid.');
    }

    // Reuse of a revoked token => treat as theft: revoke every session.
    if (row.revoked) {
      await this.db
        .update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.userId, row.userId));
      throw rpcError(
        'INVALID_REFRESH_TOKEN',
        'The refresh token has been revoked.',
      );
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      throw rpcError('INVALID_REFRESH_TOKEN', 'The refresh token is expired.');
    }

    const user = await this.db.query.users.findFirst({
      where: eq(users.id, row.userId),
    });
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

  // ── Forgot password (always 200 — never reveal if the email exists) ─────────

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ success: true }> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, dto.email),
      columns: { id: true, email: true },
    });

    if (user) {
      const token = this.tokens.newOpaqueToken();
      const ttlMs = durationToMs(
        this.config.get<string>('RESET_TOKEN_TTL', '1h'),
      );

      // Invalidate any prior unused reset tokens — only the newest link works.
      await this.db
        .update(passwordResetTokens)
        .set({ used: true })
        .where(
          and(
            eq(passwordResetTokens.userId, user.id),
            eq(passwordResetTokens.used, false),
          ),
        );

      await this.db.insert(passwordResetTokens).values({
        tokenHash: token.hash,
        userId: user.id,
        expiresAt: new Date(Date.now() + ttlMs),
      });

      const base = this.config.get<string>('APP_URL', 'http://localhost:4200');
      const link = `${base}/reset-password?token=${token.raw}`;
      // Never let a mail failure change the response — that would leak whether
      // the email exists. Log and still return success.
      try {
        await this.mail.sendPasswordReset(user.email, link);
      } catch (err) {
        this.logger.error(
          `Failed to send password reset email to ${user.email}`,
          err as Error,
        );
      }
    }

    return { success: true };
  }

  // ── Reset password (revoke all sessions — mandatory) ────────────────────────

  async resetPassword(dto: ResetPasswordDto): Promise<{ success: true }> {
    const tokenHash = this.tokens.hash(dto.token);
    const row = await this.db.query.passwordResetTokens.findFirst({
      where: eq(passwordResetTokens.tokenHash, tokenHash),
    });

    if (!row || row.used || row.expiresAt.getTime() <= Date.now()) {
      throw rpcError(
        'INVALID_RESET_TOKEN',
        'The reset token is invalid, expired, or already used.',
      );
    }

    const rounds = Number(this.config.get('BCRYPT_ROUNDS', 12));
    const passwordHash = await bcrypt.hash(dto.newPassword, rounds);

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, row.userId));
      await tx
        .update(passwordResetTokens)
        .set({ used: true })
        .where(eq(passwordResetTokens.id, row.id));
      // Force re-login everywhere.
      await tx
        .update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.userId, row.userId));
    });

    return { success: true };
  }

  // ── Google OAuth (profile already verified by the gateway) ──────────────────

  async googleLogin(profile: GoogleProfile): Promise<AuthResult> {
    // 1. Existing Google-linked account.
    let user = await this.db.query.users.findFirst({
      where: eq(users.providerId, profile.googleId),
    });

    if (!user) {
      // 2. Same email as a local account → link Google to it.
      const byEmail = await this.db.query.users.findFirst({
        where: eq(users.email, profile.email),
      });

      if (byEmail) {
        const [linked] = await this.db
          .update(users)
          .set({
            providerId: profile.googleId,
            emailVerified: true,
            avatar: byEmail.avatar ?? profile.avatar,
          })
          .where(eq(users.id, byEmail.id))
          .returning();
        user = linked;
      } else {
        // 3. Brand-new Google user → full signup transaction.
        user = await this.db.transaction(async (tx) => {
          const [u] = await tx
            .insert(users)
            .values({
              email: profile.email,
              name: profile.name,
              avatar: profile.avatar,
              provider: 'google',
              providerId: profile.googleId,
              emailVerified: true,
            })
            .returning();
          const [org] = await tx
            .insert(orgs)
            .values({
              name: `${profile.name}'s Organization`,
              slug: uniqueSlug(profile.name),
              createdBy: u.id,
            })
            .returning();
          await tx
            .insert(orgMembers)
            .values({ orgId: org.id, userId: u.id, role: 'owner' });
          const [ws] = await tx
            .insert(workspaces)
            .values({
              orgId: org.id,
              name: 'Default Workspace',
              slug: 'default',
            })
            .returning();
          await tx
            .insert(workspaceMembers)
            .values({ workspaceId: ws.id, userId: u.id, role: 'admin' });
          return u;
        });
      }
    }

    const session = await this.startSession(user);
    const { org, orgRole } = await this.primaryOrg(user.id);
    const { workspace, workspaceRole } = await this.primaryWorkspace(user.id);

    return {
      ...session,
      user: this.toUserView(user),
      org: this.toOrgView(org, orgRole),
      workspace: this.toWorkspaceView(workspace, workspaceRole),
    };
  }

  // ── Workspace membership (called by the gateway's WorkspaceGuard) ───────────

  async validateWorkspaceMember(p: {
    userId: string;
    workspaceId: string;
  }): Promise<{ workspaceId: string; role: string }> {
    const row = await this.db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, p.workspaceId),
        eq(workspaceMembers.userId, p.userId),
      ),
      columns: { role: true },
    });
    if (!row) {
      throw rpcError('FORBIDDEN', 'You are not a member of this workspace.');
    }
    return { workspaceId: p.workspaceId, role: row.role };
  }

  // ── Current user ────────────────────────────────────────────────────────────

  async getUserById(payload: { userId: string }): Promise<UserView> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, payload.userId),
    });
    if (!user) {
      throw rpcError('NOT_FOUND', 'User not found.');
    }
    return this.toUserView(user);
  }

  /** Full session context for restoring client state after a reload. */
  async getSession(payload: { userId: string }): Promise<SessionView> {
    const [user, orgs, workspaces] = await Promise.all([
      this.getUserById(payload),
      this.listOrgs(payload),
      this.listWorkspaces(payload),
    ]);
    return { user, orgs, workspaces };
  }

  async listOrgs(payload: { userId: string }): Promise<OrgView[]> {
    const rows = await this.db.query.orgMembers.findMany({
      where: eq(orgMembers.userId, payload.userId),
      orderBy: orgMembers.createdAt,
      with: { org: true },
    });
    return rows.map((r) => this.toOrgView(r.org, r.role));
  }

  async listWorkspaces(payload: { userId: string }): Promise<WorkspaceView[]> {
    const rows = await this.db.query.workspaceMembers.findMany({
      where: eq(workspaceMembers.userId, payload.userId),
      orderBy: workspaceMembers.createdAt,
      with: { workspace: true },
    });
    return rows.map((r) => this.toWorkspaceView(r.workspace, r.role));
  }

  // ── Email verification ──────────────────────────────────────────────────────

  async verifyEmail(dto: VerifyEmailDto): Promise<{ success: true }> {
    const tokenHash = this.tokens.hash(dto.token);
    const row = await this.db.query.emailVerificationTokens.findFirst({
      where: eq(emailVerificationTokens.tokenHash, tokenHash),
    });

    if (!row || row.used || row.expiresAt.getTime() <= Date.now()) {
      throw rpcError(
        'INVALID_VERIFICATION_TOKEN',
        'The verification token is invalid, expired, or already used.',
      );
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ emailVerified: true })
        .where(eq(users.id, row.userId));
      await tx
        .update(emailVerificationTokens)
        .set({ used: true })
        .where(eq(emailVerificationTokens.id, row.id));
    });

    return { success: true };
  }

  /** Resend verification for the authenticated user (idempotent if verified). */
  async resendVerification(payload: {
    userId: string;
  }): Promise<{ success: true }> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, payload.userId),
      columns: { id: true, email: true, emailVerified: true },
    });
    if (!user) {
      throw rpcError('NOT_FOUND', 'User not found.');
    }
    if (!user.emailVerified) {
      await this.issueVerificationEmail(user.id, user.email);
    }
    return { success: true };
  }

  /** Invalidate prior unused verification tokens, issue a fresh one, send mail. */
  private async issueVerificationEmail(
    userId: string,
    email: string,
  ): Promise<void> {
    const token = this.tokens.newOpaqueToken();
    const ttlMs = durationToMs(
      this.config.get<string>('EMAIL_VERIFY_TTL', '24h'),
    );

    await this.db
      .update(emailVerificationTokens)
      .set({ used: true })
      .where(
        and(
          eq(emailVerificationTokens.userId, userId),
          eq(emailVerificationTokens.used, false),
        ),
      );
    await this.db.insert(emailVerificationTokens).values({
      tokenHash: token.hash,
      userId,
      expiresAt: new Date(Date.now() + ttlMs),
    });

    const base = this.config.get<string>('APP_URL', 'http://localhost:4200');
    const link = `${base}/verify-email?token=${token.raw}`;
    // Don't let a mail failure break registration/resend.
    try {
      await this.mail.sendVerification(email, link);
    } catch (err) {
      this.logger.error(
        `Failed to send verification email to ${email}`,
        err as Error,
      );
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Issue a refresh token row + access token for a user. */
  private async startSession(
    user: UserRow,
    rememberMe = false,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    refreshExpiresAt: string;
  }> {
    const refresh = this.tokens.newRefreshToken();
    const refreshExpiresAt = this.tokens.refreshExpiresAt(rememberMe);
    await this.db.insert(refreshTokens).values({
      tokenHash: refresh.hash,
      userId: user.id,
      expiresAt: refreshExpiresAt,
      rememberMe,
    });
    return {
      accessToken: this.tokens.signAccessToken(user),
      refreshToken: refresh.raw,
      refreshExpiresAt: refreshExpiresAt.toISOString(),
    };
  }

  private async primaryOrg(
    userId: string,
  ): Promise<{ org: OrgRow; orgRole: string }> {
    const row = await this.db.query.orgMembers.findFirst({
      where: eq(orgMembers.userId, userId),
      orderBy: orgMembers.createdAt,
      with: { org: true },
    });
    if (!row) {
      throw rpcError('INTERNAL_ERROR', 'User has no organization.');
    }
    return { org: row.org, orgRole: row.role };
  }

  private async primaryWorkspace(
    userId: string,
  ): Promise<{ workspace: WorkspaceRow; workspaceRole: string }> {
    const row = await this.db.query.workspaceMembers.findFirst({
      where: eq(workspaceMembers.userId, userId),
      orderBy: workspaceMembers.createdAt,
      with: { workspace: true },
    });
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
      emailVerified: u.emailVerified,
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
