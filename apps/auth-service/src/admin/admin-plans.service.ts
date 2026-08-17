import { Inject, Injectable } from '@nestjs/common';
import {
  AdminPlanView,
  AssignPlanDto,
  CreatePlanDto,
  PlanFeatures,
  PlanLimits,
  UpdatePlanDto,
} from '@wriven/contracts';
import { DRIZZLE, type DrizzleDB } from '@wriven/database';
import { asc, eq, max } from 'drizzle-orm';
import type Stripe from 'stripe';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';
import { STRIPE_CLIENT } from '../billing/stripe-client.provider';

const { plans, subscriptions, workspaces } = schema;
type PlanRow = typeof plans.$inferSelect;

@Injectable()
export class AdminPlansService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
  ) {}

  async list(): Promise<AdminPlanView[]> {
    const rows = await this.db.query.plans.findMany({
      orderBy: asc(plans.sortOrder),
    });
    return rows.map((p) => this.toAdminView(p));
  }

  async create(dto: CreatePlanDto): Promise<AdminPlanView> {
    // Dollars → integer cents, exactly once, HERE. Not in the DTO: both the
    // gateway (HTTP) and this service (TCP) validate CreatePlanDto with
    // transform pipes, so a @Transform there would convert twice.
    const monthlyCents =
      dto.priceMonthly != null ? Math.round(dto.priceMonthly * 100) : null;
    const yearlyCentsInput =
      dto.priceYearly != null ? Math.round(dto.priceYearly * 100) : null;

    const existing = await this.db.query.plans.findFirst({
      where: eq(plans.key, dto.key),
      columns: { id: true },
    });
    if (existing) {
      throw rpcError('CONFLICT', 'A plan with that key already exists.');
    }
    // A paid plan must carry at least one price — otherwise it'd create a Stripe
    // Product with no Prices (unpurchasable + orphaned). Free plan has no price.
    if (
      dto.key !== 'free' &&
      monthlyCents == null &&
      yearlyCentsInput == null &&
      dto.yearlyDiscountPercent == null
    ) {
      throw rpcError(
        'VALIDATION_ERROR',
        'A paid plan needs at least one price (priceMonthly or priceYearly).',
      );
    }
    // Discount path: percent drives the yearly price — monthly is the base and
    // an explicit yearly price would conflict with the computed one.
    if (dto.yearlyDiscountPercent != null) {
      if (monthlyCents == null) {
        throw rpcError(
          'VALIDATION_ERROR',
          'A yearly discount requires a monthly price to discount from.',
        );
      }
      if (dto.priceYearly != null) {
        throw rpcError(
          'VALIDATION_ERROR',
          'Send either priceYearly or yearlyDiscountPercent, not both — the yearly price is computed from the discount.',
        );
      }
    }

    // Server-authoritative yearly computation: Stripe gets the FINAL cents;
    // the DB keeps the breakdown (percent + cents saved).
    let priceYearly = yearlyCentsInput;
    let yearlyDiscountAmount: number | null = null;
    if (dto.yearlyDiscountPercent != null && monthlyCents != null) {
      const fullYear = monthlyCents * 12;
      priceYearly = Math.round(
        fullYear * (1 - dto.yearlyDiscountPercent / 100),
      );
      yearlyDiscountAmount = fullYear - priceYearly;
    }

    // Tier rank: explicit wins, else append above the current highest tier so
    // a new plan can never silently land at 0 (= free tier, breaks upgrade/
    // downgrade math everywhere sortOrder is compared).
    const sortOrder =
      dto.sortOrder ??
      ((await this.db
        .select({ max: max(plans.sortOrder) })
        .from(plans))[0]?.max ?? -1) + 1;

    // Stripe-first for paid plans: create Product + Prices, capture ids, THEN
    // insert the row — so a Stripe failure can't leave a half-linked plan.
    // Free plan never touches Stripe.
    let stripeIds = {
      productId: null as string | null,
      monthlyId: null as string | null,
      yearlyId: null as string | null,
    };
    if (dto.key !== 'free') {
      try {
        const product = await this.stripe.products.create({
          name: dto.name,
          description: dto.description ?? undefined,
          metadata: { planKey: dto.key },
        });
        const prices = await this.createPrices(
          product.id,
          'usd',
          dto.key,
          monthlyCents,
          priceYearly,
          dto.yearlyDiscountPercent,
        );
        stripeIds = { productId: product.id, ...prices };
      } catch {
        throw rpcError(
          'STRIPE_SYNC_FAILED',
          'Failed to create the Stripe product/prices for this plan.',
        );
      }
    }

    const [plan] = await this.db
      .insert(plans)
      .values({
        key: dto.key,
        name: dto.name,
        description: dto.description ?? null,
        priceMonthly: monthlyCents,
        priceYearly,
        yearlyDiscountPercent: dto.yearlyDiscountPercent ?? null,
        yearlyDiscountAmount,
        limits: dto.limits ?? {},
        features: dto.features ?? {},
        sortOrder,
        stripeProductId: stripeIds.productId,
        stripePriceIdMonthly: stripeIds.monthlyId,
        stripePriceIdYearly: stripeIds.yearlyId,
      })
      .returning();
    return this.toAdminView(plan);
  }

  async update(payload: { id: string; dto: UpdatePlanDto }): Promise<AdminPlanView> {
    const existing = await this.db.query.plans.findFirst({
      where: eq(plans.id, payload.id),
      columns: {
        stripeProductId: true,
        stripePriceIdMonthly: true,
        stripePriceIdYearly: true,
      },
    });
    if (!existing) throw rpcError('NOT_FOUND', 'Plan not found.');

    // Retire → archive on Stripe FIRST (deactivation is idempotent + the safe
    // direction). On failure, leave the DB row untouched and fail loud so the
    // admin can retry. Prices are read-only (not in the DTO).
    if (payload.dto.active === false && existing.stripeProductId) {
      try {
        await this.archiveStripe(existing);
      } catch {
        throw rpcError(
          'STRIPE_SYNC_FAILED',
          'Failed to archive the plan on Stripe.',
        );
      }
    }

    const patch: Partial<typeof plans.$inferInsert> = {};
    const d = payload.dto;
    if (d.name !== undefined) patch.name = d.name;
    if (d.description !== undefined) patch.description = d.description;
    if (d.active !== undefined) patch.active = d.active;
    if (d.limits !== undefined) patch.limits = d.limits;
    if (d.features !== undefined) patch.features = d.features;
    if (d.sortOrder !== undefined) patch.sortOrder = d.sortOrder;

    const [plan] = await this.db
      .update(plans)
      .set(patch)
      .where(eq(plans.id, payload.id))
      .returning();
    if (!plan) throw rpcError('NOT_FOUND', 'Plan not found.');
    return this.toAdminView(plan);
  }

  /** Create monthly + yearly licensed Prices for a Stripe product. */
  private async createPrices(
    productId: string,
    currency: string,
    planKey: string,
    monthlyCents?: number | null,
    yearlyCents?: number | null,
    yearlyDiscountPercent?: number | null,
  ): Promise<{ monthlyId: string | null; yearlyId: string | null }> {
    const [monthly, yearly] = await Promise.all([
      monthlyCents != null
        ? this.stripe.prices.create({
            product: productId,
            currency,
            unit_amount: monthlyCents,
            recurring: { interval: 'month', usage_type: 'licensed' },
            metadata: { planKey, billingCycle: 'monthly' },
          })
        : Promise.resolve(null),
      yearlyCents != null
        ? this.stripe.prices.create({
            product: productId,
            currency,
            unit_amount: yearlyCents,
            recurring: { interval: 'year', usage_type: 'licensed' },
            metadata: {
              planKey,
              billingCycle: 'yearly',
              ...(yearlyDiscountPercent != null
                ? { yearlyDiscountPercent: String(yearlyDiscountPercent) }
                : {}),
            },
          })
        : Promise.resolve(null),
    ]);
    return {
      monthlyId: monthly ? monthly.id : null,
      yearlyId: yearly ? yearly.id : null,
    };
  }

  /** Archive a plan's Stripe Product + deactivate its Prices (retire). */
  private async archiveStripe(p: {
    stripeProductId: string | null;
    stripePriceIdMonthly: string | null;
    stripePriceIdYearly: string | null;
  }): Promise<void> {
    if (!p.stripeProductId) return;
    const tasks: Promise<unknown>[] = [
      this.stripe.products.update(p.stripeProductId, { active: false }),
    ];
    if (p.stripePriceIdMonthly) {
      tasks.push(
        this.stripe.prices.update(p.stripePriceIdMonthly, { active: false }),
      );
    }
    if (p.stripePriceIdYearly) {
      tasks.push(
        this.stripe.prices.update(p.stripePriceIdYearly, { active: false }),
      );
    }
    await Promise.all(tasks);
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

  /** Admin view includes the Stripe linkage ids (omitted from tenant PlanView). */
  private toAdminView(p: PlanRow): AdminPlanView {
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
      yearlyDiscountPercent: p.yearlyDiscountPercent,
      yearlyDiscountAmount: p.yearlyDiscountAmount,
      currency: p.currency,
      trialDays: p.trialDays,
      limits: (p.limits ?? {}) as PlanLimits,
      features: (p.features ?? {}) as PlanFeatures,
      stripeProductId: p.stripeProductId,
      stripePriceIdMonthly: p.stripePriceIdMonthly,
      stripePriceIdYearly: p.stripePriceIdYearly,
    };
  }
}
