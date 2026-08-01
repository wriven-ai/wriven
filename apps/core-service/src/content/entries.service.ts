import { Inject, Injectable } from '@nestjs/common';
import {
  ContentEntryView,
  CreateEntryDto,
  EntryStatus,
  FieldDef,
  ListEntriesQueryDto,
  Paginated,
  RevisionView,
  UpdateEntryDto,
  WebhookEvent,
  WebhookPayload,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, desc, eq, isNull, max, ne, sql } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import { uniqueSlug } from '../common/slug';
import * as schema from '../db/schema';
import { CachePurgeService } from '../cache/cache-purge.service';
import { CoreEntitlementsService } from '../entitlements/core-entitlements.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { ContentTypesService } from './content-types.service';
import { validateEntryData } from './content.validator';

const { contentEntries, contentRevisions } = schema;
type EntryRow = typeof contentEntries.$inferSelect;

@Injectable()
export class EntriesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly types: ContentTypesService,
    private readonly webhooks: WebhooksService,
    private readonly cache: CachePurgeService,
    private readonly entitlements: CoreEntitlementsService,
  ) {}

  async create(p: {
    workspaceId: string;
    projectId: string;
    userId: string;
    dto: CreateEntryDto;
  }): Promise<ContentEntryView> {
    await this.entitlements.assertEntryQuota(p.workspaceId);
    const type = await this.types.requireRow(p.projectId, p.dto.contentTypeId);
    validateEntryData(type.fields as FieldDef[], p.dto.data);
    await this.assertUniqueFields(
      p.projectId,
      type.id,
      type.fields as FieldDef[],
      p.dto.data,
    );

    const slug =
      p.dto.slug ??
      this.deriveSlug(type.fields as FieldDef[], p.dto.data, type.name);
    const status = (p.dto.status ?? 'draft') as EntryStatus;
    const publishedAt = status === 'published' ? new Date() : null;

    try {
      const entry = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(contentEntries)
          .values({
            workspaceId: p.workspaceId,
            projectId: p.projectId,
            contentTypeId: type.id,
            slug,
            status,
            data: p.dto.data,
            authorId: p.userId,
            createdBy: p.userId,
            publishedAt,
          })
          .returning();
        await tx.insert(contentRevisions).values({
          entryId: row.id,
          version: 1,
          data: row.data,
          status: row.status,
          createdBy: p.userId,
        });
        return row;
      });
      return this.toView(entry);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw rpcError(
          'CONFLICT',
          `An entry with slug "${slug}" already exists.`,
        );
      }
      throw err;
    }
  }

  async list(p: {
    workspaceId: string;
    projectId: string;
    query: ListEntriesQueryDto;
  }): Promise<Paginated<ContentEntryView>> {
    const page = p.query.page ?? 1;
    const limit = p.query.limit ?? 20;

    const filters = [
      eq(contentEntries.projectId, p.projectId),
      isNull(contentEntries.deletedAt),
    ];
    if (p.query.contentTypeId) {
      filters.push(eq(contentEntries.contentTypeId, p.query.contentTypeId));
    }
    if (p.query.status) {
      filters.push(eq(contentEntries.status, p.query.status));
    }
    const where = and(...filters);

    const total = await this.db.$count(contentEntries, where);
    const rows = await this.db.query.contentEntries.findMany({
      where,
      orderBy: desc(contentEntries.updatedAt),
      limit,
      offset: (page - 1) * limit,
    });

    return { items: rows.map((r) => this.toView(r)), page, limit, total };
  }

  async get(p: {
    workspaceId: string;
    projectId: string;
    id: string;
  }): Promise<ContentEntryView> {
    return this.toView(await this.requireRow(p.projectId, p.id));
  }

  async update(p: {
    workspaceId: string;
    projectId: string;
    userId: string;
    id: string;
    dto: UpdateEntryDto;
  }): Promise<ContentEntryView> {
    const entry = await this.requireRow(p.projectId, p.id);
    const prevStatus = entry.status;

    let data = entry.data as Record<string, unknown>;
    if (p.dto.data) {
      const type = await this.types.requireRow(p.projectId, entry.contentTypeId);
      data = { ...data, ...p.dto.data };
      validateEntryData(type.fields as FieldDef[], data);
      await this.assertUniqueFields(
        p.projectId,
        entry.contentTypeId,
        type.fields as FieldDef[],
        data,
        entry.id,
      );
    }

    const status = (p.dto.status ?? entry.status) as EntryStatus;
    // Set publishedAt the first time an entry goes live.
    const publishedAt =
      status === 'published' && !entry.publishedAt
        ? new Date()
        : entry.publishedAt;

    const version = await this.nextVersion(entry.id);
    try {
      const updated = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .update(contentEntries)
          .set({
            ...(p.dto.slug !== undefined ? { slug: p.dto.slug } : {}),
            status,
            data,
            publishedAt,
            updatedBy: p.userId,
          })
          .where(eq(contentEntries.id, entry.id))
          .returning();
        await tx.insert(contentRevisions).values({
          entryId: row.id,
          version,
          data: row.data,
          status: row.status,
          createdBy: p.userId,
        });
        return row;
      });

      // Fire webhooks on publish-state changes (rebuild the consumer site).
      if (updated.status === 'published') {
        void this.emit(p.projectId, 'entry.published', updated);
      } else if (prevStatus === 'published') {
        void this.emit(p.projectId, 'entry.unpublished', updated);
      }

      return this.toView(updated);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw rpcError(
          'CONFLICT',
          `An entry with slug "${p.dto.slug}" already exists.`,
        );
      }
      throw err;
    }
  }

  async publish(p: {
    workspaceId: string;
    projectId: string;
    userId: string;
    id: string;
  }): Promise<ContentEntryView> {
    return this.update({
      workspaceId: p.workspaceId,
      projectId: p.projectId,
      userId: p.userId,
      id: p.id,
      dto: { status: 'published' },
    });
  }

  async remove(p: {
    workspaceId: string;
    projectId: string;
    id: string;
  }): Promise<{ success: true }> {
    const row = await this.requireRow(p.projectId, p.id);
    await this.db
      .update(contentEntries)
      .set({ deletedAt: new Date() })
      .where(eq(contentEntries.id, p.id));
    // Notify subscribers if a published entry was removed (purge consumer caches).
    if (row.status === 'published') {
      void this.emit(p.projectId, 'entry.deleted', row);
    }
    return { success: true };
  }

  /** Version history for an entry (newest first). */
  async listRevisions(p: {
    projectId: string;
    entryId: string;
  }): Promise<RevisionView[]> {
    await this.requireRow(p.projectId, p.entryId); // scope the entry to the project
    const rows = await this.db.query.contentRevisions.findMany({
      where: eq(contentRevisions.entryId, p.entryId),
      orderBy: desc(contentRevisions.version),
    });
    return rows.map((r) => ({
      id: r.id,
      entryId: r.entryId,
      version: r.version,
      status: r.status,
      data: r.data as Record<string, unknown>,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Restore an entry's data to a past revision (records a new revision). */
  async restoreRevision(p: {
    workspaceId: string;
    projectId: string;
    userId: string;
    entryId: string;
    version: number;
  }): Promise<ContentEntryView> {
    const entry = await this.requireRow(p.projectId, p.entryId);
    const rev = await this.db.query.contentRevisions.findFirst({
      where: and(
        eq(contentRevisions.entryId, p.entryId),
        eq(contentRevisions.version, p.version),
      ),
    });
    if (!rev) throw rpcError('NOT_FOUND', 'Revision not found.');

    const version = await this.nextVersion(entry.id);
    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(contentEntries)
        .set({ data: rev.data, updatedBy: p.userId })
        .where(eq(contentEntries.id, entry.id))
        .returning();
      await tx.insert(contentRevisions).values({
        entryId: row.id,
        version,
        data: row.data,
        status: row.status,
        createdBy: p.userId,
      });
      return row;
    });
    // A live entry's content changed → refresh caches/consumers.
    if (updated.status === 'published') {
      void this.emit(p.projectId, 'entry.published', updated);
    }
    return this.toView(updated);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Fire a webhook event for an entry, resolving its type's apiId. Fire-and-
   * forget — never blocks or fails the operation that triggered it.
   */
  private async emit(
    projectId: string,
    event: WebhookEvent,
    row: EntryRow,
  ): Promise<void> {
    try {
      const type = await this.types.requireRow(projectId, row.contentTypeId);
      const payload: WebhookPayload = {
        event,
        projectId,
        firedAt: new Date().toISOString(),
        entry: {
          id: row.id,
          type: type.apiId,
          slug: row.slug,
          status: row.status,
          publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
          updatedAt: row.updatedAt.toISOString(),
        },
      };
      // Purge CDN caches for this entry + its type's lists, then notify subscribers.
      await Promise.all([
        this.cache.purgeEntry(type.apiId, row.id),
        this.webhooks.dispatch(projectId, payload),
      ]);
    } catch {
      // Webhook/purge failures must never surface to the content operation.
    }
  }

  /**
   * Enforce `FieldDef.unique` within a content type + project. Compares the
   * JSONB value at each unique field's key; empty values are skipped. Excludes
   * the entry being updated so re-saving its own value isn't a conflict.
   */
  private async assertUniqueFields(
    projectId: string,
    contentTypeId: string,
    fields: FieldDef[],
    data: Record<string, unknown>,
    excludeId?: string,
  ): Promise<void> {
    const uniques = fields.filter((f) => f.unique);
    for (const f of uniques) {
      const value = data[f.key];
      if (value === undefined || value === null || value === '') continue;
      const conds = [
        eq(contentEntries.projectId, projectId),
        eq(contentEntries.contentTypeId, contentTypeId),
        isNull(contentEntries.deletedAt),
        sql`${contentEntries.data} ->> ${f.key} = ${String(value)}`,
      ];
      if (excludeId) conds.push(ne(contentEntries.id, excludeId));
      const existing = await this.db.query.contentEntries.findFirst({
        where: and(...conds),
      });
      if (existing) {
        throw rpcError(
          'CONFLICT',
          `${f.label} must be unique — "${String(value)}" is already taken.`,
        );
      }
    }
  }

  private async requireRow(projectId: string, id: string): Promise<EntryRow> {
    const row = await this.db.query.contentEntries.findFirst({
      where: and(
        eq(contentEntries.id, id),
        eq(contentEntries.projectId, projectId),
        isNull(contentEntries.deletedAt),
      ),
    });
    if (!row) throw rpcError('NOT_FOUND', 'Content entry not found.');
    return row;
  }

  private async nextVersion(entryId: string): Promise<number> {
    const [{ v }] = await this.db
      .select({ v: max(contentRevisions.version) })
      .from(contentRevisions)
      .where(eq(contentRevisions.entryId, entryId));
    return (v ?? 0) + 1;
  }

  /** Slug from the first text field value, else the type name — with a suffix. */
  private deriveSlug(
    fields: FieldDef[],
    data: Record<string, unknown>,
    typeName: string,
  ): string {
    const textField = fields.find(
      (f) =>
        (f.type === 'text' || f.type === 'richtext') &&
        typeof data[f.key] === 'string',
    );
    const source = textField ? String(data[textField.key]) : typeName;
    return uniqueSlug(source);
  }

  private toView(r: EntryRow): ContentEntryView {
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      projectId: r.projectId,
      contentTypeId: r.contentTypeId,
      slug: r.slug,
      status: r.status as EntryStatus,
      data: r.data as Record<string, unknown>,
      authorId: r.authorId,
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
