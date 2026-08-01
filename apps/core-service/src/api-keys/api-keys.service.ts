import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import {
  ApiKeyResolution,
  ApiKeyScope,
  ApiKeyView,
  CreateApiKeyDto,
  CreateApiKeyResult,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, eq, isNull } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';

const { apiKeys } = schema;
type ApiKeyRow = typeof apiKeys.$inferSelect;

/** Token namespace per scope. The visible prefix tells users what a key can do. */
const SCOPE_PREFIX: Record<ApiKeyScope, string> = {
  read: 'wrk_live_',
  preview: 'wrk_preview_',
  manage: 'wrk_admin_',
};

const sha256 = (s: string): string =>
  createHash('sha256').update(s).digest('hex');

@Injectable()
export class ApiKeysService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>) {}

  /**
   * Mint a new key. The raw token is returned ONCE here and never stored — only
   * its sha-256 hash and a short display prefix are persisted.
   */
  async create(p: {
    workspaceId: string;
    projectId: string;
    userId: string;
    dto: CreateApiKeyDto;
  }): Promise<CreateApiKeyResult> {
    const scope: ApiKeyScope = p.dto.scope ?? 'read';
    // 24 random bytes → 32 url-safe chars. High entropy, so sha-256 (not bcrypt).
    const secret = randomBytes(24).toString('base64url');
    const token = `${SCOPE_PREFIX[scope]}${secret}`;
    const prefix = `${SCOPE_PREFIX[scope]}${secret.slice(0, 4)}`;

    const [row] = await this.db
      .insert(apiKeys)
      .values({
        workspaceId: p.workspaceId,
        projectId: p.projectId,
        name: p.dto.name,
        tokenHash: sha256(token),
        prefix,
        scope,
        createdBy: p.userId,
      })
      .returning();

    return { key: this.toView(row), token };
  }

  /** Active (non-revoked) keys for a project. Never exposes hash or raw token. */
  async list(p: {
    workspaceId: string;
    projectId: string;
  }): Promise<ApiKeyView[]> {
    const rows = await this.db.query.apiKeys.findMany({
      where: and(
        eq(apiKeys.projectId, p.projectId),
        isNull(apiKeys.revokedAt),
      ),
      orderBy: apiKeys.createdAt,
    });
    return rows.map((r) => this.toView(r));
  }

  async revoke(p: {
    workspaceId: string;
    projectId: string;
    id: string;
  }): Promise<{ success: true }> {
    const row = await this.db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.id, p.id),
        eq(apiKeys.projectId, p.projectId),
        isNull(apiKeys.revokedAt),
      ),
    });
    if (!row) throw rpcError('NOT_FOUND', 'API key not found.');
    await this.db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, p.id));
    return { success: true };
  }

  /**
   * Hot path (every Delivery API request): resolve a presented raw token to its
   * project scope, or null if unknown/revoked/expired. The caller hashes nothing
   * — pass the raw token; we hash and look it up by the unique hash index.
   * `lastUsedAt` is updated fire-and-forget so it never blocks the request.
   */
  async resolve(p: { token: string }): Promise<ApiKeyResolution | null> {
    const row = await this.db.query.apiKeys.findFirst({
      where: eq(apiKeys.tokenHash, sha256(p.token)),
    });
    if (!row || row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

    void this.db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, row.id));

    return {
      id: row.id,
      workspaceId: row.workspaceId,
      projectId: row.projectId,
      scope: row.scope as ApiKeyScope,
    };
  }

  private toView(r: ApiKeyRow): ApiKeyView {
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      projectId: r.projectId,
      name: r.name,
      prefix: r.prefix,
      scope: r.scope as ApiKeyScope,
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
