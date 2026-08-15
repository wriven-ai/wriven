import { Inject, Injectable } from '@nestjs/common';
import {
  AdminContentTypeRow,
  AdminScopedQueryDto,
  Paginated,
} from '@wriven/contracts';
import { DRIZZLE, type DrizzleDB } from '@wriven/database';
import { and, desc, eq, isNull, SQL } from 'drizzle-orm';
import * as schema from '../db/schema';

const { contentTypes } = schema;
type ContentTypeRow = typeof contentTypes.$inferSelect;

@Injectable()
export class AdminContentTypesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
  ) {}

  async list(query: AdminScopedQueryDto): Promise<Paginated<AdminContentTypeRow>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const conds: SQL[] = [isNull(contentTypes.deletedAt)];
    if (query.workspaceId)
      conds.push(eq(contentTypes.workspaceId, query.workspaceId));
    if (query.projectId)
      conds.push(eq(contentTypes.projectId, query.projectId));
    const where = and(...conds);

    const [rows, total] = await Promise.all([
      this.db.query.contentTypes.findMany({
        where,
        orderBy: desc(contentTypes.createdAt),
        limit,
        offset: (page - 1) * limit,
      }),
      this.db.$count(contentTypes, where),
    ]);

    return { items: rows.map((r) => this.toRow(r)), page, limit, total };
  }

  private toRow(t: ContentTypeRow): AdminContentTypeRow {
    return {
      id: t.id,
      workspaceId: t.workspaceId,
      projectId: t.projectId,
      name: t.name,
      apiId: t.apiId,
      fields: t.fields as AdminContentTypeRow['fields'],
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
