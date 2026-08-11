import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EntryStatusCounts,
  ProjectStatsView,
  UsageBucket,
  UsageView,
  WorkspaceStatsView,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, eq, isNull, sql } from 'drizzle-orm';
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

    const [reqRow, storageRow, limits] = await Promise.all([
      this.db.query.usageBuckets.findFirst({
        where: and(
          eq(usageBuckets.workspaceId, payload.workspaceId),
          eq(usageBuckets.periodStart, period.start),
        ),
        columns: { requestCount: true },
      }),
      this.storageSum(payload.workspaceId),
      this.entitlements.effectiveLimits(payload.workspaceId),
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

  /** Succeeded AI text generations this billing period — the `aiText.used` stat. */
  private async aiTextUsed(workspaceId: string): Promise<number> {
    return this.db.$count(
      aiGenerations,
      and(
        eq(aiGenerations.workspaceId, workspaceId),
        eq(aiGenerations.status, 'succeeded'),
        sql`${aiGenerations.createdAt} >= date_trunc('month', now())`,
      ),
    );
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

    const [entries, contentTypesCount, apiKeysCount, webhooksCount, media, aiTextCount] =
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
        this.aiTextUsed(ws),
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
      aiText: { used: aiTextCount, limit: limits?.aiTextRequestsPerMonth ?? null },
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

/** Current billing window: calendar month, UTC midnight boundaries. */
export function currentPeriod(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}
