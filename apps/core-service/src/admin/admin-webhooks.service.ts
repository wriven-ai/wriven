import { Inject, Injectable } from '@nestjs/common';
import {
  AdminScopedQueryDto,
  AdminWebhookRow,
  Paginated,
} from '@wriven/contracts';
import { DRIZZLE, DrizzleDB } from '@wriven/database';
import { and, desc, eq, SQL } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';

const { webhooks } = schema;
type WebhookRow = typeof webhooks.$inferSelect;

@Injectable()
export class AdminWebhooksService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
  ) {}

  async list(query: AdminScopedQueryDto): Promise<Paginated<AdminWebhookRow>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const conds: SQL[] = [];
    if (query.workspaceId)
      conds.push(eq(webhooks.workspaceId, query.workspaceId));
    if (query.projectId) conds.push(eq(webhooks.projectId, query.projectId));
    const where = conds.length ? and(...conds) : undefined;

    const [rows, total] = await Promise.all([
      this.db.query.webhooks.findMany({
        where,
        orderBy: desc(webhooks.createdAt),
        limit,
        offset: (page - 1) * limit,
      }),
      this.db.$count(webhooks, where),
    ]);

    return { items: rows.map((r) => this.toRow(r)), page, limit, total };
  }

  /** Disable an abusive/failing webhook. */
  async disable(payload: { id: string }): Promise<{ success: true }> {
    const [updated] = await this.db
      .update(webhooks)
      .set({ active: false })
      .where(eq(webhooks.id, payload.id))
      .returning({ id: webhooks.id });
    if (!updated) throw rpcError('NOT_FOUND', 'Webhook not found.');
    return { success: true };
  }

  private toRow(w: WebhookRow): AdminWebhookRow {
    return {
      id: w.id,
      workspaceId: w.workspaceId,
      projectId: w.projectId,
      url: w.url,
      events: w.events,
      active: w.active,
      lastStatus: w.lastStatus,
      lastFiredAt: w.lastFiredAt?.toISOString() ?? null,
      createdAt: w.createdAt.toISOString(),
    };
  }
}
