import { Inject, Injectable } from '@nestjs/common';
import {
  AdminContentQueryDto,
  AdminEntryDetail,
  AdminEntryRow,
  AdminTakedownDto,
  Paginated,
  WebhookPayload,
} from '@wriven/contracts';
import { DRIZZLE, type DrizzleDB } from '@wriven/database';
import { and, desc, eq, isNull, SQL } from 'drizzle-orm';
import { CachePurgeService } from '../cache/cache-purge.service';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';
import { WebhooksService } from '../webhooks/webhooks.service';

const { contentEntries, contentTypes } = schema;
type EntryRow = typeof contentEntries.$inferSelect;

@Injectable()
export class AdminContentService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly cache: CachePurgeService,
    private readonly webhooks: WebhooksService,
  ) {}

  async list(query: AdminContentQueryDto): Promise<Paginated<AdminEntryRow>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const conds: SQL[] = [isNull(contentEntries.deletedAt)];
    if (query.workspaceId)
      conds.push(eq(contentEntries.workspaceId, query.workspaceId));
    if (query.projectId)
      conds.push(eq(contentEntries.projectId, query.projectId));
    if (query.contentTypeId)
      conds.push(eq(contentEntries.contentTypeId, query.contentTypeId));
    if (query.status) conds.push(eq(contentEntries.status, query.status));
    const where = and(...conds);

    const [rows, total] = await Promise.all([
      this.db.query.contentEntries.findMany({
        where,
        orderBy: desc(contentEntries.updatedAt),
        limit,
        offset: (page - 1) * limit,
      }),
      this.db.$count(contentEntries, where),
    ]);

    return { items: rows.map((r) => this.toRow(r)), page, limit, total };
  }

  async get(payload: { id: string }): Promise<AdminEntryDetail> {
    const entry = await this.db.query.contentEntries.findFirst({
      where: eq(contentEntries.id, payload.id),
    });
    if (!entry) throw rpcError('NOT_FOUND', 'Entry not found.');
    return {
      ...this.toRow(entry),
      data: (entry.data ?? {}) as Record<string, unknown>,
    };
  }

  /** Moderation takedown: unpublish (draft) or hide (archived). */
  async takedown(payload: {
    id: string;
    dto: AdminTakedownDto;
  }): Promise<AdminEntryRow> {
    const existing = await this.db.query.contentEntries.findFirst({
      where: eq(contentEntries.id, payload.id),
      columns: { id: true, status: true },
    });
    if (!existing) throw rpcError('NOT_FOUND', 'Entry not found.');

    // Taking down (draft/archived) means it's no longer published — clear the
    // timestamp so it isn't reported as published. The moderation trail lives in
    // admin_audit_log (this isn't written to the tenant's revision history).
    const [entry] = await this.db
      .update(contentEntries)
      .set({ status: payload.dto.status, publishedAt: null })
      .where(eq(contentEntries.id, payload.id))
      .returning();
    // Hard-deletes don't exist today, but a race (or a future hard-delete
    // path) must surface NOT_FOUND, not a TypeError on `entry.contentTypeId`.
    if (!entry) throw rpcError('NOT_FOUND', 'Entry not found.');

    const type = await this.db.query.contentTypes.findFirst({
      where: eq(contentTypes.id, entry.contentTypeId),
      columns: { apiId: true },
    });
    if (type) await this.cache.purgeEntry(type.apiId, entry.id);

    // Webhook-driven display sites revalidate on entry.unpublished — without
    // this, taken-down content stays live on their sites until an unrelated
    // publish. Only a previously-published entry was ever live for them.
    if (type && existing.status === 'published') {
      const webhookPayload: WebhookPayload = {
        event: 'entry.unpublished',
        projectId: entry.projectId,
        firedAt: new Date().toISOString(),
        entry: {
          id: entry.id,
          type: type.apiId,
          slug: entry.slug,
          status: entry.status,
          publishedAt: null,
          updatedAt: entry.updatedAt.toISOString(),
        },
      };
      // Best-effort, like EntriesService.emit — never fails the takedown.
      await this.webhooks.dispatch(entry.projectId, webhookPayload).catch(() => undefined);
    }

    return this.toRow(entry);
  }

  private toRow(e: EntryRow): AdminEntryRow {
    return {
      id: e.id,
      workspaceId: e.workspaceId,
      projectId: e.projectId,
      contentTypeId: e.contentTypeId,
      slug: e.slug,
      status: e.status,
      authorId: e.authorId,
      publishedAt: e.publishedAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}
