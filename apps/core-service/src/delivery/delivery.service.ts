import { Inject, Injectable } from '@nestjs/common';
import {
  DeliveryEntry,
  DeliveryMedia,
  DeliveryQueryDto,
  FieldDef,
  Paginated,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';
import { MediaService } from '../media/media.service';

const { contentEntries, contentTypes } = schema;
type EntryRow = typeof contentEntries.$inferSelect;
type ContentTypeRow = typeof contentTypes.$inferSelect;

/** Minimal ProseMirror node shape — rich-text bodies are stored as this JSON. */
interface ProseNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: ProseNode[];
}

/** System columns the delivery API allows sorting on. */
const SORTABLE = {
  publishedAt: contentEntries.publishedAt,
  createdAt: contentEntries.createdAt,
  updatedAt: contentEntries.updatedAt,
  slug: contentEntries.slug,
} as const;

/**
 * Read-only, published-only content access for the public Delivery API. The
 * project is fixed by the caller (resolved from the API key at the gateway); a
 * key can never read another project.
 */
/** Statuses a delivery read may return. Preview keys also see drafts. */
const visibleStatuses = (preview?: boolean): string[] =>
  preview ? ['draft', 'published'] : ['published'];

@Injectable()
export class DeliveryService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly media: MediaService,
  ) {}

  /** Replace `media` field ids with resolved public objects (or null). Always runs. */
  private async resolveMediaFields(
    projectId: string,
    fields: FieldDef[],
    data: Record<string, unknown>,
  ): Promise<void> {
    const mediaFields = fields.filter((f) => f.type === 'media');
    if (mediaFields.length === 0) return;

    const ids: string[] = [];
    for (const f of mediaFields) {
      const v = data[f.key];
      if (f.multiple && Array.isArray(v)) ids.push(...v.map(String));
      else if (typeof v === 'string') ids.push(v);
    }
    const resolved = await this.media.resolveMany(projectId, ids);

    for (const f of mediaFields) {
      const v = data[f.key];
      if (f.multiple && Array.isArray(v)) {
        data[f.key] = v.map((id) => resolved.get(String(id)) ?? null);
      } else if (typeof v === 'string') {
        data[f.key] = resolved.get(v) ?? null;
      }
    }
  }

  /**
   * Resolve inline `image` nodes inside rich-text bodies. The editor stores only
   * `assetId` (keys-only); here we hydrate each image node with the public `src`
   * + dimensions so consumers can render directly. Mirrors `resolveMediaFields`.
   */
  private async resolveRichTextMedia(
    projectId: string,
    fields: FieldDef[],
    data: Record<string, unknown>,
  ): Promise<void> {
    const rtFields = fields.filter((f) => f.type === 'richtext');
    if (rtFields.length === 0) return;

    const ids: string[] = [];
    for (const f of rtFields) {
      const doc = data[f.key];
      if (doc && typeof doc === 'object') {
        this.collectImageAssetIds(doc as ProseNode, ids);
      }
    }
    if (ids.length === 0) return;

    const resolved = await this.media.resolveMany(projectId, ids);
    for (const f of rtFields) {
      const doc = data[f.key];
      if (doc && typeof doc === 'object') {
        this.applyImageResolution(doc as ProseNode, resolved);
      }
    }
  }

  private collectImageAssetIds(node: ProseNode, out: string[]): void {
    if (node.type === 'image' && node.attrs?.assetId) {
      out.push(String(node.attrs.assetId));
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) this.collectImageAssetIds(child, out);
    }
  }

  private applyImageResolution(
    node: ProseNode,
    resolved: Map<string, DeliveryMedia>,
  ): void {
    if (node.type === 'image' && node.attrs?.assetId) {
      const m = resolved.get(String(node.attrs.assetId));
      node.attrs = m
        ? {
            ...node.attrs,
            src: m.url,
            alt: node.attrs.alt ?? m.alt,
            width: m.width,
            height: m.height,
            mime: m.mime,
          }
        : { ...node.attrs, src: null };
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) this.applyImageResolution(child, resolved);
    }
  }

  async list(p: {
    projectId: string;
    apiId: string;
    query: DeliveryQueryDto;
    preview?: boolean;
  }): Promise<Paginated<DeliveryEntry>> {
    const type = await this.requireType(p.projectId, p.apiId);
    const page = p.query.page ?? 1;
    const limit = p.query.limit ?? 20;

    const filters = [
      eq(contentEntries.projectId, p.projectId),
      eq(contentEntries.contentTypeId, type.id),
      inArray(contentEntries.status, visibleStatuses(p.preview)),
      isNull(contentEntries.deletedAt),
    ];
    if (p.query.filter) {
      for (const [key, value] of Object.entries(p.query.filter)) {
        // Parameterized JSONB equality — `key` and `value` are bound, not interpolated.
        filters.push(sql`${contentEntries.data} ->> ${key} = ${value}`);
      }
    }
    const where = and(...filters);

    const total = await this.db.$count(contentEntries, where);
    const rows = await this.db.query.contentEntries.findMany({
      where,
      orderBy: this.orderBy(p.query.sort),
      limit,
      offset: (page - 1) * limit,
    });

    const fields = type.fields as FieldDef[];
    const items = await Promise.all(
      rows.map((r) =>
        this.toDelivery(r, type.apiId, fields, p.query.select, p.query.include ?? 0),
      ),
    );
    return { items, page, limit, total };
  }

  async get(p: {
    projectId: string;
    apiId: string;
    slug: string;
    query: DeliveryQueryDto;
    preview?: boolean;
  }): Promise<DeliveryEntry> {
    const type = await this.requireType(p.projectId, p.apiId);
    const row = await this.db.query.contentEntries.findFirst({
      where: and(
        eq(contentEntries.projectId, p.projectId),
        eq(contentEntries.contentTypeId, type.id),
        eq(contentEntries.slug, p.slug),
        inArray(contentEntries.status, visibleStatuses(p.preview)),
        isNull(contentEntries.deletedAt),
      ),
    });
    if (!row) throw rpcError('NOT_FOUND', 'Content not found.');
    return this.toDelivery(
      row,
      type.apiId,
      type.fields as FieldDef[],
      p.query.select,
      p.query.include ?? 0,
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async requireType(
    projectId: string,
    apiId: string,
  ): Promise<ContentTypeRow> {
    const type = await this.db.query.contentTypes.findFirst({
      where: and(
        eq(contentTypes.projectId, projectId),
        eq(contentTypes.apiId, apiId),
        isNull(contentTypes.deletedAt),
      ),
    });
    if (!type) throw rpcError('NOT_FOUND', `Unknown content type "${apiId}".`);
    return type;
  }

  private orderBy(sort?: string) {
    if (!sort) return desc(contentEntries.publishedAt);
    const dir = sort.startsWith('-') ? 'desc' : 'asc';
    const col = SORTABLE[sort.replace(/^-/, '') as keyof typeof SORTABLE];
    if (!col) return desc(contentEntries.publishedAt);
    return dir === 'desc' ? desc(col) : asc(col);
  }

  /** Build the public entry shape, expanding references and projecting `select`. */
  private async toDelivery(
    row: EntryRow,
    typeApiId: string,
    fields: FieldDef[],
    select: string | undefined,
    depth: number,
  ): Promise<DeliveryEntry> {
    // Clone once — we resolve media (always) and references (when include > 0).
    let data: Record<string, unknown> = {
      ...(row.data as Record<string, unknown>),
    };

    await this.resolveMediaFields(row.projectId, fields, data);
    await this.resolveRichTextMedia(row.projectId, fields, data);

    if (depth > 0) {
      for (const f of fields) {
        if (f.type !== 'reference' || !f.refTypeId) continue;
        const value = data[f.key];
        if (f.multiple && Array.isArray(value)) {
          data[f.key] = await Promise.all(
            value.map((id) =>
              this.expandRef(row.projectId, String(id), depth - 1),
            ),
          );
        } else if (typeof value === 'string') {
          data[f.key] = await this.expandRef(row.projectId, value, depth - 1);
        }
      }
    }

    if (select) {
      const keys = select.split(',').map((s) => s.trim()).filter(Boolean);
      const picked: Record<string, unknown> = {};
      for (const k of keys) if (k in data) picked[k] = data[k];
      data = picked;
    }

    return {
      id: row.id,
      type: typeApiId,
      slug: row.slug,
      data,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Resolve a referenced entry id to its published delivery shape, or keep the id. */
  private async expandRef(
    projectId: string,
    entryId: string,
    depth: number,
  ): Promise<DeliveryEntry | string> {
    const ref = await this.db.query.contentEntries.findFirst({
      where: and(
        eq(contentEntries.id, entryId),
        eq(contentEntries.projectId, projectId),
        eq(contentEntries.status, 'published'),
        isNull(contentEntries.deletedAt),
      ),
    });
    if (!ref) return entryId; // unresolved / unpublished → leave the raw id

    const refType = await this.db.query.contentTypes.findFirst({
      where: and(
        eq(contentTypes.id, ref.contentTypeId),
        isNull(contentTypes.deletedAt),
      ),
    });
    return this.toDelivery(
      ref,
      refType?.apiId ?? '',
      (refType?.fields as FieldDef[]) ?? [],
      undefined,
      depth,
    );
  }
}
