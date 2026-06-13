import { Inject, Injectable } from '@nestjs/common';
import {
  AddOrgMemberDto,
  AddWorkspaceMemberDto,
  OrgMemberView,
  UpdateOrgMemberDto,
  UpdateWorkspaceMemberDto,
  WorkspaceMemberView,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, eq } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';

const { users, orgMembers, workspaceMembers } = schema;

type OrgMemberRow = typeof orgMembers.$inferSelect & {
  user: typeof users.$inferSelect;
};
type WorkspaceMemberRow = typeof workspaceMembers.$inferSelect & {
  user: typeof users.$inferSelect;
};

@Injectable()
export class MembersService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>) {}

  // ── Org members ─────────────────────────────────────────────────────────────

  async listOrgMembers(p: {
    callerUserId: string;
    orgId: string;
  }): Promise<OrgMemberView[]> {
    await this.requireOrgRole(p.callerUserId, p.orgId, [
      'owner',
      'admin',
      'member',
    ]);
    const rows = await this.db.query.orgMembers.findMany({
      where: eq(orgMembers.orgId, p.orgId),
      orderBy: orgMembers.createdAt,
      with: { user: true },
    });
    return rows.map((r) => this.toOrgMemberView(r as OrgMemberRow));
  }

  async addOrgMember(p: {
    callerUserId: string;
    orgId: string;
    dto: AddOrgMemberDto;
  }): Promise<OrgMemberView> {
    await this.requireOrgRole(p.callerUserId, p.orgId, ['owner', 'admin']);
    const user = await this.findUserByEmail(p.dto.email);
    await this.ensureNotOrgMember(p.orgId, user.id);
    const [row] = await this.db
      .insert(orgMembers)
      .values({ orgId: p.orgId, userId: user.id, role: p.dto.role })
      .returning();
    return this.toOrgMemberView({ ...row, user });
  }

  async updateOrgMember(p: {
    callerUserId: string;
    orgId: string;
    targetUserId: string;
    dto: UpdateOrgMemberDto;
  }): Promise<OrgMemberView> {
    const callerRole = await this.requireOrgRole(p.callerUserId, p.orgId, [
      'owner',
      'admin',
    ]);
    const target = await this.requireOrgMembership(p.orgId, p.targetUserId);

    // Only an owner may grant or change the owner role.
    if (
      (p.dto.role === 'owner' || target.role === 'owner') &&
      callerRole !== 'owner'
    ) {
      throw rpcError('FORBIDDEN', 'Only an owner can manage the owner role.');
    }
    // Don't leave the org without an owner.
    if (target.role === 'owner' && p.dto.role !== 'owner') {
      await this.assertNotLastOrgOwner(p.orgId);
    }

    const [row] = await this.db
      .update(orgMembers)
      .set({ role: p.dto.role })
      .where(and(eq(orgMembers.orgId, p.orgId), eq(orgMembers.userId, p.targetUserId)))
      .returning();
    const user = await this.requireUser(p.targetUserId);
    return this.toOrgMemberView({ ...row, user });
  }

  async removeOrgMember(p: {
    callerUserId: string;
    orgId: string;
    targetUserId: string;
  }): Promise<{ success: true }> {
    const callerRole = await this.requireOrgRole(p.callerUserId, p.orgId, [
      'owner',
      'admin',
    ]);
    const target = await this.requireOrgMembership(p.orgId, p.targetUserId);

    if (target.role === 'owner') {
      if (callerRole !== 'owner') {
        throw rpcError('FORBIDDEN', 'Only an owner can remove an owner.');
      }
      await this.assertNotLastOrgOwner(p.orgId);
    }

    await this.db
      .delete(orgMembers)
      .where(and(eq(orgMembers.orgId, p.orgId), eq(orgMembers.userId, p.targetUserId)));
    return { success: true };
  }

  // ── Workspace members ────────────────────────────────────────────────────────

  async listWorkspaceMembers(p: {
    callerUserId: string;
    workspaceId: string;
  }): Promise<WorkspaceMemberView[]> {
    await this.requireWorkspaceRole(p.callerUserId, p.workspaceId, [
      'admin',
      'editor',
      'viewer',
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
    await this.requireWorkspaceRole(p.callerUserId, p.workspaceId, ['admin']);
    const user = await this.findUserByEmail(p.dto.email);
    await this.ensureNotWorkspaceMember(p.workspaceId, user.id);
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
    await this.requireWorkspaceRole(p.callerUserId, p.workspaceId, ['admin']);
    const target = await this.requireWorkspaceMembership(
      p.workspaceId,
      p.targetUserId,
    );
    if (target.role === 'admin' && p.dto.role !== 'admin') {
      await this.assertNotLastWorkspaceAdmin(p.workspaceId);
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
    await this.requireWorkspaceRole(p.callerUserId, p.workspaceId, ['admin']);
    const target = await this.requireWorkspaceMembership(
      p.workspaceId,
      p.targetUserId,
    );
    if (target.role === 'admin') {
      await this.assertNotLastWorkspaceAdmin(p.workspaceId);
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

  private async requireOrgRole(
    userId: string,
    orgId: string,
    allowed: string[],
  ): Promise<string> {
    const row = await this.db.query.orgMembers.findFirst({
      where: and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)),
      columns: { role: true },
    });
    if (!row || !allowed.includes(row.role)) {
      throw rpcError('FORBIDDEN', 'You do not have access to this organization.');
    }
    return row.role;
  }

  private async requireWorkspaceRole(
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

  private async findUserByEmail(email: string) {
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

  private async requireOrgMembership(orgId: string, userId: string) {
    const row = await this.db.query.orgMembers.findFirst({
      where: and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)),
    });
    if (!row) throw rpcError('NOT_FOUND', 'This user is not a member of the organization.');
    return row;
  }

  private async requireWorkspaceMembership(workspaceId: string, userId: string) {
    const row = await this.db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    });
    if (!row) throw rpcError('NOT_FOUND', 'This user is not a member of the workspace.');
    return row;
  }

  private async ensureNotOrgMember(orgId: string, userId: string) {
    const existing = await this.db.query.orgMembers.findFirst({
      where: and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)),
      columns: { id: true },
    });
    if (existing) {
      throw rpcError('CONFLICT', 'User is already a member of this organization.');
    }
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

  private async assertNotLastOrgOwner(orgId: string) {
    const owners = await this.db.$count(
      orgMembers,
      and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, 'owner')),
    );
    if (owners <= 1) {
      throw rpcError('CONFLICT', 'The organization must keep at least one owner.');
    }
  }

  private async assertNotLastWorkspaceAdmin(workspaceId: string) {
    const admins = await this.db.$count(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.role, 'admin'),
      ),
    );
    if (admins <= 1) {
      throw rpcError('CONFLICT', 'The workspace must keep at least one admin.');
    }
  }

  // ── Views ─────────────────────────────────────────────────────────────────────

  private toOrgMemberView(r: OrgMemberRow): OrgMemberView {
    return {
      id: r.id,
      orgId: r.orgId,
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
