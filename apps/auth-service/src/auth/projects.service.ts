import { Inject, Injectable } from '@nestjs/common';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  ProjectMemberView,
  ProjectView,
  UpdateProjectDto,
  UpdateProjectMemberDto,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, eq, isNull } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import { slugify, uniqueSlug } from '../common/slug';
import * as schema from '../db/schema';
import { EntitlementsService } from './entitlements.service';
import { MembersService } from './members.service';

const { projects, projectMembers, workspaceMembers, users } = schema;

/** The transaction handle Drizzle passes to `db.transaction(cb)`. */
type Tx = Parameters<
  Parameters<DrizzleDB<typeof schema>['transaction']>[0]
>[0];

type ProjectRow = typeof projects.$inferSelect;
type ProjectMemberRow = typeof projectMembers.$inferSelect & {
  user: typeof users.$inferSelect;
};

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly members: MembersService,
    private readonly entitlements: EntitlementsService,
  ) {}

  // ── Project CRUD ────────────────────────────────────────────────────────────

  async create(p: {
    callerUserId: string;
    workspaceId: string;
    dto: CreateProjectDto;
  }): Promise<ProjectView> {
    // Only workspace owner/admin can create projects.
    await this.members.requireWorkspaceRole(
      p.callerUserId,
      p.workspaceId,
      ['owner', 'admin'],
    );
    const slug = p.dto.slug ?? uniqueSlug(p.dto.name);
    try {
      const result = await this.db.transaction(async (tx) => {
        // Enforce the plan's project quota (e.g. free = 2) — TOCTOU-safe.
        await this.entitlements.assertProjectQuotaTx(tx, p.workspaceId);
        const [project] = await tx
          .insert(projects)
          .values({
            workspaceId: p.workspaceId,
            name: p.dto.name,
            slug,
            createdBy: p.callerUserId,
          })
          .returning();
        // Creator becomes project admin.
        await tx.insert(projectMembers).values({
          projectId: project.id,
          userId: p.callerUserId,
          role: 'admin',
        });
        return project;
      });
      return this.toView(result, 'admin');
    } catch (err) {
      const e = err as { code?: string; constraint_name?: string };
      if (e?.code === '23505' && e.constraint_name?.includes('slug')) {
        throw rpcError('CONFLICT', 'A project with that slug already exists.');
      }
      throw err;
    }
  }

  async get(p: {
    callerUserId: string;
    projectId: string;
  }): Promise<ProjectView> {
    const role = await this.requireProjectRole(p.callerUserId, p.projectId, [
      'admin',
      'editor',
      'viewer',
    ]);
    return this.toView(await this.requireRow(p.projectId), role);
  }

  async list(p: {
    callerUserId: string;
    workspaceId: string;
  }): Promise<ProjectView[]> {
    const callerRole = await this.members.requireWorkspaceRole(
      p.callerUserId,
      p.workspaceId,
      ['owner', 'admin', 'member', 'guest'],
    );

    const rows = await this.db.query.projects.findMany({
      where: and(
        eq(projects.workspaceId, p.workspaceId),
        isNull(projects.deletedAt),
      ),
      orderBy: projects.createdAt,
    });

    // The caller's project memberships (project id → role).
    const memberships = await this.db.query.projectMembers.findMany({
      where: eq(projectMembers.userId, p.callerUserId),
      columns: { projectId: true, role: true },
    });
    const roleByProject = new Map(memberships.map((m) => [m.projectId, m.role]));

    // Real workspace members (owner/admin/member) see every project. A `guest`
    // — auto-added via a single project invite — sees only the projects they
    // belong to, so project existence doesn't leak to outside collaborators.
    const canSeeAll = callerRole !== 'guest';
    const visible = canSeeAll
      ? rows
      : rows.filter((r) => roleByProject.has(r.id));

    return visible.map((r) =>
      this.toView(r, roleByProject.get(r.id) ?? 'viewer'),
    );
  }

  async update(p: {
    callerUserId: string;
    projectId: string;
    dto: UpdateProjectDto;
  }): Promise<ProjectView> {
    await this.requireProjectRole(p.callerUserId, p.projectId, ['admin']);
    const set: Partial<ProjectRow> = {};
    if (p.dto.name !== undefined) set.name = p.dto.name;
    if (p.dto.slug !== undefined) set.slug = slugify(p.dto.slug);
    try {
      const [row] = await this.db
        .update(projects)
        .set(set)
        .where(eq(projects.id, p.projectId))
        .returning();
      return this.toView(row, await this.roleFor(p.projectId, p.callerUserId));
    } catch (err) {
      const e = err as { code?: string; constraint_name?: string };
      if (e?.code === '23505' && e.constraint_name?.includes('slug')) {
        throw rpcError('CONFLICT', 'A project with that slug already exists.');
      }
      throw err;
    }
  }

  async remove(p: {
    callerUserId: string;
    projectId: string;
  }): Promise<{ success: true }> {
    await this.requireProjectRole(p.callerUserId, p.projectId, ['admin']);
    await this.db
      .update(projects)
      .set({ deletedAt: new Date() })
      .where(eq(projects.id, p.projectId));
    return { success: true };
  }

  // ── Project members ─────────────────────────────────────────────────────────

  async listMembers(p: {
    callerUserId: string;
    projectId: string;
  }): Promise<ProjectMemberView[]> {
    await this.requireProjectRole(p.callerUserId, p.projectId, [
      'admin',
      'editor',
      'viewer',
    ]);
    const rows = await this.db.query.projectMembers.findMany({
      where: eq(projectMembers.projectId, p.projectId),
      orderBy: projectMembers.createdAt,
      with: { user: true },
    });
    return rows.map((r) => this.toMemberView(r as ProjectMemberRow));
  }

  async addMember(p: {
    callerUserId: string;
    projectId: string;
    dto: AddProjectMemberDto;
  }): Promise<ProjectMemberView> {
    await this.requireProjectRole(p.callerUserId, p.projectId, ['admin']);
    const project = await this.requireRow(p.projectId);
    const user = await this.members.findUserByEmail(p.dto.email);
    await this.ensureNotMember(p.projectId, user.id);

    // Project membership implies workspace membership — add a baseline workspace
    // member if absent, then the project membership, atomically.
    const row = await this.db.transaction(async (tx) => {
      await this.ensureWorkspaceMember(tx, project.workspaceId, user.id);
      const [r] = await tx
        .insert(projectMembers)
        .values({ projectId: p.projectId, userId: user.id, role: p.dto.role })
        .returning();
      return r;
    });
    return this.toMemberView({ ...row, user });
  }

  /**
   * Ensure a user has at least baseline workspace access. Auto-adds a `guest`
   * (sees only assigned projects), not a full `member`. Idempotent and
   * non-destructive: ON CONFLICT DO NOTHING never creates a duplicate and never
   * downgrades an existing owner/admin/member. Shared by direct add + invite accept.
   */
  async ensureWorkspaceMember(
    tx: Tx,
    workspaceId: string,
    userId: string,
    role = 'guest',
  ): Promise<void> {
    await tx
      .insert(workspaceMembers)
      .values({ workspaceId, userId, role })
      .onConflictDoNothing({
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
      });
  }

  async updateMember(p: {
    callerUserId: string;
    projectId: string;
    targetUserId: string;
    dto: UpdateProjectMemberDto;
  }): Promise<ProjectMemberView> {
    await this.requireProjectRole(p.callerUserId, p.projectId, ['admin']);
    const target = await this.requireMembership(p.projectId, p.targetUserId);
    if (target.role === 'admin' && p.dto.role !== 'admin') {
      await this.assertNotLastAdmin(p.projectId);
    }
    const [row] = await this.db
      .update(projectMembers)
      .set({ role: p.dto.role })
      .where(
        and(
          eq(projectMembers.projectId, p.projectId),
          eq(projectMembers.userId, p.targetUserId),
        ),
      )
      .returning();
    const fetched = await this.db.query.users.findFirst({
      where: eq(users.id, p.targetUserId),
    });
    if (!fetched) throw rpcError('NOT_FOUND', 'User not found.');
    return this.toMemberView({ ...row, user: fetched });
  }

  async removeMember(p: {
    callerUserId: string;
    projectId: string;
    targetUserId: string;
  }): Promise<{ success: true }> {
    await this.requireProjectRole(p.callerUserId, p.projectId, ['admin']);
    const target = await this.requireMembership(p.projectId, p.targetUserId);
    if (target.role === 'admin') {
      await this.assertNotLastAdmin(p.projectId);
    }
    await this.db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, p.projectId),
          eq(projectMembers.userId, p.targetUserId),
        ),
      );
    return { success: true };
  }

  // ── Authorization helpers ─────────────────────────────────────────────────────

  async requireProjectRole(
    userId: string,
    projectId: string,
    allowed: string[],
  ): Promise<string> {
    const row = await this.db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
      columns: { role: true },
    });
    if (!row || !allowed.includes(row.role)) {
      throw rpcError('FORBIDDEN', 'You do not have access to this project.');
    }
    return row.role;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async requireRow(id: string): Promise<ProjectRow> {
    const row = await this.db.query.projects.findFirst({
      where: and(eq(projects.id, id), isNull(projects.deletedAt)),
    });
    if (!row) throw rpcError('NOT_FOUND', 'Project not found.');
    return row;
  }

  private async requireMembership(projectId: string, userId: string) {
    const row = await this.db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    });
    if (!row)
      throw rpcError('NOT_FOUND', 'This user is not a member of the project.');
    return row;
  }

  private async ensureNotMember(projectId: string, userId: string) {
    const existing = await this.db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
      columns: { id: true },
    });
    if (existing) {
      throw rpcError('CONFLICT', 'User is already a member of this project.');
    }
  }

  private async assertNotLastAdmin(projectId: string) {
    const admins = await this.db.$count(
      projectMembers,
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.role, 'admin'),
      ),
    );
    if (admins <= 1) {
      throw rpcError('CONFLICT', 'The project must keep at least one admin.');
    }
  }

  private async roleFor(projectId: string, userId: string): Promise<string> {
    const row = await this.db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
      columns: { role: true },
    });
    return row?.role ?? 'viewer';
  }

  private toView(p: ProjectRow, role: string): ProjectView {
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

  private toMemberView(r: ProjectMemberRow): ProjectMemberView {
    return {
      id: r.id,
      projectId: r.projectId,
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
