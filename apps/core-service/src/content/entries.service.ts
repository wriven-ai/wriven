import { Inject, Injectable } from '@nestjs/common';
import {
  ContentEntryView,
  CreateEntryDto,
  EntryStatus,
  FieldDef,
  ListEntriesQueryDto,
  Paginated,
  UpdateEntryDto,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, count, desc, eq, isNull, max } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import { uniqueSlug } from '../common/slug';
import * as schema from '../db/schema';
import { ContentTypesService } from './content-types.service';
import { validateEntryData } from './content.validator';

const { contentEntries, contentRevisions } = schema;
type EntryRow = typeof contentEntries.$inferSelect;

@Injectable()
export class EntriesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly types: ContentTypesService,
  ) {}

  async create(p: {
    workspaceId: string;
    userId: string;
    dto: CreateEntryDto;
  }): Promise<ContentEntryView> {
    const type = await this.types.requireRow(
      p.workspaceId,
      p.dto.contentTypeId,
    );
    validateEntryData(type.fields as FieldDef[], p.dto.data);

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
    query: ListEntriesQueryDto;
  }): Promise<Paginated<ContentEntryView>> {
    const page = p.query.page ?? 1;
    const limit = p.query.limit ?? 20;

    const filters = [
      eq(contentEntries.workspaceId, p.workspaceId),
      isNull(contentEntries.deletedAt),
    ];
    if (p.query.contentTypeId) {
      filters.push(eq(contentEntries.contentTypeId, p.query.contentTypeId));
    }
    if (p.query.status) {
      filters.push(eq(contentEntries.status, p.query.status));
    }
    const where = and(...filters);

    const [{ total }] = await this.db
      .select({ total: count() })
      .from(contentEntries)
      .where(where);
    const rows = await this.db
      .select()
      .from(contentEntries)
      .where(where)
      .orderBy(desc(contentEntries.updatedAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return { items: rows.map((r) => this.toView(r)), page, limit, total };
  }

  async get(p: { workspaceId: string; id: string }): Promise<ContentEntryView> {
    return this.toView(await this.requireRow(p.workspaceId, p.id));
  }

  async update(p: {
    workspaceId: string;
    userId: string;
    id: string;
    dto: UpdateEntryDto;
  }): Promise<ContentEntryView> {
    const entry = await this.requireRow(p.workspaceId, p.id);

    let data = entry.data as Record<string, unknown>;
    if (p.dto.data) {
      const type = await this.types.requireRow(
        p.workspaceId,
        entry.contentTypeId,
      );
      data = { ...data, ...p.dto.data };
      validateEntryData(type.fields as FieldDef[], data);
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
    userId: string;
    id: string;
  }): Promise<ContentEntryView> {
    return this.update({
      workspaceId: p.workspaceId,
      userId: p.userId,
      id: p.id,
      dto: { status: 'published' },
    });
  }

  async remove(p: {
    workspaceId: string;
    id: string;
  }): Promise<{ success: true }> {
    await this.requireRow(p.workspaceId, p.id);
    await this.db
      .update(contentEntries)
      .set({ deletedAt: new Date() })
      .where(eq(contentEntries.id, p.id));
    return { success: true };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async requireRow(workspaceId: string, id: string): Promise<EntryRow> {
    const [row] = await this.db
      .select()
      .from(contentEntries)
      .where(
        and(
          eq(contentEntries.id, id),
          eq(contentEntries.workspaceId, workspaceId),
          isNull(contentEntries.deletedAt),
        ),
      )
      .limit(1);
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
