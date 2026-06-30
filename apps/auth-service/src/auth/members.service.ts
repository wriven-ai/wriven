import { Inject, Injectable } from '@nestjs/common';
import {
  AddWorkspaceMemberDto,
  UpdateWorkspaceMemberDto,
  WorkspaceMemberView,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, eq } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';
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
  ) {}

  // ── Workspace members ────────────────────────────────────────────────────────

  async listWorkspaceMembers(p: {
    callerUserId: string;
    workspaceId: string;
  }): Promise<WorkspaceMemberView[]> {
    await this.requireWorkspaceRole(p.callerUserId, p.workspaceId, [
      'owner',
      'admin',
      'member',
    ]);
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
    await this.requireWorkspaceRole(p.callerUserId, p.workspaceId, [
      'owner',
      'admin',
    ]);
    const user = await this.findUserByEmail(p.dto.email);
    await this.ensureNotWorkspaceMember(p.workspaceId, user.id);
    // Enforce the workspace plan's member (seat) quota.
    await this.entitlements.assertMemberQuota(p.workspaceId);
    const [row] = await this.db
      .insert(workspaceMembers)
      .values({ workspaceId: p.workspaceId, userId: user.id, role: p.dto.role })
      .returning();
    return this.toWorkspaceMemberView({ ...row, user });
  }

  async updateWorkspaceMember(p: {
    callerUserId: string;
    workspaceId: string;
    targetUserId: string;
    dto: UpdateWorkspaceMemberDto;
  }): Promise<WorkspaceMemberView> {
    const callerRole = await this.requireWorkspaceRole(
      p.callerUserId,
      p.workspaceId,
      ['owner', 'admin'],
    );
    const target = await this.requireWorkspaceMembership(
      p.workspaceId,
      p.targetUserId,
    );

    // Only an owner may grant or change the owner role.
    if (
      (p.dto.role === 'owner' || target.role === 'owner') &&
      callerRole !== 'owner'
    ) {
      throw rpcError('FORBIDDEN', 'Only an owner can manage the owner role.');
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
    const callerRole = await this.requireWorkspaceRole(
      p.callerUserId,
      p.workspaceId,
      ['owner', 'admin'],
    );
    const target = await this.requireWorkspaceMembership(
      p.workspaceId,
      p.targetUserId,
    );

    if (target.role === 'owner') {
      if (callerRole !== 'owner') {
        throw rpcError('FORBIDDEN', 'Only an owner can remove an owner.');
      }
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

  // ── Authorization helpers ─────────────────────────────────────────────────────

  async requireWorkspaceRole(
    userId: string,
    workspaceId: string,
    allowed: string[],
  ): Promise<string> {
    const row = await this.db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
      columns: { role: true },
    });
    if (!row || !allowed.includes(row.role)) {
      throw rpcError('FORBIDDEN', 'You do not have access to this workspace.');
    }
    return row.role;
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
