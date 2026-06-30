import { Inject, Injectable } from '@nestjs/common';
import {
  AdminListQueryDto,
  AdminProjectRow,
  AdminUpdateUserDto,
  AdminUserDetail,
  AdminUserRow,
  AdminWorkspaceDetail,
  AdminWorkspaceRow,
  Paginated,
} from '@wriven/contracts';
import { DRIZZLE, DrizzleDB } from '@wriven/database';
import { and, count, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';

const {
  users,
  workspaces,
  workspaceMembers,
  projects,
  projectMembers,
  subscriptions,
  refreshTokens,
} = schema;

@Injectable()
export class AdminTenancyService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
  ) {}

  // ── Users ───────────────────────────────────────────────────────────────────

  async listUsers(query: AdminListQueryDto): Promise<Paginated<AdminUserRow>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = query.q
      ? or(
          ilike(users.email, `%${query.q}%`),
          ilike(users.name, `%${query.q}%`),
        )
      : undefined;

    const [rows, total] = await Promise.all([
      this.db.query.users.findMany({
        where,
        orderBy: desc(users.createdAt),
        limit,
        offset: (page - 1) * limit,
      }),
      this.db.$count(users, where),
    ]);

    const counts = await this.workspaceCounts(rows.map((u) => u.id));
    const items = rows.map((u) => this.toUserRow(u, counts.get(u.id) ?? 0));
    return { items, page, limit, total };
  }

  async getUser(payload: { id: string }): Promise<AdminUserDetail> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, payload.id),
    });
    if (!user) throw rpcError('NOT_FOUND', 'User not found.');

    const [wsRows, projRows] = await Promise.all([
      this.db.query.workspaceMembers.findMany({
        where: eq(workspaceMembers.userId, payload.id),
        with: { workspace: { columns: { id: true, name: true, slug: true } } },
      }),
      this.db.query.projectMembers.findMany({
        where: eq(projectMembers.userId, payload.id),
        with: {
          project: { columns: { id: true, name: true, workspaceId: true } },
        },
      }),
    ]);

    return {
      ...this.toUserRow(user, wsRows.length),
      workspaces: wsRows.map((r) => ({
        id: r.workspace.id,
        name: r.workspace.name,
        slug: r.workspace.slug,
        role: r.role,
      })),
      projects: projRows.map((r) => ({
        id: r.project.id,
        name: r.project.name,
        workspaceId: r.project.workspaceId,
        role: r.role,
      })),
    };
  }

  async updateUser(payload: {
    id: string;
    dto: AdminUpdateUserDto;
  }): Promise<AdminUserRow> {
    const patch: Partial<typeof users.$inferInsert> = {};
    if (payload.dto.suspended !== undefined) {
      patch.suspendedAt = payload.dto.suspended ? new Date() : null;
    }
    if (payload.dto.emailVerified !== undefined) {
      patch.emailVerified = payload.dto.emailVerified;
    }

    const [user] = await this.db
      .update(users)
      .set(patch)
      .where(eq(users.id, payload.id))
      .returning();
    if (!user) throw rpcError('NOT_FOUND', 'User not found.');

    // Suspending must also kill active sessions (the access token is short-lived,
    // but revoke refresh tokens so they can't mint new ones).
    if (payload.dto.suspended === true) {
      await this.db
        .update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.userId, user.id));
    }

    const counts = await this.workspaceCounts([user.id]);
    return this.toUserRow(user, counts.get(user.id) ?? 0);
  }

  async deleteUser(payload: { id: string }): Promise<{ success: true }> {
    try {
      const [deleted] = await this.db
        .delete(users)
        .where(eq(users.id, payload.id))
        .returning({ id: users.id });
      if (!deleted) throw rpcError('NOT_FOUND', 'User not found.');
      return { success: true };
    } catch (err) {
      // workspaces/projects.created_by are ON DELETE RESTRICT.
      const e = err as { code?: string };
      if (e?.code === '23503') {
        throw rpcError(
          'CONFLICT',
          'Cannot delete a user who owns workspaces or projects. Transfer or delete those first.',
        );
      }
      throw err;
    }
  }

  // ── Workspaces ──────────────────────────────────────────────────────────────

  async listWorkspaces(
    query: AdminListQueryDto,
  ): Promise<Paginated<AdminWorkspaceRow>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = query.q
      ? or(
          ilike(workspaces.name, `%${query.q}%`),
          ilike(workspaces.slug, `%${query.q}%`),
        )
      : undefined;

    const [rows, total] = await Promise.all([
      this.db.query.workspaces.findMany({
        where,
        orderBy: desc(workspaces.createdAt),
        limit,
        offset: (page - 1) * limit,
        with: { creator: { columns: { email: true } } },
      }),
      this.db.$count(workspaces, where),
    ]);

    const ids = rows.map((w) => w.id);
    const [memberCounts, projectCounts, subMap] = await Promise.all([
      this.groupCount(workspaceMembers, workspaceMembers.workspaceId, ids),
      this.activeProjectCounts(ids),
      this.subscriptionMap(ids),
    ]);

    const items = rows.map((w) => {
      const sub = subMap.get(w.id);
      return {
        id: w.id,
        name: w.name,
        slug: w.slug,
        ownerId: w.createdBy,
        ownerEmail: w.creator?.email ?? null,
        memberCount: memberCounts.get(w.id) ?? 0,
        projectCount: projectCounts.get(w.id) ?? 0,
        planKey: sub?.plan?.key ?? 'free',
        planName: sub?.plan?.name ?? 'Free',
        subscriptionStatus: sub?.status ?? null,
        createdAt: w.createdAt.toISOString(),
      } satisfies AdminWorkspaceRow;
    });
    return { items, page, limit, total };
  }

  async getWorkspace(payload: { id: string }): Promise<AdminWorkspaceDetail> {
    const ws = await this.db.query.workspaces.findFirst({
      where: eq(workspaces.id, payload.id),
      with: { creator: { columns: { email: true } } },
    });
    if (!ws) throw rpcError('NOT_FOUND', 'Workspace not found.');

    const [memberRows, projectRows, subMap] = await Promise.all([
      this.db.query.workspaceMembers.findMany({
        where: eq(workspaceMembers.workspaceId, payload.id),
        with: { user: { columns: { id: true, email: true, name: true } } },
      }),
      this.db.query.projects.findMany({
        where: eq(projects.workspaceId, payload.id),
        columns: { id: true, name: true, slug: true, deletedAt: true },
      }),
      this.subscriptionMap([payload.id]),
    ]);

    const sub = subMap.get(payload.id);
    const activeProjects = projectRows.filter((p) => !p.deletedAt);
    return {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      ownerId: ws.createdBy,
      ownerEmail: ws.creator?.email ?? null,
      memberCount: memberRows.length,
      projectCount: activeProjects.length,
      planKey: sub?.plan?.key ?? 'free',
      planName: sub?.plan?.name ?? 'Free',
      subscriptionStatus: sub?.status ?? null,
      createdAt: ws.createdAt.toISOString(),
      members: memberRows.map((m) => ({
        userId: m.user.id,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
      })),
      projects: activeProjects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
      })),
    };
  }

  // ── Projects ────────────────────────────────────────────────────────────────

  async listProjects(
    query: AdminListQueryDto,
  ): Promise<Paginated<AdminProjectRow>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = query.q
      ? or(
          ilike(projects.name, `%${query.q}%`),
          ilike(projects.slug, `%${query.q}%`),
        )
      : undefined;

    const [rows, total] = await Promise.all([
      this.db.query.projects.findMany({
        where,
        orderBy: desc(projects.createdAt),
        limit,
        offset: (page - 1) * limit,
        with: { workspace: { columns: { name: true } } },
      }),
      this.db.$count(projects, where),
    ]);

    const items = rows.map((p) => this.toProjectRow(p));
    return { items, page, limit, total };
  }

  async getProject(payload: { id: string }): Promise<AdminProjectRow> {
    const p = await this.db.query.projects.findFirst({
      where: eq(projects.id, payload.id),
      with: { workspace: { columns: { name: true } } },
    });
    if (!p) throw rpcError('NOT_FOUND', 'Project not found.');
    return this.toProjectRow(p);
  }

  async deleteProject(payload: { id: string }): Promise<{ success: true }> {
    const [updated] = await this.db
      .update(projects)
      .set({ deletedAt: new Date() })
      .where(eq(projects.id, payload.id))
      .returning({ id: projects.id });
    if (!updated) throw rpcError('NOT_FOUND', 'Project not found.');
    return { success: true };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private toUserRow(
    u: typeof users.$inferSelect,
    workspaceCount: number,
  ): AdminUserRow {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      provider: u.provider,
      emailVerified: u.emailVerified,
      suspended: !!u.suspendedAt,
      workspaceCount,
      createdAt: u.createdAt.toISOString(),
    };
  }

  private toProjectRow(p: {
    id: string;
    name: string;
    slug: string;
    workspaceId: string;
    createdBy: string;
    deletedAt: Date | null;
    createdAt: Date;
    workspace?: { name: string } | null;
  }): AdminProjectRow {
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      workspaceId: p.workspaceId,
      workspaceName: p.workspace?.name ?? null,
      createdBy: p.createdBy,
      deleted: !!p.deletedAt,
      createdAt: p.createdAt.toISOString(),
    };
  }

  /** Map of userId → number of workspaces they belong to. */
  private async workspaceCounts(
    userIds: string[],
  ): Promise<Map<string, number>> {
    if (!userIds.length) return new Map();
    const rows = await this.db
      .select({ id: workspaceMembers.userId, c: count() })
      .from(workspaceMembers)
      .where(inArray(workspaceMembers.userId, userIds))
      .groupBy(workspaceMembers.userId);
    return new Map(rows.map((r) => [r.id, r.c]));
  }

  private async groupCount(
    table: typeof workspaceMembers,
    keyCol: typeof workspaceMembers.workspaceId,
    ids: string[],
  ): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const rows = await this.db
      .select({ id: keyCol, c: count() })
      .from(table)
      .where(inArray(keyCol, ids))
      .groupBy(keyCol);
    return new Map(rows.map((r) => [r.id, r.c]));
  }

  /** Map of workspaceId → active (non-deleted) project count. */
  private async activeProjectCounts(
    ids: string[],
  ): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const rows = await this.db
      .select({ id: projects.workspaceId, c: count() })
      .from(projects)
      .where(and(inArray(projects.workspaceId, ids), isNull(projects.deletedAt)))
      .groupBy(projects.workspaceId);
    return new Map(rows.map((r) => [r.id, r.c]));
  }

  /** Map of workspaceId → its subscription (with plan key/name). */
  private async subscriptionMap(ids: string[]) {
    if (!ids.length) return new Map<string, SubWithPlan>();
    const rows = await this.db.query.subscriptions.findMany({
      where: inArray(subscriptions.workspaceId, ids),
      with: { plan: { columns: { key: true, name: true } } },
    });
    return new Map<string, SubWithPlan>(rows.map((s) => [s.workspaceId, s]));
  }
}

interface SubWithPlan {
  workspaceId: string;
  status: string;
  plan: { key: string; name: string } | null;
}
