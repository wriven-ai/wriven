import { Inject, Injectable } from '@nestjs/common';
import {
  Permission,
  ProjectRole,
  WorkspaceRole,
  effectivePermissions,
} from '@wriven/contracts';
import { DRIZZLE, type DrizzleDB } from '@wriven/database';
import { and, eq, isNull } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';

const { workspaceMembers, projectMembers, projects } = schema;

/** Resolved roles across the hierarchy + the cascade-derived permission set. */
export interface ResolvedRoles {
  workspaceId: string | null;
  projectId: string | null;
  wsRole: WorkspaceRole | null;
  projRole: ProjectRole | null;
  permissions: Set<Permission>;
}

/**
 * The RBAC brain for auth-service. Owns membership lookups and the workspace →
 * project permission cascade. The gateway enforces; this service resolves.
 *
 * Cascade: a workspace owner/admin's set already contains every project
 * permission, so {@link resolveRoles} grants them project access with no
 * `project_members` row — generalising what used to be the gateway's
 * workspace-admin bypass.
 *
 * The pure cascade math (`effectivePermissions`) lives in `@wriven/contracts`
 * so the frontend `useCan()` shares the identical definition.
 */
@Injectable()
export class AuthorizationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
  ) {}

  /** Workspace role for (userId, workspaceId), or null if not a member. */
  async getWorkspaceRole(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceRole | null> {
    const row = await this.db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
      columns: { role: true },
    });
    return row?.role ?? null;
  }

  /**
   * Resolve roles for a context. When given a `projectId`, walks
   * project → workspace so both levels are available for the cascade.
   * Soft-deleted projects yield no roles (access denied upstream).
   */
  async resolveRoles(
    userId: string,
    context: { workspaceId?: string; projectId?: string },
  ): Promise<ResolvedRoles> {
    let workspaceId = context.workspaceId ?? null;
    const projectId = context.projectId ?? null;
    let wsRole: WorkspaceRole | null = null;
    let projRole: ProjectRole | null = null;

    if (projectId) {
      const project = await this.db.query.projects.findFirst({
        where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
        columns: { workspaceId: true },
      });
      if (project) {
        workspaceId = project.workspaceId;
        const [pm, wm] = await Promise.all([
          this.db.query.projectMembers.findFirst({
            where: and(
              eq(projectMembers.projectId, projectId),
              eq(projectMembers.userId, userId),
            ),
            columns: { role: true },
          }),
          workspaceId
            ? this.db.query.workspaceMembers.findFirst({
                where: and(
                  eq(workspaceMembers.workspaceId, workspaceId),
                  eq(workspaceMembers.userId, userId),
                ),
                columns: { role: true },
              })
            : Promise.resolve(undefined),
        ]);
        projRole = pm?.role ?? null;
        wsRole = wm?.role ?? null;
      }
    } else if (workspaceId) {
      wsRole = await this.getWorkspaceRole(userId, workspaceId);
    }

    return {
      workspaceId,
      projectId,
      wsRole,
      projRole,
      permissions: effectivePermissions(wsRole, projRole),
    };
  }

  /**
   * Single chokepoint — throws `FORBIDDEN` if the user lacks the permission.
   * Most call sites use this; use {@link can} for non-throwing checks.
   */
  async authorize(p: {
    userId: string;
    permission: Permission;
    workspaceId?: string;
    projectId?: string;
  }): Promise<ResolvedRoles> {
    const roles = await this.resolveRoles(p.userId, p);
    if (!roles.permissions.has(p.permission)) {
      throw rpcError(
        'FORBIDDEN',
        'You do not have permission to perform this action.',
      );
    }
    return roles;
  }

  /** Non-throwing variant for conditional logic / UI. */
  async can(p: {
    userId: string;
    permission: Permission;
    workspaceId?: string;
    projectId?: string;
  }): Promise<boolean> {
    const roles = await this.resolveRoles(p.userId, p);
    return roles.permissions.has(p.permission);
  }
}
