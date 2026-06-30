import { Inject, Injectable } from '@nestjs/common';
import {
  AssignPlanDto,
  CreatePlanDto,
  PlanFeatures,
  PlanLimits,
  PlanView,
  UpdatePlanDto,
} from '@wriven/contracts';
import { DRIZZLE, DrizzleDB } from '@wriven/database';
import { asc, eq } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';

const { plans, subscriptions, workspaces } = schema;
type PlanRow = typeof plans.$inferSelect;

@Injectable()
export class AdminPlansService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
  ) {}

  async list(): Promise<PlanView[]> {
    const rows = await this.db.query.plans.findMany({
      orderBy: asc(plans.sortOrder),
    });
    return rows.map((p) => this.toView(p));
  }

  async create(dto: CreatePlanDto): Promise<PlanView> {
    const existing = await this.db.query.plans.findFirst({
      where: eq(plans.key, dto.key),
      columns: { id: true },
    });
    if (existing) {
      throw rpcError('CONFLICT', 'A plan with that key already exists.');
    }
    const [plan] = await this.db
      .insert(plans)
      .values({
        key: dto.key,
        name: dto.name,
        description: dto.description ?? null,
        priceMonthly: dto.priceMonthly ?? null,
        priceYearly: dto.priceYearly ?? null,
        limits: dto.limits ?? {},
        features: dto.features ?? {},
      })
      .returning();
    return this.toView(plan);
  }

  async update(payload: { id: string; dto: UpdatePlanDto }): Promise<PlanView> {
    const patch: Partial<typeof plans.$inferInsert> = {};
    const d = payload.dto;
    if (d.name !== undefined) patch.name = d.name;
    if (d.description !== undefined) patch.description = d.description;
    if (d.priceMonthly !== undefined) patch.priceMonthly = d.priceMonthly;
    if (d.priceYearly !== undefined) patch.priceYearly = d.priceYearly;
    if (d.active !== undefined) patch.active = d.active;
    if (d.limits !== undefined) patch.limits = d.limits;
    if (d.features !== undefined) patch.features = d.features;

    const [plan] = await this.db
      .update(plans)
      .set(patch)
      .where(eq(plans.id, payload.id))
      .returning();
    if (!plan) throw rpcError('NOT_FOUND', 'Plan not found.');
    return this.toView(plan);
  }

  /** Assign a plan to a workspace (admin). Upserts the subscription row. */
  async assign(payload: {
    workspaceId: string;
    dto: AssignPlanDto;
    adminUserId: string;
  }): Promise<{ success: true; planKey: string; status: string }> {
    const plan = await this.db.query.plans.findFirst({
      where: eq(plans.key, payload.dto.planKey),
      columns: { id: true, key: true },
    });
    if (!plan) throw rpcError('NOT_FOUND', 'Plan not found.');

    const ws = await this.db.query.workspaces.findFirst({
      where: eq(workspaces.id, payload.workspaceId),
      columns: { id: true },
    });
    if (!ws) throw rpcError('NOT_FOUND', 'Workspace not found.');

    const status = payload.dto.status ?? 'active';
    // Atomic upsert on the unique workspace_id — race-safe.
    await this.db
      .insert(subscriptions)
      .values({
        workspaceId: payload.workspaceId,
        planId: plan.id,
        status,
        overrides: payload.dto.overrides ?? null,
        updatedBy: payload.adminUserId,
      })
      .onConflictDoUpdate({
        target: subscriptions.workspaceId,
        set: {
          planId: plan.id,
          status,
          overrides: payload.dto.overrides ?? null,
          updatedBy: payload.adminUserId,
        },
      });
    return { success: true, planKey: plan.key, status };
  }

  private toView(p: PlanRow): PlanView {
    return {
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
      sortOrder: p.sortOrder,
      isPublic: p.isPublic,
      active: p.active,
      priceMonthly: p.priceMonthly,
      priceYearly: p.priceYearly,
      currency: p.currency,
      trialDays: p.trialDays,
      limits: (p.limits ?? {}) as PlanLimits,
      features: (p.features ?? {}) as PlanFeatures,
    };
  }
}
