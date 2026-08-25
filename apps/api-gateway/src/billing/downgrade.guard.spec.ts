import {
  DOWNGRADE_DIMENSIONS,
  ERROR_CODES,
  type PlanLimits,
  type WorkspaceStatsView,
} from '@wriven/contracts';
import { computeDowngradeBlocks, downgradeBlockedError } from './downgrade.guard';

function stats(overrides: Record<string, unknown> = {}): WorkspaceStatsView {
  return {
    projects: 3,
    members: 2,
    entries: { total: 10, published: 8, draft: 2 },
    contentTypes: 4,
    apiKeys: 1,
    webhooks: 2,
    media: { count: 5, usedMb: 120, limitMb: null },
    apiRequests: { used: 50, limit: null },
    period: { start: '2026-01-01T00:00:00.000Z', end: '2026-02-01T00:00:00.000Z' },
    bandwidthGb: { usedGb: null, limitGb: null },
    ...overrides,
  } as WorkspaceStatsView;
}

describe('computeDowngradeBlocks', () => {
  it('empty limits (free-tier target) → all unlimited, no blocks', () => {
    expect(computeDowngradeBlocks(stats(), {})).toEqual([]);
  });

  it('null limit = unlimited → never blocks even when usage is high', () => {
    const limits: PlanLimits = { projects: null } as PlanLimits;
    expect(computeDowngradeBlocks(stats({ projects: 99 }), limits)).toEqual([]);
  });

  it('used strictly above the limit blocks; exactly at the limit does not', () => {
    const limits: PlanLimits = { projects: 3, members: 2 } as PlanLimits;
    const blocks = computeDowngradeBlocks(stats(), limits);
    // projects 3 ≤ 3 and members 2 ≤ 2 — both fine.
    expect(blocks).toEqual([]);

    const tighter: PlanLimits = { projects: 2 } as PlanLimits;
    expect(computeDowngradeBlocks(stats(), tighter)).toEqual([
      { dimension: 'projects', label: 'Projects', used: 3, limit: 2 },
    ]);
  });

  it('reads entries from entries.total and storage from media.usedMb', () => {
    const blocks = computeDowngradeBlocks(
      stats({ entries: { total: 40, published: 30, draft: 10 }, media: { count: 1, usedMb: 500, limitMb: null } }),
      { entries: 30, storageMb: 400 } as PlanLimits,
    );
    expect(blocks).toEqual([
      { dimension: 'entries', label: 'Entries', used: 40, limit: 30 },
      { dimension: 'storageMb', label: 'Storage (MB)', used: 500, limit: 400 },
    ]);
  });

  it('blocks preserve the DOWNGRADE_DIMENSIONS display order', () => {
    const limits = {
      projects: 1,
      members: 1,
      contentTypes: 1,
      entries: 1,
      apiKeys: 1,
      webhooks: 1,
      storageMb: 1,
    } as PlanLimits;
    const dims = computeDowngradeBlocks(stats({ apiKeys: 2 }), limits).map(
      (b) => b.dimension,
    );
    expect(dims).toEqual(DOWNGRADE_DIMENSIONS.map((d) => d.dimension));
  });
});

describe('downgradeBlockedError', () => {
  it('builds DOWNGRADE_BLOCKED with the blocks in details', () => {
    const error = downgradeBlockedError([
      { dimension: 'projects', label: 'Projects', used: 5, limit: 2 },
    ]);
    expect(error.code).toBe(ERROR_CODES.DOWNGRADE_BLOCKED.code);
    expect(error.statusCode).toBe(ERROR_CODES.DOWNGRADE_BLOCKED.statusCode);
    expect(error.details).toHaveLength(1);
  });
});
