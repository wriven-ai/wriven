import {
  DOWNGRADE_DIMENSIONS,
  ERROR_CODES,
  type DowngradeBlock,
  type DowngradeDimension,
  type PlanLimits,
  type ServiceError,
  type WorkspaceStatsView,
} from '@wriven/contracts';

/**
 * Pure downgrade compatibility check. Returns the stock-resource dimensions
 * whose current usage exceeds the target plan's limit (each entry carries used
 * vs limit). Empty array = the downgrade is allowed.
 *
 * `null`/absent limit on a dimension = unlimited → never blocks. Flow
 * dimensions (API requests, bandwidth, AI) are excluded by
 * {@link DOWNGRADE_DIMENSIONS}. See specs/18.
 *
 * Mirrored in the client for the eager blocked-preview
 * (`apps/client/src/lib/downgrade.ts`) — keep the two in sync.
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

/** Resolve the current usage count for a dimension from the stats view. */
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

/**
 * Build the `DOWNGRADE_BLOCKED` {@link ServiceError} (with `details`) thrown by
 * the gateway guard. The exception filter returns a `ServiceError` as-is, so the
 * `details` array survives into the `{ success:false, error }` envelope and
 * reaches the client for the blocked-downgrade dialog.
 */
export function downgradeBlockedError(blocks: DowngradeBlock[]): ServiceError {
  const { code, statusCode } = ERROR_CODES.DOWNGRADE_BLOCKED;
  return {
    code,
    statusCode,
    message:
      'This workspace has more resources than the target plan allows. Remove the excess before downgrading.',
    details: blocks,
  };
}
