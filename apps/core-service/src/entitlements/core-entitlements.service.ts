import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AUTH_PATTERNS,
  PlanLimits,
  SERVICE_TOKENS,
  WorkspaceEntitlements,
} from '@wriven/contracts';
import { DRIZZLE, DrizzleDB } from '@wriven/database';
import { and, eq, isNull } from 'drizzle-orm';
import { firstValueFrom, timeout } from 'rxjs';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';

const { contentEntries, contentTypes, apiKeys, webhooks } = schema;

const RESOLVE_TIMEOUT_MS = 2000;
const CACHE_TTL_MS = 30_000;

/**
 * Core-side plan enforcement. Limits live in auth-service (plans/subscriptions),
 * so we fetch them over TCP and count this service's own resources.
 *
 * Resilience: the limits fetch is timed out + cached (short TTL) and **fails
 * open** — if auth-service is unreachable and there's no cached value, the create
 * is allowed rather than blocked. Plan caps are soft; a limit-check outage must
 * not break content creation. Counts are point-in-time (no advisory lock).
 */
@Injectable()
export class CoreEntitlementsService {
  private readonly logger = new Logger(CoreEntitlementsService.name);
  private readonly cache = new Map<
    string,
    { limits: PlanLimits; expires: number }
  >();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  /** Effective limits, or `null` when they can't be resolved (→ skip enforcement). */
  private async limits(workspaceId: string): Promise<PlanLimits | null> {
    const cached = this.cache.get(workspaceId);
    if (cached && cached.expires > Date.now()) return cached.limits;

    try {
      const res = await firstValueFrom(
        this.auth
          .send<WorkspaceEntitlements>(AUTH_PATTERNS.ENTITLEMENTS_RESOLVE, {
            workspaceId,
          })
          .pipe(timeout(RESOLVE_TIMEOUT_MS)),
      );
      this.cache.set(workspaceId, {
        limits: res.limits,
        expires: Date.now() + CACHE_TTL_MS,
      });
      return res.limits;
    } catch (err) {
      // Fail open: prefer a stale cache, else skip enforcement for this write.
      this.logger.warn(
        `entitlements resolve failed for ${workspaceId}; ${cached ? 'using stale cache' : 'allowing write (fail-open)'}: ${String(err)}`,
      );
      return cached?.limits ?? null;
    }
  }

  async assertEntryQuota(workspaceId: string): Promise<void> {
    const max = (await this.limits(workspaceId))?.entries;
    if (max == null) return;
    const used = await this.db.$count(
      contentEntries,
      and(
        eq(contentEntries.workspaceId, workspaceId),
        isNull(contentEntries.deletedAt),
      ),
    );
    this.assert(used, max, 'entries');
  }

  async assertContentTypeQuota(workspaceId: string): Promise<void> {
    const max = (await this.limits(workspaceId))?.contentTypes;
    if (max == null) return;
    const used = await this.db.$count(
      contentTypes,
      and(
        eq(contentTypes.workspaceId, workspaceId),
        isNull(contentTypes.deletedAt),
      ),
    );
    this.assert(used, max, 'content types');
  }

  async assertApiKeyQuota(workspaceId: string): Promise<void> {
    const max = (await this.limits(workspaceId))?.apiKeys;
    if (max == null) return;
    const used = await this.db.$count(
      apiKeys,
      and(eq(apiKeys.workspaceId, workspaceId), isNull(apiKeys.revokedAt)),
    );
    this.assert(used, max, 'API keys');
  }

  async assertWebhookQuota(workspaceId: string): Promise<void> {
    const max = (await this.limits(workspaceId))?.webhooks;
    if (max == null) return;
    const used = await this.db.$count(
      webhooks,
      eq(webhooks.workspaceId, workspaceId),
    );
    this.assert(used, max, 'webhooks');
  }

  /** Storage cap in bytes for a workspace, or null if unlimited/unresolvable. */
  async storageLimitBytes(workspaceId: string): Promise<number | null> {
    const mb = (await this.limits(workspaceId))?.storageMb;
    return mb == null ? null : mb * 1024 * 1024;
  }

  private assert(used: number, max: number, label: string): void {
    if (used >= max) {
      throw rpcError(
        'PLAN_LIMIT_REACHED',
        `Your plan allows ${max} ${label}. Upgrade to add more.`,
      );
    }
  }
}
