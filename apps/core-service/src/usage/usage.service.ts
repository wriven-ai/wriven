import { Inject, Injectable, Logger } from '@nestjs/common';
import { UsageBucket, UsageView } from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, eq, isNull, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import { CoreEntitlementsService } from '../entitlements/core-entitlements.service';

const { usageBuckets, mediaAssets } = schema;

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
}

/** Current billing window: calendar month, UTC midnight boundaries. */
export function currentPeriod(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}
