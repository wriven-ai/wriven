import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AiUsageStats,
  EntryStatusCounts,
  ProjectStatsView,
  UsageBucket,
  UsageView,
  WorkspaceStatsView,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { currentPeriod } from '../common/period';
import * as schema from '../db/schema';
import { CoreEntitlementsService } from '../entitlements/core-entitlements.service';

const {
  usageBuckets,
  mediaAssets,
  contentEntries,
  contentTypes,
  apiKeys,
  webhooks,
  aiGenerations,
} = schema;

/**
 * Workspace usage metering. Owns the Delivery API request counter
 * (`usage_buckets`) and composes the current-period UsageView from it + the
 * live media SUM + effective plan limits. The gateway batches increments off
 * the hot path and flushes via `record()`. See specs/14.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly entitlements: CoreEntitlementsService,
  ) {}

  /**
   * Atomic batched increment. Each bucket is upserted with
   * `request_count + n` on the (workspace, period) conflict. A failed bucket
   * is logged + skipped so one bad entry can't drop the rest. `periodStart`
   * is tagged at bump-time (gateway) so a flush straddling a month boundary
   * still attributes to the right period.
   */
  async record(payload: { buckets: UsageBucket[] }): Promise<{ success: true }> {
    for (const b of payload.buckets) {
      try {
        await this.db
          .insert(usageBuckets)
          .values({
            workspaceId: b.workspaceId,
            periodStart: new Date(b.periodStart),
            periodEnd: new Date(b.periodEnd),
            requestCount: b.requestCount,
          })
          .onConflictDoUpdate({
            target: [usageBuckets.workspaceId, usageBuckets.periodStart],
            set: {
              requestCount: sql`${usageBuckets.requestCount} + ${b.requestCount}`,
            },
          });
      } catch (err) {
        this.logger.warn(
          `usage record failed for workspace ${b.workspaceId}: ${String(err)}`,
        );
      }
    }
    return { success: true };
  }

  /**
   * Current-period UsageView: request count this month + live storage sum +
   * effective limits. Storage is a point-in-time SUM (not metered over time);
   * request count is 0 if no bucket exists yet. Limits come from the cached
   * fail-open resolver (`null` = unlimited / unresolvable).
   */
  async read(payload: { workspaceId: string }): Promise<UsageView> {
    const period = currentPeriod();

    const [reqRow, storageRow, limits, aiStats] = await Promise.all([
      this.db.query.usageBuckets.findFirst({
        where: and(
          eq(usageBuckets.workspaceId, payload.workspaceId),
          eq(usageBuckets.periodStart, period.start),
        ),
        columns: { requestCount: true },
      }),
      this.storageSum(payload.workspaceId),
      this.entitlements.effectiveLimits(payload.workspaceId),
      this.aiUsage(payload.workspaceId),
    ]);

    return {
      period: {
        start: period.start.toISOString(),
        end: period.end.toISOString(),
      },
      requests: {
        used: reqRow?.requestCount ?? 0,
        limit: limits?.apiRequestsPerMonth ?? null,
      },
      storage: {
        usedMb: Math.round(storageRow / (1024 * 1024)),
        limitMb: limits?.storageMb ?? null,
      },
      ai: {
        ...aiStats,
        requests: {
          ...aiStats.requests,
          limit: limits?.aiTextRequestsPerMonth ?? null,
        },
      },
    };
  }

  /** Sum of stored bytes for a workspace's live (non-deleted) media. */
  private async storageSum(workspaceId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<string>`coalesce(sum(${mediaAssets.sizeBytes}), 0)` })
      .from(mediaAssets)
      .where(
        and(eq(mediaAssets.workspaceId, workspaceId), isNull(mediaAssets.deletedAt)),
      );
    return Number(row?.total ?? 0);
  }

  /**
   * AI usage for the current period in one pass. `requests.used` counts
   * `succeeded` only (the billed unit); tokens and cost sum `succeeded` AND
   * `failed`, because a failed provider call still burned tokens. A generation
   * with an unknown price (null cost) is counted so the caller can flag the
   * period's dollar total as incomplete. `requests.limit` is filled by the
   * caller from the resolved plan. See specs/21.
   */
  private async aiUsage(workspaceId: string): Promise<AiUsageStats> {
    const done = sql`${aiGenerations.status} in ('succeeded','failed')`;
    // A row only counts as "unpriced" when the provider was actually called
    // (total_tokens is not null) but its model had no known price. A failed row
    // that never reached the provider (e.g. AI_INPUT_TOO_LARGE) has null tokens
    // and null cost — it must NOT poison the period's `cost.complete` flag.
    const reachedProvider = sql`${aiGenerations.totalTokens} is not null`;
    const [row] = await this.db
      .select({
        used: sql<number>`count(*) filter (where ${aiGenerations.status} = 'succeeded')::int`,
        prompt: sql<number>`coalesce(sum(${aiGenerations.promptTokens}) filter (where ${done}), 0)::bigint`,
        completion: sql<number>`coalesce(sum(${aiGenerations.completionTokens}) filter (where ${done}), 0)::bigint`,
        total: sql<number>`coalesce(sum(${aiGenerations.totalTokens}) filter (where ${done}), 0)::bigint`,
        cost: sql<number>`coalesce(sum(${aiGenerations.costMicrousd}) filter (where ${done}), 0)::bigint`,
        unpriced: sql<number>`count(*) filter (where ${aiGenerations.costMicrousd} is null and ${reachedProvider} and ${done})::int`,
      })
      .from(aiGenerations)
      .where(
        and(
          eq(aiGenerations.workspaceId, workspaceId),
          // Shared UTC boundary — must match the AI quota reserve exactly.
          gte(aiGenerations.createdAt, currentPeriod().start),
        ),
      );
    const unpriced = Number(row?.unpriced ?? 0);
    return {
      requests: { used: Number(row?.used ?? 0), limit: null },
      tokens: {
        prompt: Number(row?.prompt ?? 0),
        completion: Number(row?.completion ?? 0),
        total: Number(row?.total ?? 0),
      },
      cost: {
        microusd: Number(row?.cost ?? 0),
        complete: unpriced === 0,
        unpricedGenerations: unpriced,
      },
    };
  }

  /**
   * Workspace aggregate stats. Reuses `read()` for requests/storage/period and
   * adds content/media/key/webhook counts. `projects`/`members` are auth-owned
   * → returned as 0 here; the gateway overwrites them from auth-service's
   * `auth.workspace.stats` response. Unmetered dimensions (bandwidth, AI text,
   * AI image) ship `used: null` with their plan limit. See specs/17.
   */
  async workspaceStats(payload: {
    workspaceId: string;
  }): Promise<WorkspaceStatsView> {
    const ws = payload.workspaceId;
    const usage = await this.read({ workspaceId: ws });
    const limits = await this.entitlements.effectiveLimits(ws);

    const [entries, contentTypesCount, apiKeysCount, webhooksCount, media] =
      await Promise.all([
        this.entryCounts({ workspaceId: ws }),
        this.db.$count(
          contentTypes,
          and(eq(contentTypes.workspaceId, ws), isNull(contentTypes.deletedAt)),
        ),
        this.db.$count(
          apiKeys,
          and(eq(apiKeys.workspaceId, ws), isNull(apiKeys.revokedAt)),
        ),
        this.db.$count(webhooks, eq(webhooks.workspaceId, ws)),
        this.mediaAggregate({ workspaceId: ws }),
      ]);

    return {
      projects: 0, // merged by the gateway from auth-service
      members: 0, // merged by the gateway from auth-service
      entries,
      contentTypes: contentTypesCount,
      apiKeys: apiKeysCount,
      webhooks: webhooksCount,
      media: {
        count: media.count,
        usedMb: Math.round(media.bytes / (1024 * 1024)),
        limitMb: limits?.storageMb ?? null,
      },
      apiRequests: usage.requests,
      period: usage.period,
      bandwidthGb: { usedGb: null, limitGb: limits?.assetBandwidthGb ?? null },
      // Full AI usage (requests + tokens + known cost) — reuses read()'s `ai`.
      aiText: usage.ai,
      aiImage: { used: null, limit: limits?.aiImageRequestsPerMonth ?? null },
    };
  }

  /**
   * Project-scoped aggregate (core-only). No requests/bandwidth/AI — those are
   * workspace-billing-unit dimensions, not project-scoped. See specs/17.
   */
  async projectStats(payload: {
    projectId: string;
  }): Promise<ProjectStatsView> {
    const pid = payload.projectId;

    const [entries, contentTypesCount, apiKeysCount, webhooksCount, media] =
      await Promise.all([
        this.entryCounts({ projectId: pid }),
        this.db.$count(
          contentTypes,
          and(eq(contentTypes.projectId, pid), isNull(contentTypes.deletedAt)),
        ),
        this.db.$count(
          apiKeys,
          and(eq(apiKeys.projectId, pid), isNull(apiKeys.revokedAt)),
        ),
        this.db.$count(webhooks, eq(webhooks.projectId, pid)),
        this.mediaAggregate({ projectId: pid }),
      ]);

    return {
      entries,
      contentTypes: contentTypesCount,
      apiKeys: apiKeysCount,
      webhooks: webhooksCount,
      media: {
        count: media.count,
        usedMb: Math.round(media.bytes / (1024 * 1024)),
      },
    };
  }

  /**
   * Non-deleted entry counts grouped by status. `total` = sum of the split
   * (the `status` check constraint guarantees only draft|published|archived, so
   * the two reconcile). Scoped by workspace and/or project.
   */
  private async entryCounts(opts: {
    workspaceId?: string;
    projectId?: string;
  }): Promise<EntryStatusCounts> {
    const conds = [isNull(contentEntries.deletedAt)];
    if (opts.workspaceId)
      conds.push(eq(contentEntries.workspaceId, opts.workspaceId));
    if (opts.projectId)
      conds.push(eq(contentEntries.projectId, opts.projectId));

    const rows = await this.db
      .select({ status: contentEntries.status, n: sql<number>`count(*)::int` })
      .from(contentEntries)
      .where(and(...conds))
      .groupBy(contentEntries.status);

    const by: Record<string, number> = {};
    for (const r of rows) by[r.status] = Number(r.n);
    const published = by['published'] ?? 0;
    const draft = by['draft'] ?? 0;
    const archived = by['archived'] ?? 0;
    return { total: published + draft + archived, published, draft, archived };
  }

  /** Count + byte sum of live (non-deleted) media, scoped by workspace/project. */
  private async mediaAggregate(opts: {
    workspaceId?: string;
    projectId?: string;
  }): Promise<{ count: number; bytes: number }> {
    const conds = [isNull(mediaAssets.deletedAt)];
    if (opts.workspaceId)
      conds.push(eq(mediaAssets.workspaceId, opts.workspaceId));
    if (opts.projectId) conds.push(eq(mediaAssets.projectId, opts.projectId));

    const [row] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        bytes: sql<string>`coalesce(sum(${mediaAssets.sizeBytes}), 0)`,
      })
      .from(mediaAssets)
      .where(and(...conds));

    return { count: Number(row?.count ?? 0), bytes: Number(row?.bytes ?? 0) };
  }
}

/**
 * Current billing window: calendar month, UTC midnight boundaries.
 *
 * Re-exported from `common/period` so existing importers keep working while the
 * single definition lives next to the other shared helpers — AI quota, `/usage`,
 * and stats must all agree on the boundary.
 */
export { currentPeriod };
