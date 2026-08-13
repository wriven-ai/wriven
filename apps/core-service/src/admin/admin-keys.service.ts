import { Inject, Injectable } from '@nestjs/common';
import {
  AdminApiKeyRow,
  AdminScopedQueryDto,
  Paginated,
} from '@wriven/contracts';
import { DRIZZLE, type DrizzleDB } from '@wriven/database';
import { and, desc, eq, SQL } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';

const { apiKeys } = schema;
type ApiKeyRow = typeof apiKeys.$inferSelect;

@Injectable()
export class AdminKeysService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
  ) {}

  async list(query: AdminScopedQueryDto): Promise<Paginated<AdminApiKeyRow>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const conds: SQL[] = [];
    if (query.workspaceId)
      conds.push(eq(apiKeys.workspaceId, query.workspaceId));
    if (query.projectId) conds.push(eq(apiKeys.projectId, query.projectId));
    const where = conds.length ? and(...conds) : undefined;

    const [rows, total] = await Promise.all([
      this.db.query.apiKeys.findMany({
        where,
        orderBy: desc(apiKeys.createdAt),
        limit,
        offset: (page - 1) * limit,
      }),
      this.db.$count(apiKeys, where),
    ]);

    return { items: rows.map((r) => this.toRow(r)), page, limit, total };
  }

  /** Revoke any key (abuse). Idempotent. Never exposes the token. */
  async revoke(payload: { id: string }): Promise<{ success: true }> {
    const [updated] = await this.db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, payload.id))
      .returning({ id: apiKeys.id });
    if (!updated) throw rpcError('NOT_FOUND', 'API key not found.');
    return { success: true };
  }

  private toRow(k: ApiKeyRow): AdminApiKeyRow {
    return {
      id: k.id,
      workspaceId: k.workspaceId,
      projectId: k.projectId,
      name: k.name,
      prefix: k.prefix,
      scope: k.scope,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      revokedAt: k.revokedAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    };
  }
}
