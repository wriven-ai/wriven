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

const RESOLVE_TIMEOUT_MS = 4000;
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
    // Only active webhooks consume a slot — a disabled one is free to keep.
    const used = await this.db.$count(
      webhooks,
      and(eq(webhooks.workspaceId, workspaceId), eq(webhooks.active, true)),
    );
    this.assert(used, max, 'webhooks');
  }

  /** Storage cap in bytes for a workspace, or null if unlimited/unresolvable. */
  async storageLimitBytes(workspaceId: string): Promise<number | null> {
    const mb = (await this.limits(workspaceId))?.storageMb;
    return mb == null ? null : mb * 1024 * 1024;
  }

  /**
   * Effective plan limits for a workspace, or `null` when unresolvable (auth
   * unreachable, no cache → fail open). Thin public accessor over the cached
   * resolver so usage display reuses the same fail-open path as enforcement
   * (specs/14). Does not alter cache/TTL/fail-open behavior.
   */
  async effectiveLimits(workspaceId: string): Promise<PlanLimits | null> {
    return this.limits(workspaceId);
  }

  /**
   * Revisions retained per entry (oldest pruned beyond this), or `null` =
   * unlimited / unresolvable (skip pruning). Fail-open like the rest. specs/15.
   */
  async revisionsCap(workspaceId: string): Promise<number | null> {
    const cap = (await this.limits(workspaceId))?.revisionsPerEntry;
    return cap == null ? null : cap;
  }

  /**
   * AI text-generation requests allowed per month, or `null` = unlimited /
   * unresolvable (fail-open). Enforcement (count vs `ai_generations`) lives in
   * `AiService` inside an atomic advisory-lock transaction so concurrent
   * requests can't both pass.
   */
  async aiTextLimit(workspaceId: string): Promise<number | null> {
    const limit = (await this.limits(workspaceId))?.aiTextRequestsPerMonth;
    return limit == null ? null : limit;
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
