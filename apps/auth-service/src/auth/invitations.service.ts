import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InvitationPreview,
  InvitationScope,
  InvitationView,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';
import { MembersService } from './members.service';
import { ProjectsService } from './projects.service';
import { MailService } from './mail.service';

const { invitations, workspaces, projects, users, workspaceMembers, projectMembers } =
  schema;
type InvitationRow = typeof invitations.$inferSelect;

const INVITE_TTL_DAYS = 7;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly members: MembersService,
    private readonly projects: ProjectsService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // ── Create ──────────────────────────────────────────────────────────────────

  async create(p: {
    callerUserId: string;
    scope: InvitationScope;
    workspaceId?: string;
    projectId?: string;
    email: string;
    role: string;
  }): Promise<InvitationView> {
    let workspaceId = p.workspaceId ?? '';
    if (p.scope === 'project') {
      const project = await this.requireProject(p.projectId!);
      workspaceId = project.workspaceId;
      await this.projects.requireProjectRole(p.callerUserId, p.projectId!, [
        'admin',
      ]);
    } else {
      await this.members.requireWorkspaceRole(p.callerUserId, workspaceId, [
        'owner',
        'admin',
      ]);
    }

    await this.ensureNotAlreadyMember(p.scope, workspaceId, p.projectId, p.email);
    await this.revokeExistingPending(p.scope, workspaceId, p.projectId, p.email);

    const raw = randomBytes(32).toString('base64url');
    const [row] = await this.db
      .insert(invitations)
      .values({
        email: p.email,
        scope: p.scope,
        workspaceId,
        projectId: p.projectId ?? null,
        role: p.role,
        tokenHash: sha256(raw),
        invitedBy: p.callerUserId,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      })
      .returning();

    await this.sendInviteEmail(row, raw);
    return this.toView(row, await this.userName(p.callerUserId));
  }

  // ── List / revoke / resend ───────────────────────────────────────────────────

  async list(p: {
    callerUserId: string;
    scope: InvitationScope;
    workspaceId?: string;
    projectId?: string;
  }): Promise<InvitationView[]> {
    if (p.scope === 'project') {
      await this.projects.requireProjectRole(p.callerUserId, p.projectId!, [
        'admin',
      ]);
    } else {
      await this.members.requireWorkspaceRole(p.callerUserId, p.workspaceId!, [
        'owner',
        'admin',
      ]);
    }

    const where =
      p.scope === 'project'
        ? and(
            eq(invitations.projectId, p.projectId!),
            eq(invitations.status, 'pending'),
          )
        : and(
            eq(invitations.workspaceId, p.workspaceId!),
            eq(invitations.scope, 'workspace'),
            eq(invitations.status, 'pending'),
          );

    const rows = await this.db.query.invitations.findMany({
      where,
      orderBy: desc(invitations.createdAt),
    });
    const names = await this.namesFor(rows.map((r) => r.invitedBy));
    return rows.map((r) => this.toView(r, names.get(r.invitedBy) ?? null));
  }

  async revoke(p: { callerUserId: string; id: string }): Promise<{ success: true }> {
    const row = await this.requireInvitation(p.id);
    await this.authorizeManage(p.callerUserId, row);
    await this.db
      .update(invitations)
      .set({ status: 'revoked' })
      .where(eq(invitations.id, row.id));
    return { success: true };
  }

  async resend(p: { callerUserId: string; id: string }): Promise<InvitationView> {
    const row = await this.requireInvitation(p.id);
    await this.authorizeManage(p.callerUserId, row);
    if (row.status !== 'pending') {
      throw rpcError('CONFLICT', 'Only a pending invitation can be resent.');
    }
    const raw = randomBytes(32).toString('base64url');
    const [updated] = await this.db
      .update(invitations)
      .set({
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      })
      .where(eq(invitations.id, row.id))
      .returning();
    await this.sendInviteEmail(updated, raw);
    return this.toView(updated, await this.userName(p.callerUserId));
  }

  // ── Public preview + accept ──────────────────────────────────────────────────

  async preview(p: { token: string }): Promise<InvitationPreview> {
    const row = await this.findValidByToken(p.token);
    const account = await this.db.query.users.findFirst({
      where: eq(users.email, row.email),
      columns: { id: true },
    });
    return {
      email: row.email,
      scope: row.scope as InvitationScope,
      role: row.role,
      workspaceName: await this.workspaceName(row.workspaceId),
      projectName: row.projectId ? await this.projectName(row.projectId) : null,
      inviterName: await this.userName(row.invitedBy),
      requiresSignup: !account,
    };
  }

  async accept(p: {
    token: string;
    userId: string;
  }): Promise<{ scope: InvitationScope; workspaceSlug: string; projectSlug: string | null }> {
    const row = await this.findValidByToken(p.token);
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, p.userId),
      columns: { email: true },
    });
    if (!user) throw rpcError('NOT_FOUND', 'User not found.');
    if (user.email !== row.email) {
      throw rpcError(
        'FORBIDDEN',
        `This invitation is for ${row.email}. Log in with that email to accept.`,
      );
    }

    await this.db.transaction(async (tx) => this.applyInvitation(tx, row, p.userId));

    const ws = await this.db.query.workspaces.findFirst({
      where: eq(workspaces.id, row.workspaceId),
      columns: { slug: true },
    });
    const proj = row.projectId
      ? await this.db.query.projects.findFirst({
          where: eq(projects.id, row.projectId),
          columns: { slug: true },
        })
      : null;
    return {
      scope: row.scope as InvitationScope,
      workspaceSlug: ws?.slug ?? '',
      projectSlug: proj?.slug ?? null,
    };
  }

  /**
   * Auto-claim all pending invites for an email — called on signup so a brand-new
   * user lands already in the workspaces/projects they were invited to.
   * Best-effort: a failure on one invite must not break registration.
   */
  async claimPending(userId: string, email: string): Promise<void> {
    const rows = await this.db.query.invitations.findMany({
      where: and(eq(invitations.email, email), eq(invitations.status, 'pending')),
    });
    for (const row of rows) {
      if (row.expiresAt.getTime() < Date.now()) continue;
      try {
        await this.db.transaction((tx) => this.applyInvitation(tx, row, userId));
      } catch (err) {
        this.logger.warn(
          `Failed to auto-claim invite ${row.id} for ${email}: ${String(err)}`,
        );
      }
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  private async applyInvitation(
    tx: Parameters<Parameters<DrizzleDB<typeof schema>['transaction']>[0]>[0],
    invite: InvitationRow,
    userId: string,
  ): Promise<void> {
    if (invite.scope === 'workspace') {
      await tx
        .insert(workspaceMembers)
        .values({ workspaceId: invite.workspaceId, userId, role: invite.role })
        .onConflictDoNothing({
          target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        });
    } else {
      // Project membership implies baseline workspace membership.
      await this.projects.ensureWorkspaceMember(tx, invite.workspaceId, userId);
      await tx
        .insert(projectMembers)
        .values({ projectId: invite.projectId!, userId, role: invite.role })
        .onConflictDoNothing({
          target: [projectMembers.projectId, projectMembers.userId],
        });
    }
    await tx
      .update(invitations)
      .set({ status: 'accepted', acceptedAt: new Date(), acceptedBy: userId })
      .where(eq(invitations.id, invite.id));
  }

  private async findValidByToken(token: string): Promise<InvitationRow> {
    const row = await this.db.query.invitations.findFirst({
      where: eq(invitations.tokenHash, sha256(token)),
    });
    if (!row) throw rpcError('NOT_FOUND', 'This invitation is invalid.');
    if (row.status !== 'pending') {
      throw rpcError('CONFLICT', 'This invitation is no longer active.');
    }
    if (row.expiresAt.getTime() < Date.now()) {
      await this.db
        .update(invitations)
        .set({ status: 'expired' })
        .where(eq(invitations.id, row.id));
      throw rpcError('CONFLICT', 'This invitation has expired.');
    }
    return row;
  }

  private async requireInvitation(id: string): Promise<InvitationRow> {
    const row = await this.db.query.invitations.findFirst({
      where: eq(invitations.id, id),
    });
    if (!row) throw rpcError('NOT_FOUND', 'Invitation not found.');
    return row;
  }

  /** The caller must be able to manage the invite's scope (ws owner/admin · proj admin). */
  private async authorizeManage(
    callerUserId: string,
    row: InvitationRow,
  ): Promise<void> {
    if (row.scope === 'project') {
      await this.projects.requireProjectRole(callerUserId, row.projectId!, [
        'admin',
      ]);
    } else {
      await this.members.requireWorkspaceRole(callerUserId, row.workspaceId, [
        'owner',
        'admin',
      ]);
    }
  }

  private async ensureNotAlreadyMember(
    scope: InvitationScope,
    workspaceId: string,
    projectId: string | undefined,
    email: string,
  ): Promise<void> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, email),
      columns: { id: true },
    });
    if (!user) return; // no account → definitely not a member yet
    const existing =
      scope === 'project'
        ? await this.db.query.projectMembers.findFirst({
            where: and(
              eq(projectMembers.projectId, projectId!),
              eq(projectMembers.userId, user.id),
            ),
            columns: { id: true },
          })
        : await this.db.query.workspaceMembers.findFirst({
            where: and(
              eq(workspaceMembers.workspaceId, workspaceId),
              eq(workspaceMembers.userId, user.id),
            ),
            columns: { id: true },
          });
    if (existing) {
      throw rpcError('CONFLICT', 'That user is already a member.');
    }
  }

  private async revokeExistingPending(
    scope: InvitationScope,
    workspaceId: string,
    projectId: string | undefined,
    email: string,
  ): Promise<void> {
    const target =
      scope === 'project'
        ? eq(invitations.projectId, projectId!)
        : and(
            eq(invitations.workspaceId, workspaceId),
            eq(invitations.scope, 'workspace'),
          );
    await this.db
      .update(invitations)
      .set({ status: 'revoked' })
      .where(
        and(eq(invitations.email, email), eq(invitations.status, 'pending'), target),
      );
  }

  private async sendInviteEmail(row: InvitationRow, raw: string): Promise<void> {
    const origin =
      this.config.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:3000';
    const link = `${origin}/invite/${raw}`;
    const targetName = row.projectId
      ? await this.projectName(row.projectId)
      : await this.workspaceName(row.workspaceId);
    await this.mail.sendInvitation(row.email, link, {
      inviterName: await this.userName(row.invitedBy),
      targetName,
      role: row.role,
    });
  }

  private async requireProject(projectId: string) {
    const project = await this.db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      columns: { id: true, workspaceId: true },
    });
    if (!project) throw rpcError('NOT_FOUND', 'Project not found.');
    return project;
  }

  private async workspaceName(id: string): Promise<string> {
    const w = await this.db.query.workspaces.findFirst({
      where: eq(workspaces.id, id),
      columns: { name: true },
    });
    return w?.name ?? 'workspace';
  }

  private async projectName(id: string): Promise<string> {
    const pr = await this.db.query.projects.findFirst({
      where: eq(projects.id, id),
      columns: { name: true },
    });
    return pr?.name ?? 'project';
  }

  private async userName(id: string): Promise<string | null> {
    const u = await this.db.query.users.findFirst({
      where: eq(users.id, id),
      columns: { name: true },
    });
    return u?.name ?? null;
  }

  private async namesFor(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.db.query.users.findMany({
      where: inArray(users.id, unique),
      columns: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private toView(row: InvitationRow, invitedByName: string | null): InvitationView {
    return {
      id: row.id,
      email: row.email,
      scope: row.scope as InvitationScope,
      workspaceId: row.workspaceId,
      projectId: row.projectId,
      role: row.role,
      status: row.status as InvitationView['status'],
      invitedByName,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
