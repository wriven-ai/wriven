import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CreateMediaDto,
  DeliveryMedia,
  maxBytesForContentType,
  MediaView,
  Paginated,
  PresignResult,
  PresignUploadDto,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';
import { CoreEntitlementsService } from '../entitlements/core-entitlements.service';
import { StorageService } from '../storage/storage.service';

const { mediaAssets } = schema;
type MediaRow = typeof mediaAssets.$inferSelect;

/** Upload allow-list: any image/video plus a few document types. */
const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'application/json',
]);
const isAllowedType = (ct: string): boolean =>
  ct.startsWith('image/') || ct.startsWith('video/') || ALLOWED_FILE_TYPES.has(ct);

const kindFromMime = (ct: string): 'image' | 'video' | 'file' => {
  if (ct.startsWith('image/')) return 'image';
  if (ct.startsWith('video/')) return 'video';
  return 'file';
};

const extFromFilename = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : '';
};

@Injectable()
export class MediaService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly storage: StorageService,
    private readonly entitlements: CoreEntitlementsService,
  ) {}

  /** Issue a presigned PUT URL + the object key the browser uploads to. */
  async presign(p: {
    workspaceId: string;
    projectId: string;
    userId: string;
    dto: PresignUploadDto;
  }): Promise<PresignResult> {
    if (!isAllowedType(p.dto.contentType)) {
      throw rpcError('VALIDATION_ERROR', 'Unsupported file type.');
    }
    const maxBytes = maxBytesForContentType(p.dto.contentType);
    if (p.dto.size != null && p.dto.size > maxBytes) {
      const mb = Math.round(maxBytes / (1024 * 1024));
      throw rpcError(
        'VALIDATION_ERROR',
        `File too large. Max ${mb} MB for this file type.`,
      );
    }
    // Per-workspace storage quota from the plan (storageMb). Block before signing.
    if (p.dto.size != null) {
      const limitBytes = await this.entitlements.storageLimitBytes(
        p.workspaceId,
      );
      if (limitBytes != null) {
        const used = await this.workspaceUsage(p.workspaceId);
        if (used + p.dto.size > limitBytes) {
          const quotaMb = Math.round(limitBytes / (1024 * 1024));
          const remainingMb = Math.max(
            0,
            (limitBytes - used) / (1024 * 1024),
          ).toFixed(1);
          throw rpcError(
            'PLAN_LIMIT_REACHED',
            `Workspace storage limit reached (${quotaMb} MB). ${remainingMb} MB free — delete some media or upgrade.`,
          );
        }
      }
    }
    const ext = extFromFilename(p.dto.filename);
    const key = `projects/${p.projectId}/${randomUUID()}${ext ? `.${ext}` : ''}`;
    const uploadUrl = await this.storage.presignUpload(key, p.dto.contentType);
    return { uploadUrl, key };
  }

  /**
   * Issue a presigned PUT URL + object key for a profile photo (specs/18).
   * Image-only, capped at the image size limit. Unlike {@link presign}: no
   * `media_assets` row (an avatar is not project media) and no storage-quota
   * check (it is not workspace media). Key lives under `avatars/<userId>/`.
   */
  async presignAvatar(p: {
    userId: string;
    dto: PresignUploadDto;
  }): Promise<PresignResult> {
    if (!p.dto.contentType.startsWith('image/')) {
      throw rpcError('VALIDATION_ERROR', 'Avatar must be an image file.');
    }
    const maxBytes = maxBytesForContentType(p.dto.contentType);
    if (p.dto.size != null && p.dto.size > maxBytes) {
      const mb = Math.round(maxBytes / (1024 * 1024));
      throw rpcError('VALIDATION_ERROR', `Avatar too large. Max ${mb} MB.`);
    }
    const ext = extFromFilename(p.dto.filename);
    const key = `avatars/${p.userId}/${randomUUID()}${ext ? `.${ext}` : ''}`;
    const uploadUrl = await this.storage.presignUpload(key, p.dto.contentType);
    return { uploadUrl, key };
  }

  /**
   * Best-effort delete of an orphaned avatar object on photo change/remove
   * (specs/18). Only deletes keys under `avatars/` — never an arbitrary object.
   * `storage.delete` swallows errors, so a missing/failed R2 object never
   * surfaces to the user.
   */
  async deleteAvatar(p: { key: string }): Promise<void> {
    if (!p.key.startsWith('avatars/')) {
      throw rpcError('VALIDATION_ERROR', 'Refusing to delete a non-avatar key.');
    }
    await this.storage.delete(p.key);
  }

  /** Sum of stored bytes for a workspace's live (non-deleted) media. */
  private async workspaceUsage(workspaceId: string): Promise<number> {
    const [row] = await this.db
      .select({
        total: sql<string>`coalesce(sum(${mediaAssets.sizeBytes}), 0)`,
      })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.workspaceId, workspaceId),
          isNull(mediaAssets.deletedAt),
        ),
      );
    return Number(row?.total ?? 0);
  }

  /** Persist metadata after the browser has uploaded the bytes to R2. */
  async create(p: {
    workspaceId: string;
    projectId: string;
    userId: string;
    dto: CreateMediaDto;
  }): Promise<MediaView> {
    // The key must live under this project's prefix — never trust a raw key.
    if (!p.dto.key.startsWith(`projects/${p.projectId}/`)) {
      throw rpcError('VALIDATION_ERROR', 'Invalid object key for this project.');
    }
    const kind = p.dto.mime ? kindFromMime(p.dto.mime) : p.dto.kind;
    try {
      const [row] = await this.db
        .insert(mediaAssets)
        .values({
          workspaceId: p.workspaceId,
          projectId: p.projectId,
          r2Key: p.dto.key,
          kind,
          mime: p.dto.mime ?? null,
          sizeBytes: p.dto.size ?? null,
          width: p.dto.width ?? null,
          height: p.dto.height ?? null,
          alt: p.dto.alt ?? null,
          originalFilename: p.dto.originalFilename ?? null,
          uploadedBy: p.userId,
        })
        .returning();
      return this.toView(row);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw rpcError('CONFLICT', 'That file has already been uploaded.');
      }
      throw err;
    }
  }

  async list(p: {
    workspaceId: string;
    projectId: string;
    page?: number;
    limit?: number;
  }): Promise<Paginated<MediaView>> {
    const page = p.page ?? 1;
    const limit = p.limit ?? 30;
    const where = and(
      eq(mediaAssets.projectId, p.projectId),
      isNull(mediaAssets.deletedAt),
    );
    const total = await this.db.$count(mediaAssets, where);
    const rows = await this.db.query.mediaAssets.findMany({
      where,
      orderBy: desc(mediaAssets.createdAt),
      limit,
      offset: (page - 1) * limit,
    });
    return { items: rows.map((r) => this.toView(r)), page, limit, total };
  }

  async get(p: {
    workspaceId: string;
    projectId: string;
    id: string;
  }): Promise<MediaView> {
    return this.toView(await this.requireRow(p.projectId, p.id));
  }

  async remove(p: {
    workspaceId: string;
    projectId: string;
    id: string;
  }): Promise<{ success: true }> {
    const row = await this.requireRow(p.projectId, p.id);
    await this.db
      .update(mediaAssets)
      .set({ deletedAt: new Date() })
      .where(eq(mediaAssets.id, row.id));
    void this.storage.delete(row.r2Key);
    return { success: true };
  }

  /**
   * Bulk soft-delete: one atomic `UPDATE … WHERE id IN (…)` scoped to the
   * project (so a caller can't touch another project's assets), then best-effort
   * R2 cleanup per object — fire-and-forget, parallel. Rows already soft-deleted
   * or belonging to other projects are simply not matched. Returns the count
   * actually deleted.
   */
  async removeMany(p: {
    workspaceId: string;
    projectId: string;
    ids: string[];
  }): Promise<{ success: true; deleted: number }> {
    if (p.ids.length === 0) return { success: true, deleted: 0 };
    const rows = await this.db.query.mediaAssets.findMany({
      where: and(
        eq(mediaAssets.projectId, p.projectId),
        inArray(mediaAssets.id, p.ids),
        isNull(mediaAssets.deletedAt),
      ),
      columns: { id: true, r2Key: true },
    });
    if (rows.length === 0) return { success: true, deleted: 0 };
    await this.db
      .update(mediaAssets)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(mediaAssets.projectId, p.projectId),
          inArray(mediaAssets.id, rows.map((r) => r.id)),
        ),
      );
    for (const r of rows) void this.storage.delete(r.r2Key);
    return { success: true, deleted: rows.length };
  }

  /**
   * Resolve media asset ids to public objects — used by the Delivery API to
   * expand `media` field values. Missing/deleted ids are simply absent from the
   * map (the caller drops them to null).
   */
  async resolveMany(
    projectId: string,
    ids: string[],
  ): Promise<Map<string, DeliveryMedia>> {
    const unique = [...new Set(ids)].filter(Boolean);
    if (unique.length === 0) return new Map();
    const rows = await this.db.query.mediaAssets.findMany({
      where: and(
        eq(mediaAssets.projectId, projectId),
        inArray(mediaAssets.id, unique),
        isNull(mediaAssets.deletedAt),
      ),
    });
    return new Map(
      rows.map((r) => [
        r.id,
        {
          id: r.id,
          url: this.storage.publicUrl(r.r2Key),
          alt: r.alt,
          width: r.width,
          height: r.height,
          mime: r.mime,
        },
      ]),
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async requireRow(projectId: string, id: string): Promise<MediaRow> {
    const row = await this.db.query.mediaAssets.findFirst({
      where: and(
        eq(mediaAssets.id, id),
        eq(mediaAssets.projectId, projectId),
        isNull(mediaAssets.deletedAt),
      ),
    });
    if (!row) throw rpcError('NOT_FOUND', 'Media asset not found.');
    return row;
  }

  private toView(r: MediaRow): MediaView {
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      projectId: r.projectId,
      url: this.storage.publicUrl(r.r2Key),
      kind: r.kind,
      mime: r.mime,
      sizeBytes: r.sizeBytes,
      width: r.width,
      height: r.height,
      alt: r.alt,
      originalFilename: r.originalFilename,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
