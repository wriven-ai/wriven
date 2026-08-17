import { Inject, Injectable } from '@nestjs/common';
import {
  ContentTypeView,
  CreateContentTypeDto,
  FieldDef,
  Paginated,
  UpdateContentTypeDto,
} from '@wriven/contracts';
import { DRIZZLE, dbError } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';
import { CoreEntitlementsService } from '../entitlements/core-entitlements.service';

const { contentTypes } = schema;
type ContentTypeRow = typeof contentTypes.$inferSelect;
const AI_ELIGIBLE_FIELD_TYPES = new Set<FieldDef['type']>(['text', 'richtext', 'select']);

@Injectable()
export class ContentTypesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly entitlements: CoreEntitlementsService,
  ) {}

  async create(p: {
    workspaceId: string;
    projectId: string;
    userId: string;
    dto: CreateContentTypeDto;
  }): Promise<ContentTypeView> {
    this.assertUniqueKeys(p.dto.fields);
    this.assertFieldPolicies(p.dto.fields);
    await this.entitlements.assertContentTypeQuota(p.workspaceId);
    try {
      const [row] = await this.db
        .insert(contentTypes)
        .values({
          workspaceId: p.workspaceId,
          projectId: p.projectId,
          name: p.dto.name,
          apiId: p.dto.apiId,
          fields: p.dto.fields,
          createdBy: p.userId,
        })
        .returning();
      return this.toView(row);
    } catch (err) {
      // drizzle-orm wraps postgres.js errors — unwrap to the SQLSTATE code.
      if (dbError(err)?.code === '23505') {
        throw rpcError('CONFLICT', `A content type "${p.dto.apiId}" already exists.`);
      }
      throw err;
    }
  }

  /**
   * Seed a starter content type for a brand-new project so users aren't faced
   * with an empty workspace. Idempotent — does nothing if the project already
   * has any content type. Called after project creation.
   */
  async seedDefaults(p: {
    workspaceId: string;
    projectId: string;
    userId: string;
  }): Promise<{ seeded: boolean }> {
    const existing = await this.db.query.contentTypes.findFirst({
      where: and(
        eq(contentTypes.projectId, p.projectId),
        isNull(contentTypes.deletedAt),
      ),
    });
    if (existing) return { seeded: false };

    const fields: FieldDef[] = [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'body', label: 'Body', type: 'richtext' },
      { key: 'cover', label: 'Cover image', type: 'media' },
      { key: 'excerpt', label: 'Excerpt', type: 'text' },
    ];
    await this.db.insert(contentTypes).values({
      workspaceId: p.workspaceId,
      projectId: p.projectId,
      name: 'Post',
      apiId: 'post',
      fields,
      createdBy: p.userId,
    });
    return { seeded: true };
  }

  async list(p: {
    workspaceId: string;
    projectId: string;
    page?: number;
    limit?: number;
  }): Promise<Paginated<ContentTypeView>> {
    const page = p.page ?? 1;
    const limit = p.limit ?? 10;
    const where = and(
      eq(contentTypes.projectId, p.projectId),
      isNull(contentTypes.deletedAt),
    );
    const total = await this.db.$count(contentTypes, where);
    const rows = await this.db.query.contentTypes.findMany({
      where,
      orderBy: desc(contentTypes.createdAt),
      limit,
      offset: (page - 1) * limit,
    });
    return { items: rows.map((r) => this.toView(r)), page, limit, total };
  }

  async get(p: {
    workspaceId: string;
    projectId: string;
    id: string;
  }): Promise<ContentTypeView> {
    return this.toView(await this.requireRow(p.projectId, p.id));
  }

  async update(p: {
    workspaceId: string;
    projectId: string;
    id: string;
    dto: UpdateContentTypeDto;
  }): Promise<ContentTypeView> {
    await this.requireRow(p.projectId, p.id);
    if (p.dto.fields) {
      this.assertUniqueKeys(p.dto.fields);
      this.assertFieldPolicies(p.dto.fields);
    }
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

  async remove(p: {
    workspaceId: string;
    projectId: string;
    id: string;
  }): Promise<{ success: true }> {
    await this.requireRow(p.projectId, p.id);
    await this.db
      .update(contentTypes)
      .set({ deletedAt: new Date() })
      .where(eq(contentTypes.id, p.id));
    return { success: true };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Load a non-deleted type scoped to the project, or 404. */
  async requireRow(projectId: string, id: string): Promise<ContentTypeRow> {
    const row = await this.db.query.contentTypes.findFirst({
      where: and(
        eq(contentTypes.id, id),
        eq(contentTypes.projectId, projectId),
        isNull(contentTypes.deletedAt),
      ),
    });
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

  /** Validate field combinations whose meaning cannot be expressed per property. */
  private assertFieldPolicies(fields: FieldDef[]): void {
    const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
    for (const field of fields) {
      if (field.type === 'select') {
        const rawOptions = field.options ?? [];
        const options = rawOptions.map((option) => option.trim());
        if (
          options.length === 0 ||
          options.some((option, index) => !option || option !== rawOptions[index]) ||
          new Set(options).size !== options.length
        ) {
          throw rpcError(
            'VALIDATION_ERROR',
            `Select field "${field.key}" requires unique, non-empty options.`,
          );
        }
      } else if (field.options?.length) {
        throw rpcError(
          'VALIDATION_ERROR',
          `Only select fields can define options ("${field.key}").`,
        );
      }

      // Sensitivity is the only AI control an author configures per field.
      // Eligibility is derived (Tier-1 ∧ single-value ∧ not sensitive), so there
      // is no enable flag or per-field action list to validate.
      if (
        field.aiPrivate &&
        field.aiContextFields?.length
      ) {
        throw rpcError(
          'VALIDATION_ERROR',
          `Sensitive field "${field.key}" cannot use AI context.`,
        );
      }

      if (field.aiContextFields?.length) {
        if (!AI_ELIGIBLE_FIELD_TYPES.has(field.type) || field.multiple) {
          throw rpcError(
            'VALIDATION_ERROR',
            `Only scalar text, richtext, or select fields can configure AI context ("${field.key}").`,
          );
        }
        const contextKeys = new Set(field.aiContextFields);
        if (contextKeys.size !== field.aiContextFields.length || contextKeys.has(field.key)) {
          throw rpcError(
            'VALIDATION_ERROR',
            `AI context for "${field.key}" must contain unique sibling fields.`,
          );
        }
        for (const contextKey of contextKeys) {
          const contextField = fieldsByKey.get(contextKey);
          if (!contextField || contextField.aiPrivate) {
            throw rpcError(
              'VALIDATION_ERROR',
              `AI context for "${field.key}" cannot include unknown or sensitive field "${contextKey}".`,
            );
          }
          // Context values must be scalars: the generation path forwards only
          // string/number/boolean sibling values, so an allowlisted multi-value
          // field would silently vanish from the prompt.
          if (contextField.multiple) {
            throw rpcError(
              'VALIDATION_ERROR',
              `AI context for "${field.key}" cannot include multi-value field "${contextKey}".`,
            );
          }
        }
      }
    }
  }

  private toView(r: ContentTypeRow): ContentTypeView {
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      projectId: r.projectId,
      name: r.name,
      apiId: r.apiId,
      fields: r.fields as FieldDef[],
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
