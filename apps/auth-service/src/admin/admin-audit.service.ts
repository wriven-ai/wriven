import { Inject, Injectable } from '@nestjs/common';
import {
  AdminListQueryDto,
  AuditLogView,
  AuditWritePayload,
  Paginated,
} from '@wriven/contracts';
import { DRIZZLE, DrizzleDB } from '@wriven/database';
import { desc, eq } from 'drizzle-orm';
import * as schema from '../db/schema';

const { adminAuditLog, adminUsers } = schema;

@Injectable()
export class AdminAuditService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
  ) {}

  /** Append an audit entry. Best-effort write path called by the gateway. */
  async write(payload: AuditWritePayload): Promise<{ success: true }> {
    await this.db.insert(adminAuditLog).values({
      adminUserId: payload.adminUserId,
      action: payload.action,
      targetType: payload.targetType ?? null,
      targetId: payload.targetId ?? null,
      metadata: payload.metadata ?? {},
      ip: payload.ip ?? null,
    });
    return { success: true };
  }

  async list(query: AdminListQueryDto): Promise<Paginated<AuditLogView>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [rows, total] = await Promise.all([
      this.db
        .select({
          id: adminAuditLog.id,
          adminUserId: adminAuditLog.adminUserId,
          adminEmail: adminUsers.email,
          action: adminAuditLog.action,
          targetType: adminAuditLog.targetType,
          targetId: adminAuditLog.targetId,
          metadata: adminAuditLog.metadata,
          ip: adminAuditLog.ip,
          createdAt: adminAuditLog.createdAt,
        })
        .from(adminAuditLog)
        .leftJoin(adminUsers, eq(adminAuditLog.adminUserId, adminUsers.id))
        .orderBy(desc(adminAuditLog.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.$count(adminAuditLog),
    ]);

    const items: AuditLogView[] = rows.map((r) => ({
      id: r.id,
      adminUserId: r.adminUserId,
      adminEmail: r.adminEmail ?? null,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    }));

    return { items, page, limit, total };
  }
}
