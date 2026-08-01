import { Inject, Injectable } from '@nestjs/common';
import {
  AddWorkspaceMemberDto,
  Permission,
  UpdateWorkspaceMemberDto,
  WorkspaceMemberView,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, eq } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';
import { AuthorizationService } from './authorization.service';
import { EntitlementsService } from './entitlements.service';

const { users, workspaceMembers } = schema;

type WorkspaceMemberRow = typeof workspaceMembers.$inferSelect & {
  user: typeof users.$inferSelect;
};

@Injectable()
export class MembersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly entitlements: EntitlementsService,
    private readonly authz: AuthorizationService,
  ) {}

  // ── Workspace members ────────────────────────────────────────────────────────

  async listWorkspaceMembers(p: {
    callerUserId: string;
    workspaceId: string;
  }): Promise<WorkspaceMemberView[]> {
    await this.authz.authorize({
      userId: p.callerUserId,
      permission: Permission.WORKSPACE_MEMBERS_VIEW,
      workspaceId: p.workspaceId,
    });
    const rows = await this.db.query.workspaceMembers.findMany({
      where: eq(workspaceMembers.workspaceId, p.workspaceId),
      orderBy: workspaceMembers.createdAt,
      with: { user: true },
    });
    return rows.map((r) => this.toWorkspaceMemberView(r as WorkspaceMemberRow));
  }

  async addWorkspaceMember(p: {
    callerUserId: string;
    workspaceId: string;
    dto: AddWorkspaceMemberDto;
  }): Promise<WorkspaceMemberView> {
    await this.authz.authorize({
      userId: p.callerUserId,
      permission: Permission.WORKSPACE_MEMBERS_MANAGE,
      workspaceId: p.workspaceId,
    });
    const user = await this.findUserByEmail(p.dto.email);
    await this.ensureNotWorkspaceMember(p.workspaceId, user.id);
    const row = await this.db.transaction(async (tx) => {
      // Enforce the plan's seat quota (TOCTOU-safe, advisory-locked).
      await this.entitlements.assertMemberQuotaTx(tx, p.workspaceId);
      const [r] = await tx
        .insert(workspaceMembers)
        .values({
          workspaceId: p.workspaceId,
          userId: user.id,
          role: p.dto.role,
        })
        .returning();
      return r;
    });
    return this.toWorkspaceMemberView({ ...row, user });
  }

  async updateWorkspaceMember(p: {
    callerUserId: string;
    workspaceId: string;
    targetUserId: string;
    dto: UpdateWorkspaceMemberDto;
  }): Promise<WorkspaceMemberView> {
    await this.authz.authorize({
      userId: p.callerUserId,
      permission: Permission.WORKSPACE_MEMBERS_MANAGE,
      workspaceId: p.workspaceId,
    });
    const target = await this.requireWorkspaceMembership(
      p.workspaceId,
      p.targetUserId,
    );

    // Granting or changing the owner role is owner-only (WORKSPACE_ROLE_ASSIGN).
    const touchesOwnerRole = p.dto.role === 'owner' || target.role === 'owner';
    if (touchesOwnerRole) {
      await this.authz.authorize({
        userId: p.callerUserId,
        permission: Permission.WORKSPACE_ROLE_ASSIGN,
        workspaceId: p.workspaceId,
      });
    }
    // Don't leave the workspace without an owner.
    if (target.role === 'owner' && p.dto.role !== 'owner') {
      await this.assertNotLastWorkspaceOwner(p.workspaceId);
    }

    const [row] = await this.db
      .update(workspaceMembers)
      .set({ role: p.dto.role })
      .where(
        and(
          eq(workspaceMembers.workspaceId, p.workspaceId),
          eq(workspaceMembers.userId, p.targetUserId),
        ),
      )
      .returning();
    const user = await this.requireUser(p.targetUserId);
    return this.toWorkspaceMemberView({ ...row, user });
  }

  async removeWorkspaceMember(p: {
    callerUserId: string;
    workspaceId: string;
    targetUserId: string;
  }): Promise<{ success: true }> {
    await this.authz.authorize({
      userId: p.callerUserId,
      permission: Permission.WORKSPACE_MEMBERS_MANAGE,
      workspaceId: p.workspaceId,
    });
    const target = await this.requireWorkspaceMembership(
      p.workspaceId,
      p.targetUserId,
    );

    // Removing an owner is owner-only + can't remove the last owner.
    if (target.role === 'owner') {
      await this.authz.authorize({
        userId: p.callerUserId,
        permission: Permission.WORKSPACE_ROLE_ASSIGN,
        workspaceId: p.workspaceId,
      });
      await this.assertNotLastWorkspaceOwner(p.workspaceId);
    }

    await this.db
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, p.workspaceId),
          eq(workspaceMembers.userId, p.targetUserId),
        ),
      );
    return { success: true };
  }

  // ── Lookups & guards ──────────────────────────────────────────────────────────

  async findUserByEmail(email: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (!user) {
      throw rpcError('NOT_FOUND', 'No user exists with that email.');
    }
    return user;
  }

  private async requireUser(userId: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw rpcError('NOT_FOUND', 'User not found.');
    return user;
  }

  async requireWorkspaceMembership(workspaceId: string, userId: string) {
    const row = await this.db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    });
    if (!row)
      throw rpcError('NOT_FOUND', 'This user is not a member of the workspace.');
    return row;
  }

  private async ensureNotWorkspaceMember(workspaceId: string, userId: string) {
    const existing = await this.db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
      columns: { id: true },
    });
    if (existing) {
      throw rpcError('CONFLICT', 'User is already a member of this workspace.');
    }
  }

  private async assertNotLastWorkspaceOwner(workspaceId: string) {
    const owners = await this.db.$count(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.role, 'owner'),
      ),
    );
    if (owners <= 1) {
      throw rpcError('CONFLICT', 'The workspace must keep at least one owner.');
    }
  }

  // ── Views ─────────────────────────────────────────────────────────────────────

  private toWorkspaceMemberView(r: WorkspaceMemberRow): WorkspaceMemberView {
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      userId: r.userId,
      role: r.role,
      createdAt: r.createdAt.toISOString(),
      user: {
        id: r.user.id,
        email: r.user.email,
        name: r.user.name,
        avatar: r.user.avatar,
      },
    };
  }
}
