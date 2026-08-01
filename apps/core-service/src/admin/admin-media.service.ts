import { Inject, Injectable } from '@nestjs/common';
import {
  AdminMediaRow,
  AdminMediaUsageRow,
  AdminScopedQueryDto,
  Paginated,
} from '@wriven/contracts';
import { DRIZZLE, DrizzleDB } from '@wriven/database';
import { and, count, desc, eq, isNull, sql, SQL } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';

const { mediaAssets } = schema;
type MediaRow = typeof mediaAssets.$inferSelect;

@Injectable()
export class AdminMediaService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
  ) {}

  async list(query: AdminScopedQueryDto): Promise<Paginated<AdminMediaRow>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const conds: SQL[] = [isNull(mediaAssets.deletedAt)];
    if (query.workspaceId)
      conds.push(eq(mediaAssets.workspaceId, query.workspaceId));
    if (query.projectId)
      conds.push(eq(mediaAssets.projectId, query.projectId));
    const where = and(...conds);

    const [rows, total] = await Promise.all([
      this.db.query.mediaAssets.findMany({
        where,
        orderBy: desc(mediaAssets.createdAt),
        limit,
        offset: (page - 1) * limit,
      }),
      this.db.$count(mediaAssets, where),
    ]);

    return { items: rows.map((r) => this.toRow(r)), page, limit, total };
  }

  /** Storage usage per workspace (descending), for the cap dashboard. */
  async usage(): Promise<AdminMediaUsageRow[]> {
    const rows = await this.db
      .select({
        workspaceId: mediaAssets.workspaceId,
        assetCount: count(),
        totalBytes: sql<number>`coalesce(sum(${mediaAssets.sizeBytes}), 0)`,
      })
      .from(mediaAssets)
      .where(isNull(mediaAssets.deletedAt))
      .groupBy(mediaAssets.workspaceId)
      .orderBy(desc(sql`coalesce(sum(${mediaAssets.sizeBytes}), 0)`))
      .limit(100);

    return rows.map((r) => ({
      workspaceId: r.workspaceId,
      assetCount: Number(r.assetCount),
      totalBytes: Number(r.totalBytes),
    }));
  }

  /** Soft-delete an abusive/oversized asset. */
  async purge(payload: { id: string }): Promise<{ success: true }> {
    const [updated] = await this.db
      .update(mediaAssets)
      .set({ deletedAt: new Date() })
      .where(eq(mediaAssets.id, payload.id))
      .returning({ id: mediaAssets.id });
    if (!updated) throw rpcError('NOT_FOUND', 'Media asset not found.');
    return { success: true };
  }

  private toRow(m: MediaRow): AdminMediaRow {
    return {
      id: m.id,
      workspaceId: m.workspaceId,
      projectId: m.projectId,
      kind: m.kind,
      mime: m.mime,
      sizeBytes: m.sizeBytes,
      originalFilename: m.originalFilename,
      uploadedBy: m.uploadedBy,
      createdAt: m.createdAt.toISOString(),
    };
  }
}
