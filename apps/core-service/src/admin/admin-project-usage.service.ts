import { Inject, Injectable } from '@nestjs/common';
import { AdminProjectUsage } from '@wriven/contracts';
import { DRIZZLE, type DrizzleDB } from '@wriven/database';
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import * as schema from '../db/schema';

const { contentTypes, contentEntries, mediaAssets, apiKeys, webhooks, aiGenerations } = schema;

@Injectable()
export class AdminProjectUsageService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
  ) {}

  /** Per-project counts + storage + AI metering for the admin Project detail screen. */
  async get(payload: { projectId: string }): Promise<AdminProjectUsage> {
    const { projectId } = payload;
    // Soft-delete applies to content types, entries, media. Keys use revokedAt;
    // webhooks have no deletion — only active.
    const byProject = <T extends { projectId: unknown }>(t: T) =>
      eq(t.projectId as never, projectId);

    const [
      typeCount,
      entryTotal,
      entryPublished,
      entryDraft,
      entryArchived,
      mediaAgg,
      keyTotal,
      keyActive,
      hookTotal,
      hookActive,
      aiAgg,
      aiSucceeded,
      aiFailed,
    ] = await Promise.all([
      this.db.$count(
        contentTypes,
        and(byProject(contentTypes), isNull(contentTypes.deletedAt)),
      ),
      this.db.$count(
        contentEntries,
        and(byProject(contentEntries), isNull(contentEntries.deletedAt)),
      ),
      this.db.$count(
        contentEntries,
        and(
          byProject(contentEntries),
          isNull(contentEntries.deletedAt),
          eq(contentEntries.status, 'published'),
        ),
      ),
      this.db.$count(
        contentEntries,
        and(
          byProject(contentEntries),
          isNull(contentEntries.deletedAt),
          eq(contentEntries.status, 'draft'),
        ),
      ),
      this.db.$count(
        contentEntries,
        and(
          byProject(contentEntries),
          isNull(contentEntries.deletedAt),
          eq(contentEntries.status, 'archived'),
        ),
      ),
      this.db
        .select({
          assets: count(),
          bytes: sql<number>`coalesce(sum(${mediaAssets.sizeBytes}), 0)`,
        })
        .from(mediaAssets)
        .where(and(byProject(mediaAssets), isNull(mediaAssets.deletedAt))),
      this.db.$count(apiKeys, byProject(apiKeys)),
      this.db.$count(
        apiKeys,
        and(byProject(apiKeys), isNull(apiKeys.revokedAt)),
      ),
      this.db.$count(webhooks, byProject(webhooks)),
      this.db.$count(
        webhooks,
        and(byProject(webhooks), eq(webhooks.active, true)),
      ),
      this.db
        .select({
          generations: count(),
          tokens: sql<number>`coalesce(sum(${aiGenerations.totalTokens}), 0)`,
          cost: sql<number | null>`sum(${aiGenerations.costMicrousd})`,
        })
        .from(aiGenerations)
        .where(byProject(aiGenerations)),
      this.db.$count(
        aiGenerations,
        and(byProject(aiGenerations), eq(aiGenerations.status, 'succeeded')),
      ),
      this.db.$count(
        aiGenerations,
        and(byProject(aiGenerations), eq(aiGenerations.status, 'failed')),
      ),
    ]);

    return {
      projectId,
      contentTypes: typeCount,
      entries: {
        total: entryTotal,
        published: entryPublished,
        draft: entryDraft,
        archived: entryArchived,
      },
      media: {
        assetCount: Number(mediaAgg[0]?.assets ?? 0),
        totalBytes: Number(mediaAgg[0]?.bytes ?? 0),
      },
      apiKeys: { total: keyTotal, active: keyActive },
      webhooks: { total: hookTotal, active: hookActive },
      ai: {
        generations: Number(aiAgg[0]?.generations ?? 0),
        succeeded: aiSucceeded,
        failed: aiFailed,
        totalTokens: Number(aiAgg[0]?.tokens ?? 0),
        costMicrousd: aiAgg[0]?.cost != null ? Number(aiAgg[0].cost) : null,
      },
    };
  }
}
