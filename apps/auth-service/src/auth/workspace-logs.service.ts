import { Inject, Injectable } from '@nestjs/common';
import {
  Paginated,
  WorkspaceLogQueryDto,
  WorkspaceLogView,
  WorkspaceLogWritePayload,
} from '@wriven/contracts';
import { DRIZZLE, type DrizzleDB } from '@wriven/database';
import { and, desc, eq, gte } from 'drizzle-orm';
import * as schema from '../db/schema';

const { workspaceActivityLog, users } = schema;

@Injectable()
export class WorkspaceLogsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
  ) {}

  /** Append an activity row. Best-effort write path called by the gateway. */
  async write(payload: WorkspaceLogWritePayload): Promise<{ success: true }> {
    await this.db.insert(workspaceActivityLog).values({
      workspaceId: payload.workspaceId,
      userId: payload.userId,
      projectId: payload.projectId ?? null,
      action: payload.action,
      targetType: payload.targetType ?? null,
      targetId: payload.targetId ?? null,
      metadata: payload.metadata ?? {},
    });
    return { success: true };
  }

  /** Activity feed for a workspace, cut off at now − days (7/30/90). */
  async list(
    p: { workspaceId: string } & WorkspaceLogQueryDto,
  ): Promise<Paginated<WorkspaceLogView>> {
    const page = p.page ?? 1;
    const limit = p.limit ?? 20;
    const cutoff = new Date(Date.now() - (p.days ?? 30) * 24 * 60 * 60 * 1000);

    const where = and(
      eq(workspaceActivityLog.workspaceId, p.workspaceId),
      gte(workspaceActivityLog.createdAt, cutoff),
    );

    const [rows, total] = await Promise.all([
      this.db
        .select({
          id: workspaceActivityLog.id,
          userId: workspaceActivityLog.userId,
          userName: users.name,
          userEmail: users.email,
          action: workspaceActivityLog.action,
          targetType: workspaceActivityLog.targetType,
          targetId: workspaceActivityLog.targetId,
          projectId: workspaceActivityLog.projectId,
          metadata: workspaceActivityLog.metadata,
          createdAt: workspaceActivityLog.createdAt,
        })
        .from(workspaceActivityLog)
        // Left join: userId is set-null when the member is removed, and the
        // row must survive with null actor fields.
        .leftJoin(users, eq(workspaceActivityLog.userId, users.id))
        .where(where)
        .orderBy(desc(workspaceActivityLog.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.$count(workspaceActivityLog, where),
    ]);

    const items: WorkspaceLogView[] = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.userName ?? null,
      userEmail: r.userEmail ?? null,
      action: r.action as WorkspaceLogView['action'],
      targetType: r.targetType,
      targetId: r.targetId,
      projectId: r.projectId,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      createdAt: r.createdAt.toISOString(),
    }));

    return { items, page, limit, total };
  }
}
