import { Inject, Injectable } from '@nestjs/common';
import { PlanLimits, WorkspaceEntitlements } from '@wriven/contracts';
import { DRIZZLE, DrizzleDB } from '@wriven/database';
import { and, eq, isNull } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';

const { plans, subscriptions, projects, workspaceMembers } = schema;

/**
 * Resolves a workspace's effective plan limits (plan + per-subscription overrides)
 * and enforces them on tenant write paths. Workspaces with no subscription default
 * to the `free` plan.
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

    let planKey = sub?.plan?.key ?? 'free';
    let baseLimits = (sub?.plan?.limits ?? null) as PlanLimits | null;
    if (!baseLimits) {
      const free = await this.db.query.plans.findFirst({
        where: eq(plans.key, 'free'),
        columns: { key: true, limits: true },
      });
      planKey = free?.key ?? 'free';
      baseLimits = (free?.limits ?? {}) as PlanLimits;
    }
    const overrides = (sub?.overrides ?? {}) as Partial<PlanLimits>;
    return { planKey, limits: { ...baseLimits, ...overrides } };
  }

  async usage(
    workspaceId: string,
  ): Promise<{ projects: number; members: number }> {
    const [projectCount, memberCount] = await Promise.all([
      this.db.$count(
        projects,
        and(
          eq(projects.workspaceId, workspaceId),
          isNull(projects.deletedAt),
        ),
      ),
      this.db.$count(workspaceMembers, eq(workspaceMembers.workspaceId, workspaceId)),
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

  /** Throw PLAN_LIMIT_REACHED if adding a project would exceed the plan. */
  async assertProjectQuota(workspaceId: string): Promise<void> {
    const { limits } = await this.resolveLimits(workspaceId);
    const max = limits.projects;
    if (max == null) return; // unlimited
    const used = await this.db.$count(
      projects,
      and(eq(projects.workspaceId, workspaceId), isNull(projects.deletedAt)),
    );
    if (used >= max) {
      throw rpcError(
        'PLAN_LIMIT_REACHED',
        `Your plan allows ${max} project${max === 1 ? '' : 's'}. Upgrade to add more.`,
      );
    }
  }

  /** Throw PLAN_LIMIT_REACHED if adding a member would exceed the plan. */
  async assertMemberQuota(workspaceId: string): Promise<void> {
    const { limits } = await this.resolveLimits(workspaceId);
    const max = limits.members;
    if (max == null) return;
    const used = await this.db.$count(
      workspaceMembers,
      eq(workspaceMembers.workspaceId, workspaceId),
    );
    if (used >= max) {
      throw rpcError(
        'PLAN_LIMIT_REACHED',
        `Your plan allows ${max} member${max === 1 ? '' : 's'}. Upgrade to add more.`,
      );
    }
  }
}
