import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthResult,
  ForgotPasswordDto,
  GoogleProfile,
  LoginDto,
  LogoutPayload,
  ProjectMembership,
  ProjectRole,
  ProjectView,
  RefreshPayload,
  RefreshResult,
  RegisterDto,
  ResetPasswordDto,
  SessionView,
  UpdateProfileDto,
  UserView,
  VerifyEmailDto,
  WorkspaceMembership,
  WorkspaceRole,
  WorkspaceView,
} from '@wriven/contracts';
import { DRIZZLE, type DrizzleDB, dbError } from '@wriven/database';
import * as bcrypt from 'bcrypt';
import { timingSafeEqual } from 'crypto';
import { and, desc, eq, isNotNull, lt } from 'drizzle-orm';
import { resolveAvatarUrl } from '../common/avatar';
import { durationToMs } from '../common/duration';
import { rpcError } from '../common/rpc-error';
import { uniqueSlug } from '../common/slug';
import * as schema from '../db/schema';
import { AuthorizationService } from './authorization.service';
import { InvitationsService } from './invitations.service';
import { MailService } from './mail.service';
import { TokenService } from './token.service';

const {
  users,
  workspaces,
  workspaceMembers,
  projects,
  projectMembers,
  refreshTokens,
  passwordResetTokens,
  emailVerificationTokens,
  plans,
  subscriptions,
} = schema;

type UserRow = typeof users.$inferSelect;
type WorkspaceRow = typeof workspaces.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;

