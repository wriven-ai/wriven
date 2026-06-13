import { Inject, Injectable } from '@nestjs/common';
import {
  ContentTypeView,
  CreateContentTypeDto,
  FieldDef,
  UpdateContentTypeDto,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, eq, isNull } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';

const { contentTypes } = schema;
type ContentTypeRow = typeof contentTypes.$inferSelect;

@Injectable()
export class ContentTypesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>) {}

  async create(p: {
    workspaceId: string;
    userId: string;
    dto: CreateContentTypeDto;
  }): Promise<ContentTypeView> {
    this.assertUniqueKeys(p.dto.fields);
    try {
      const [row] = await this.db
        .insert(contentTypes)
        .values({
          workspaceId: p.workspaceId,
          name: p.dto.name,
          apiId: p.dto.apiId,
          fields: p.dto.fields,
          createdBy: p.userId,
        })
        .returning();
      return this.toView(row);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw rpcError('CONFLICT', `A content type "${p.dto.apiId}" already exists.`);
      }
      throw err;
    }
  }

  async list(p: { workspaceId: string }): Promise<ContentTypeView[]> {
    const rows = await this.db
      .select()
      .from(contentTypes)
      .where(
        and(
          eq(contentTypes.workspaceId, p.workspaceId),
          isNull(contentTypes.deletedAt),
        ),
      )
      .orderBy(contentTypes.createdAt);
    return rows.map((r) => this.toView(r));
  }

  async get(p: { workspaceId: string; id: string }): Promise<ContentTypeView> {
    return this.toView(await this.requireRow(p.workspaceId, p.id));
  }

  async update(p: {
    workspaceId: string;
    id: string;
    dto: UpdateContentTypeDto;
  }): Promise<ContentTypeView> {
    await this.requireRow(p.workspaceId, p.id);
    if (p.dto.fields) this.assertUniqueKeys(p.dto.fields);
    const [row] = await this.db
      .update(contentTypes)
      .set({
        ...(p.dto.name !== undefined ? { name: p.dto.name } : {}),
        ...(p.dto.fields !== undefined ? { fields: p.dto.fields } : {}),
      })
      .where(eq(contentTypes.id, p.id))
      .returning();
    return this.toView(row);
  }

  async remove(p: { workspaceId: string; id: string }): Promise<{ success: true }> {
    await this.requireRow(p.workspaceId, p.id);
    await this.db
      .update(contentTypes)
      .set({ deletedAt: new Date() })
      .where(eq(contentTypes.id, p.id));
    return { success: true };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Load a non-deleted type scoped to the workspace, or 404. */
  async requireRow(workspaceId: string, id: string): Promise<ContentTypeRow> {
    const [row] = await this.db
      .select()
      .from(contentTypes)
      .where(
        and(
          eq(contentTypes.id, id),
          eq(contentTypes.workspaceId, workspaceId),
          isNull(contentTypes.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw rpcError('NOT_FOUND', 'Content type not found.');
    return row;
  }

  private assertUniqueKeys(fields: FieldDef[]): void {
    const keys = new Set<string>();
    for (const f of fields) {
      if (keys.has(f.key)) {
        throw rpcError('VALIDATION_ERROR', `Duplicate field key "${f.key}".`);
      }
      keys.add(f.key);
    }
  }

  private toView(r: ContentTypeRow): ContentTypeView {
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      name: r.name,
      apiId: r.apiId,
      fields: r.fields as FieldDef[],
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
