import { Inject, Injectable } from '@nestjs/common';
import { PlanLimits, WorkspaceEntitlements } from '@wriven/contracts';
import { DRIZZLE, DrizzleDB } from '@wriven/database';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';

const { plans, subscriptions, projects, workspaceMembers } = schema;

/**
 * Fail-closed default limits used when no plan/subscription resolves (e.g. the
 * `free` plan has not been seeded yet). Never leave a workspace effectively
 * unlimited just because seed data is missing.
 */
const FREE_FALLBACK: PlanLimits = {
  projects: 2,
  members: 3,
  environments: 1,
  contentTypes: 10,
  entries: 1000,
  locales: 1,
  storageMb: 100,
  assetBandwidthGb: 10,
  apiRequestsPerMonth: 100_000,
  apiKeys: 3,
  webhooks: 2,
};

/**
 * Resolves a workspace's effective plan limits (plan + per-subscription overrides)
 * for enforcement. Enforcement itself happens inside the create transaction of the
 * owning service (advisory-locked) to avoid TOCTOU races.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
  ) {}

  /** Effective limits = plan.limits with the subscription's overrides applied. */
  async resolveLimits(
    workspaceId: string,
  ): Promise<{ planKey: string; limits: PlanLimits }> {
    const sub = await this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.workspaceId, workspaceId),
      with: { plan: { columns: { key: true, limits: true } } },
    });

    let planKey = sub?.plan?.key;
    let baseLimits = (sub?.plan?.limits ?? null) as PlanLimits | null;
    if (!baseLimits || Object.keys(baseLimits).length === 0) {
      const free = await this.db.query.plans.findFirst({
        where: eq(plans.key, 'free'),
        columns: { key: true, limits: true },
      });
      const freeLimits = (free?.limits ?? null) as PlanLimits | null;
      // Fail closed: fall back to baked-in free limits if seed is missing.
      planKey = free?.key ?? 'free';
      baseLimits =
        freeLimits && Object.keys(freeLimits).length > 0
          ? freeLimits
          : FREE_FALLBACK;
    }
    const overrides = (sub?.overrides ?? {}) as Partial<PlanLimits>;
    return { planKey: planKey ?? 'free', limits: { ...baseLimits, ...overrides } };
  }

  async usage(
    workspaceId: string,
  ): Promise<{ projects: number; members: number }> {
    const [projectCount, memberCount] = await Promise.all([
      this.db.$count(
        projects,
        and(eq(projects.workspaceId, workspaceId), isNull(projects.deletedAt)),
      ),
      this.db.$count(
        workspaceMembers,
        eq(workspaceMembers.workspaceId, workspaceId),
      ),
    ]);
    return { projects: projectCount, members: memberCount };
  }

  /** Full entitlements snapshot — limits + usage (consumed by core later too). */
  async resolve(payload: {
    workspaceId: string;
  }): Promise<WorkspaceEntitlements> {
    const [{ planKey, limits }, usage] = await Promise.all([
      this.resolveLimits(payload.workspaceId),
      this.usage(payload.workspaceId),
    ]);
    return { planKey, limits, usage };
  }
}