/** Failed 6-digit code guesses allowed before the code is locked. */
const OTP_MAX_ATTEMPTS = 5;

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
    private readonly invitations: InvitationsService,
    private readonly authz: AuthorizationService,
  ) {}

  /** Claim any pending invitations for a freshly-created account. Best-effort. */
  private async claimInvites(userId: string, email: string): Promise<void> {
    try {
      await this.invitations.claimPending(userId, email);
    } catch (err) {
      this.logger.warn(`Invite auto-claim failed for ${email}: ${String(err)}`);
    }
  }

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

    let result: {
      user: UserRow;
      workspace: WorkspaceRow;
    };
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

        const workspaceName = dto.workspaceName ?? `${dto.name}'s Workspace`;
        const [workspace] = await tx
          .insert(workspaces)
          .values({
            name: workspaceName,
            slug: uniqueSlug(workspaceName),
            createdBy: user.id,
          })
          .returning();

        await tx
          .insert(workspaceMembers)
          .values({
            workspaceId: workspace.id,
            userId: user.id,
            role: 'owner',
          });

        await tx.insert(refreshTokens).values({
          tokenHash: refresh.hash,
          userId: user.id,
          expiresAt: refreshExpiresAt,
          rememberMe: false,
        });

        // Start the workspace on the free plan (workspace = billing unit).
        const freePlan = await tx.query.plans.findFirst({
          where: eq(plans.key, 'free'),
          columns: { id: true },
        });
        if (freePlan) {
          await tx.insert(subscriptions).values({
            workspaceId: workspace.id,
            planId: freePlan.id,
          });
        }

        // No default project — the user creates their first project in the UI.
        return { user, workspace };
      });
    } catch (err) {
      // Race: another signup inserted the same email between the check and now.
      // drizzle-orm wraps postgres.js errors — unwrap to the SQLSTATE code.
      const e = dbError(err);
      if (e?.code === '23505' && e.constraint.includes('email')) {
        throw rpcError(
          'EMAIL_ALREADY_EXISTS',
          'An account with this email already exists.',
        );
      }
      throw err;
    }

    // No auto verification email on signup — verification is opt-in,
    // triggered on demand from the profile page.
    await this.claimInvites(result.user.id, result.user.email);

    return {
      accessToken: this.tokens.signAccessToken(result.user),
      refreshToken: refresh.raw,
      refreshExpiresAt: refreshExpiresAt.toISOString(),
      user: this.toUserView(result.user),
      workspace: this.toWorkspaceView(result.workspace, 'owner'),
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
    if (user.suspendedAt) {
      throw rpcError(
        'FORBIDDEN',
        'This account has been suspended. Contact support.',
      );
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

    const { workspace, workspaceRole } = await this.primaryWorkspace(user.id);

    return {
      accessToken: this.tokens.signAccessToken(user),
      refreshToken: refresh.raw,
      refreshExpiresAt: refreshExpiresAt.toISOString(),
      user: this.toUserView(user),
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
    // A suspended account must not be able to mint new access tokens.
    if (user.suspendedAt) {
      await this.db
        .update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.userId, user.id));
      throw rpcError('FORBIDDEN', 'This account has been suspended.');
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
          const workspaceName = `${profile.name}'s Workspace`;
          const [ws] = await tx
            .insert(workspaces)
            .values({
              name: workspaceName,
              slug: uniqueSlug(workspaceName),
              createdBy: u.id,
            })
            .returning();
          await tx
            .insert(workspaceMembers)
            .values({ workspaceId: ws.id, userId: u.id, role: 'owner' });
          // Start the workspace on the free plan.
          const freePlan = await tx.query.plans.findFirst({
            where: eq(plans.key, 'free'),
            columns: { id: true },
          });
          if (freePlan) {
            await tx.insert(subscriptions).values({
              workspaceId: ws.id,
              planId: freePlan.id,
            });
          }
          // No default project — the user creates their first project in the UI.
          return u;
        });
        await this.claimInvites(user.id, user.email);
      }
    }

    const session = await this.startSession(user);
    const { workspace, workspaceRole } = await this.primaryWorkspace(user.id);

    return {
      ...session,
      user: this.toUserView(user),
      workspace: this.toWorkspaceView(workspace, workspaceRole),
    };
  }

  // ── Workspace membership (called by the gateway's WorkspaceGuard) ───────────

  async validateWorkspaceMember(p: {
    userId: string;
    workspaceId: string;
  }): Promise<WorkspaceMembership> {
    const roles = await this.authz.resolveRoles(p.userId, {
      workspaceId: p.workspaceId,
    });
    if (!roles.wsRole) {
      throw rpcError('FORBIDDEN', 'You are not a member of this workspace.');
    }
    return {
      workspaceId: p.workspaceId,
      role: roles.wsRole,
      permissions: [...roles.permissions],
    };
  }

  /**
   * Project membership check (called by the gateway's ProjectGuard). Access is
   * granted when the user has an explicit `project_members` row OR is a
   * workspace owner/admin (the cascade grants them project permissions with no
   * project row). The returned permission set is already cascade-resolved, so
   * the gateway no longer needs a workspace-admin bypass.
   */
  async validateProjectMember(p: {
    userId: string;
    projectId: string;
  }): Promise<ProjectMembership> {
    const roles = await this.authz.resolveRoles(p.userId, {
      projectId: p.projectId,
    });
    const hasAccess =
      roles.projRole !== null ||
      roles.wsRole === 'owner' ||
      roles.wsRole === 'admin';
    if (!hasAccess) {
      throw rpcError('FORBIDDEN', 'You do not have access to this project.');
    }
    // Access implies the project row was found, so its owning workspace is set.
    if (!roles.workspaceId) {
      throw rpcError('NOT_FOUND', 'Project not found.');
    }
    return {
      projectId: p.projectId,
      workspaceId: roles.workspaceId,
      role: roles.projRole,
      permissions: [...roles.permissions],
    };
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

  /**
   * Self-service profile update: `name` and/or `avatar`. `avatar` must be
   * null (clear), an http(s) URL (e.g. Google), or an R2 key under this
   * user's own `avatars/<userId>/` prefix — rejects keys of other objects.
   * Returns the raw prior avatar value when it changed, so the gateway can
   * best-effort delete the orphaned R2 object.
   */
  async updateProfile(payload: {
    userId: string;
    dto: UpdateProfileDto;
  }): Promise<{ user: UserView; previousAvatarKey: string | null }> {
    const { userId, dto } = payload;
    const existing = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!existing) throw rpcError('NOT_FOUND', 'User not found.');

    const patch: Partial<Pick<UserRow, 'name' | 'avatar'>> = {};
    if (dto.name != null) patch.name = dto.name;
    let previousAvatarKey: string | null = null;
    if (dto.avatar !== undefined) {
      this.assertValidAvatar(dto.avatar, userId);
      patch.avatar = dto.avatar; // null clears; key/URL stored verbatim
      previousAvatarKey = existing.avatar; // raw DB value (key or Google URL)
    }

    if (Object.keys(patch).length === 0) {
      return { user: this.toUserView(existing), previousAvatarKey: null }; // no-op
    }
    const [updated] = await this.db
      .update(users)
      .set(patch)
      .where(eq(users.id, userId))
      .returning();
    if (!updated) throw rpcError('NOT_FOUND', 'User not found.');
    return { user: this.toUserView(updated), previousAvatarKey };
  }

  /** Validate an incoming avatar value for {@link updateProfile}. */
  private assertValidAvatar(avatar: string | null, userId: string): void {
    if (avatar == null) return; // clearing the photo
    if (/^https?:\/\//i.test(avatar)) return; // external URL (Google)
    if (avatar.startsWith(`avatars/${userId}/`)) return; // own R2 key
    throw rpcError(
      'VALIDATION_ERROR',
      'Invalid avatar. Upload a new photo or clear it.',
    );
  }

  /** Full session context for restoring client state after a reload. */
  async getSession(payload: { userId: string }): Promise<SessionView> {
    const [user, workspaces, projects] = await Promise.all([
      this.getUserById(payload),
      this.listWorkspaces(payload),
      this.listProjects(payload),
    ]);
    return { user, workspaces, projects };
  }

  async listWorkspaces(payload: { userId: string }): Promise<WorkspaceView[]> {
    const rows = await this.db.query.workspaceMembers.findMany({
      where: eq(workspaceMembers.userId, payload.userId),
      orderBy: workspaceMembers.createdAt,
      with: { workspace: true },
    });
    return rows.map((r) => this.toWorkspaceView(r.workspace, r.role));
  }

  async listProjects(payload: { userId: string }): Promise<ProjectView[]> {
    const rows = await this.db.query.projectMembers.findMany({
      where: eq(projectMembers.userId, payload.userId),
      orderBy: projectMembers.createdAt,
      with: { project: true },
    });
    return rows.map((r) => this.toProjectView(r.project, r.role));
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

  /**
   * Verify the 6-digit OTP path. Identity comes from the gateway JWT — the
   * code alone is never enough to find the row (no code enumeration).
   */
  async verifyEmailCode(payload: {
    userId: string;
    code: string;
  }): Promise<{ success: true }> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, payload.userId),
      columns: { id: true, emailVerified: true },
    });
    if (!user) {
      throw rpcError('NOT_FOUND', 'User not found.');
    }
    // Idempotent: already verified via the link path in another tab.
    if (user.emailVerified) {
      return { success: true };
    }

    const row = await this.db.query.emailVerificationTokens.findFirst({
      where: and(
        eq(emailVerificationTokens.userId, payload.userId),
        eq(emailVerificationTokens.used, false),
        isNotNull(emailVerificationTokens.codeHash),
      ),
      orderBy: [desc(emailVerificationTokens.createdAt)],
    });
    if (!row) {
      throw rpcError(
        'INVALID_VERIFICATION_CODE',
        'No active verification code. Request a new one from your profile page.',
      );
    }
    if ((row.codeExpiresAt?.getTime() ?? 0) <= Date.now()) {
      throw rpcError(
        'INVALID_VERIFICATION_CODE',
        'This code has expired. Request a new one.',
      );
    }
    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      throw rpcError(
        'INVALID_VERIFICATION_CODE',
        'Too many incorrect attempts. Request a new code.',
      );
    }

    const expected = Buffer.from(
      this.tokens.hashVerificationCode(payload.code),
      'hex',
    );
    const actual = Buffer.from(row.codeHash!, 'hex');
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      // Guarded atomic increment — two racing wrong guesses can't both slip
      // past the cap.
      const [updated] = await this.db
        .update(emailVerificationTokens)
        .set({ attempts: row.attempts + 1 })
        .where(
          and(
            eq(emailVerificationTokens.id, row.id),
            lt(emailVerificationTokens.attempts, OTP_MAX_ATTEMPTS),
          ),
        )
        .returning({ attempts: emailVerificationTokens.attempts });
      const attemptsNow = updated?.attempts ?? OTP_MAX_ATTEMPTS;
      throw rpcError(
        'INVALID_VERIFICATION_CODE',
        attemptsNow >= OTP_MAX_ATTEMPTS
          ? 'Too many incorrect attempts. Request a new code.'
          : `Incorrect code. ${OTP_MAX_ATTEMPTS - attemptsNow} attempt${OTP_MAX_ATTEMPTS - attemptsNow === 1 ? '' : 's'} remaining.`,
      );
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ emailVerified: true })
        .where(eq(users.id, payload.userId));
      await tx
        .update(emailVerificationTokens)
        .set({ used: true })
        .where(eq(emailVerificationTokens.id, row.id));
    });

    return { success: true };
  }
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
    const code = this.tokens.newVerificationCode();
    const codeTtlMs = durationToMs(this.config.get<string>('OTP_TTL', '10m'));

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
      codeHash: this.tokens.hashVerificationCode(code),
      codeExpiresAt: new Date(Date.now() + codeTtlMs),
      attempts: 0,
    });

    const base = this.config.get<string>('APP_URL', 'http://localhost:4200');
    const link = `${base}/verify-email?token=${token.raw}`;
    // Don't let a mail failure break registration/resend.
    try {
      await this.mail.sendVerification(email, link, code);
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

  private async primaryWorkspace(
    userId: string,
  ): Promise<{ workspace: WorkspaceRow; workspaceRole: WorkspaceRole }> {
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
      avatar: resolveAvatarUrl(u.avatar),
      provider: u.provider,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt.toISOString(),
    };
  }

  private toWorkspaceView(w: WorkspaceRow, role: WorkspaceRole): WorkspaceView {
    return {
      id: w.id,
      name: w.name,
      slug: w.slug,
      createdBy: w.createdBy,
      role,
    };
  }

  private toProjectView(p: ProjectRow, role: ProjectRole | null): ProjectView {
    return {
      id: p.id,
      workspaceId: p.workspaceId,
      name: p.name,
      slug: p.slug,
      createdBy: p.createdBy,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      role,
    };
  }
}
