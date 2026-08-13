/**
 * Workspace + project aggregate stats — read-only dashboard counts composed
 * from existing tables (no metering of its own; requests/storage come from the
 * usage module, specs/14). See specs/17.
 *
 * Bandwidth and AI image remain forward-compatible `used: null` fields until
 * their metering lands. AI text is now fully metered (specs/21): it reports
 * requests, tokens, and known cost via {@link AiUsageStats}.
 */

import type { AiUsageStats } from './usage.types';

/** Entry counts split by status. `total` is non-deleted; the split reconciles. */
export interface EntryStatusCounts {
  total: number;
  published: number;
  draft: number;
  archived: number;
}

/**
 * Workspace-level aggregate. Tenancy counts (projects, members) come from
 * auth-service; everything else from core-service. The gateway merges the two.
 */
export interface WorkspaceStatsView {
  // tenancy (auth-service)
  projects: number;
  members: number;
  // content + assets (core-service; all exclude soft-deleted / revoked)
  entries: EntryStatusCounts;
  contentTypes: number;
  apiKeys: number;
  webhooks: number;
  media: { count: number; usedMb: number; limitMb: number | null };
  // metered usage (core; reuses UsageService.read — specs/14)
  apiRequests: { used: number; limit: number | null };
  period: { start: string; end: string }; // current calendar month (UTC)
  // forward-compatible — unmetered today; `used` null until metering lands
  bandwidthGb: { usedGb: null; limitGb: number | null };
  // AI text is metered (specs/21): requests + tokens + known cost.
  aiText: AiUsageStats;
  aiImage: { used: null; limit: number | null };
}

/**
 * Project-scoped aggregate (core-service only). No requests/bandwidth/AI —
 * those are workspace-billing-unit dimensions, not project-scoped.
 */
export interface ProjectStatsView {
  entries: EntryStatusCounts;
  contentTypes: number;
  apiKeys: number; // active (not revoked), this project
  webhooks: number; // this project
  media: { count: number; usedMb: number };
}
