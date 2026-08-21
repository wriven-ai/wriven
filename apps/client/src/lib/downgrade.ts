import type {
  DowngradeBlock,
  DowngradeDimension,
  PlanLimits,
  WorkspaceStatsView,
} from './types';

/**
 * Stock resource dimensions checked before a downgrade, in display order.
 * Mirrors `DOWNGRADE_DIMENSIONS` in `libs/shared/contracts/src/lib/types/billing.types.ts`
 * — the client can't import the contracts bundle, so the tiny table is
 * duplicated here. Keep the two in sync. `limitKey` is the matching `PlanLimits`
 * field; `null`/absent there = unlimited → never blocks.
 */
const DOWNGRADE_DIMENSIONS: readonly {
  dimension: DowngradeDimension;
  label: string;
  limitKey: keyof PlanLimits;
}[] = [
  { dimension: 'projects', label: 'Projects', limitKey: 'projects' },
  { dimension: 'members', label: 'Members', limitKey: 'members' },
  { dimension: 'contentTypes', label: 'Content types', limitKey: 'contentTypes' },
  { dimension: 'entries', label: 'Entries', limitKey: 'entries' },
  { dimension: 'apiKeys', label: 'API keys', limitKey: 'apiKeys' },
  { dimension: 'webhooks', label: 'Webhooks', limitKey: 'webhooks' },
  { dimension: 'storageMb', label: 'Storage (MB)', limitKey: 'storageMb' },
];

/**
 * Returns the stock-resource dimensions whose current usage exceeds the target
 * plan's limit. Empty array = the downgrade is allowed. Client-side mirror of
 * the gateway guard (`apps/api-gateway/src/billing/downgrade.guard.ts`) used for
 * the eager blocked-preview on the billing page — the gateway check stays
 * authoritative (handles races / direct API / stats-not-loaded-yet).
 */
export function computeDowngradeBlocks(
  stats: WorkspaceStatsView,
  targetLimits: PlanLimits,
): DowngradeBlock[] {
  const blocks: DowngradeBlock[] = [];
  for (const meta of DOWNGRADE_DIMENSIONS) {
    const limit = targetLimits[meta.limitKey];
    if (limit == null) continue; // unlimited
    const used = usedFor(stats, meta.dimension);
    if (used > limit) {
      blocks.push({ dimension: meta.dimension, label: meta.label, used, limit });
    }
  }
  return blocks;
}

function usedFor(
  stats: WorkspaceStatsView,
  dimension: DowngradeDimension,
): number {
  switch (dimension) {
    case 'projects':
      return stats.projects;
    case 'members':
      return stats.members;
    case 'contentTypes':
      return stats.contentTypes;
    case 'entries':
      return stats.entries.total;
    case 'apiKeys':
      return stats.apiKeys;
    case 'webhooks':
      return stats.webhooks;
    case 'storageMb':
      return stats.media.usedMb;
  }
}
