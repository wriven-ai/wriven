import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from '@wriven/database';
import { and, eq, isNull, sql } from 'drizzle-orm';
import * as schema from '../db/schema';

const { contentEntries, mediaAssets } = schema;

export interface AdminContentMetrics {
  entries: number;
  published: number;
  mediaBytes: number;
}

@Injectable()
export class AdminMetricsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
  ) {}

  /** Core-side content + media totals. Merged with auth metrics at the gateway. */
  async content(): Promise<AdminContentMetrics> {
    const [entries, published, mediaSum] = await Promise.all([
      this.db.$count(contentEntries, isNull(contentEntries.deletedAt)),
      this.db.$count(
        contentEntries,
        and(
          eq(contentEntries.status, 'published'),
          isNull(contentEntries.deletedAt),
        ),
      ),
      this.db
        .select({
          total: sql<number>`coalesce(sum(${mediaAssets.sizeBytes}), 0)`,
        })
        .from(mediaAssets)
        .where(isNull(mediaAssets.deletedAt)),
    ]);

    return {
      entries,
      published,
      mediaBytes: Number(mediaSum[0]?.total ?? 0),
    };
  }
}
