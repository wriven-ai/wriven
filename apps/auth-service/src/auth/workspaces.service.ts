import { Inject, Injectable } from '@nestjs/common';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  WorkspaceView,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, eq } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import { slugify, uniqueSlug } from '../common/slug';
import * as schema from '../db/schema';
import { MembersService } from './members.service';

const {
  workspaces,
  workspaceMembers,
  projects,
  projectMembers,
  plans,
  subscriptions,
} = schema;

type WorkspaceRow = typeof workspaces.$inferSelect;

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly members: MembersService,
  ) {}

  async create(p: {
    userId: string;
    dto: CreateWorkspaceDto;
  }): Promise<{ workspace: WorkspaceView; project: { id: string } }> {
    const slug = p.dto.slug ?? uniqueSlug(p.dto.name);
    try {
      const result = await this.db.transaction(async (tx) => {
        const [workspace] = await tx
          .insert(workspaces)
          .values({
            name: p.dto.name,
            slug,
            createdBy: p.userId,
          })
          .returning();
        await tx.insert(workspaceMembers).values({
          workspaceId: workspace.id,
          userId: p.userId,
          role: 'owner',
        });
        // Seed a default project so the workspace isn't empty.
        const [project] = await tx
          .insert(projects)
          .values({
            workspaceId: workspace.id,
            name: 'Default Project',
            slug: 'default',
            createdBy: p.userId,
          })
          .returning();
        await tx.insert(projectMembers).values({
          projectId: project.id,
          userId: p.userId,
          role: 'admin',
        });
        // Start the new workspace on the free plan.
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
        return { workspace, project };
      });
      return {
        workspace: this.toView(result.workspace, 'owner'),
        project: { id: result.project.id },
      };
    } catch (err) {
      const e = err as { code?: string; constraint_name?: string };
      if (e?.code === '23505' && e.constraint_name?.includes('slug')) {
        throw rpcError('CONFLICT', 'A workspace with that slug already exists.');
      }
      throw err;
    }
  }

  async get(p: {
    callerUserId: string;
    workspaceId: string;
  }): Promise<WorkspaceView> {
    const role = await this.members.requireWorkspaceRole(
      p.callerUserId,
      p.workspaceId,
      ['owner', 'admin', 'member'],
    );
    const row = await this.requireRow(p.workspaceId);
    return this.toView(row, role);
  }

  async list(p: { userId: string }): Promise<WorkspaceView[]> {
    const rows = await this.db.query.workspaceMembers.findMany({
      where: eq(workspaceMembers.userId, p.userId),
      orderBy: workspaceMembers.createdAt,
      with: { workspace: true },
    });
    return rows.map((r) => this.toView(r.workspace, r.role));
  }

  async update(p: {
    callerUserId: string;
    workspaceId: string;
    dto: UpdateWorkspaceDto;
  }): Promise<WorkspaceView> {
    await this.members.requireWorkspaceRole(
      p.callerUserId,
      p.workspaceId,
      ['owner', 'admin'],
    );
    const set: Partial<WorkspaceRow> = {};
    if (p.dto.name !== undefined) set.name = p.dto.name;
    if (p.dto.slug !== undefined) {
      set.slug = slugify(p.dto.slug);
    }
    try {
      const [row] = await this.db
        .update(workspaces)
        .set(set)
        .where(eq(workspaces.id, p.workspaceId))
        .returning();
      return this.toView(row, await this.roleFor(p.workspaceId, p.callerUserId));
    } catch (err) {
      const e = err as { code?: string; constraint_name?: string };
      if (e?.code === '23505' && e.constraint_name?.includes('slug')) {
        throw rpcError('CONFLICT', 'A workspace with that slug already exists.');
      }
      throw err;
    }
  }

  async remove(p: {
    callerUserId: string;
    workspaceId: string;
  }): Promise<{ success: true }> {
    await this.members.requireWorkspaceRole(p.callerUserId, p.workspaceId, [
      'owner',
    ]);
    await this.db.delete(workspaces).where(eq(workspaces.id, p.workspaceId));
    return { success: true };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async requireRow(id: string): Promise<WorkspaceRow> {
    const row = await this.db.query.workspaces.findFirst({
      where: eq(workspaces.id, id),
    });
    if (!row) throw rpcError('NOT_FOUND', 'Workspace not found.');
    return row;
  }

  private async roleFor(
    workspaceId: string,
    userId: string,
  ): Promise<string> {
    const row = await this.db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
      columns: { role: true },
    });
    return row?.role ?? 'member';
  }

  private toView(w: WorkspaceRow, role: string): WorkspaceView {
    return {
      id: w.id,
      name: w.name,
      slug: w.slug,
      createdBy: w.createdBy,
      role,
    };
  }
}
