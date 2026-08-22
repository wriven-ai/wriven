import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
// Namespace import (not named) so DTO classes stay runtime values for
// ValidationPipe metadata while satisfying TS1272 under isolatedModules +
// emitDecoratorMetadata.
import * as contracts from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentWorkspace } from '../auth/current-workspace.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { computeDowngradeBlocks, downgradeBlockedError } from './downgrade.guard';
import { WorkspaceUsageComposer } from './workspace-usage.composer';
import {
  AuditRequest,
  WorkspaceAudit,
} from '../common/workspace-audit.decorator';
import { WorkspaceAuditInterceptor } from '../common/workspace-audit.interceptor';

/**
 * Customer-facing billing → auth-service over TCP. Reads open to any member;
 * PermissionGuard gates mutations, and auth-service re-checks
 * WORKSPACE_BILLING_MANAGE as defense-in-depth.
 */
@Controller('billing')
@UseGuards(JwtAuthGuard, WorkspaceGuard, PermissionGuard)
@UseInterceptors(WorkspaceAuditInterceptor)
export class BillingController {
  constructor(
    @Inject(contracts.SERVICE_TOKENS.AUTH_SERVICE)
    private readonly auth: ClientProxy,
    private readonly usage: WorkspaceUsageComposer,
  ) {}

  @Get('plans')
  listPlans() {
    return firstValueFrom(
      this.auth.send(contracts.BILLING_PATTERNS.LIST_PLANS, {}),
    );
  }

  @Get('subscription')
  @RequirePermission(contracts.Permission.WORKSPACE_VIEW)
  getSubscription(@CurrentWorkspace() workspaceId: string) {
    return firstValueFrom(
      this.auth.send(contracts.BILLING_PATTERNS.GET_SUBSCRIPTION, { workspaceId }),
    );
  }

  @Get('invoices')
  @RequirePermission(contracts.Permission.WORKSPACE_VIEW)
  listInvoices(@CurrentWorkspace() workspaceId: string) {
    return firstValueFrom(
      this.auth.send(contracts.BILLING_PATTERNS.LIST_INVOICES, { workspaceId }),
    );
  }

  @Post('checkout')
  @RequirePermission(contracts.Permission.WORKSPACE_BILLING_MANAGE)
  createCheckout(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @Body() dto: contracts.CreateCheckoutSessionDto,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.BILLING_PATTERNS.CREATE_CHECKOUT, {
        userId: user.userId,
        workspaceId,
        dto,
      }),
    );
  }

  @Post('portal')
  @RequirePermission(contracts.Permission.WORKSPACE_BILLING_MANAGE)
  createPortal(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @Body() dto: contracts.CreatePortalSessionDto,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.BILLING_PATTERNS.CREATE_PORTAL, {
        userId: user.userId,
        workspaceId,
        dto,
      }),
    );
  }

  /** Change an existing subscription's plan/cycle directly (proration), or
   *  cancel down to free. Unlike /checkout, this works on already-paid
   *  workspaces. A downgrade (lower paid tier, or → Free) is first screened by
   *  {@link assertDowngradeAllowed} — blocked with `DOWNGRADE_BLOCKED` when the
   *  workspace holds more stock resources than the target plan allows. */
  @Post('swap')
  @RequirePermission(contracts.Permission.WORKSPACE_BILLING_MANAGE)
  @WorkspaceAudit('billing.swap', 'subscription')
  async swapPlan(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @Body() dto: contracts.SwapPlanDto,
    @Req() req: AuditRequest,
  ) {
    await this.assertDowngradeAllowed(workspaceId, dto.planKey);
    const result = await firstValueFrom<contracts.SubscriptionView>(
      this.auth.send(contracts.BILLING_PATTERNS.SWAP_PLAN, {
        userId: user.userId,
        workspaceId,
        dto,
      }),
    );
    req.logMeta = {
      plan: result.planName,
      ...(result.billingCycle ? { cycle: result.billingCycle } : {}),
    };
    return result;
  }

  /**
   * Block a downgrade that exceeds the target plan's stock limits: only runs
   * when `target.sortOrder < current.sortOrder`; upgrades, cycle-switches, and
   * unknown plans pass through to auth-service.
   */
  private async assertDowngradeAllowed(
    workspaceId: string,
    targetPlanKey: string,
  ): Promise<void> {
    const [plans, sub] = await Promise.all([
      firstValueFrom(
        this.auth.send<contracts.PlanView[]>(
          contracts.BILLING_PATTERNS.LIST_PLANS,
          {},
        ),
      ),
      firstValueFrom(
        this.auth.send<contracts.SubscriptionView>(
          contracts.BILLING_PATTERNS.GET_SUBSCRIPTION,
          { workspaceId },
        ),
      ),
    ]);
    const byKey = new Map(plans.map((p) => [p.key, p]));
    const current = byKey.get(sub.planKey);
    const target = byKey.get(targetPlanKey);
    // Missing/non-public plan on either side → can't rank tiers; let auth decide.
    if (!current || !target) return;
    if (target.sortOrder >= current.sortOrder) return; // upgrade / same / cycle-switch
    const stats = await this.usage.compose(workspaceId);
    const blocks = computeDowngradeBlocks(stats, target.limits);
    if (blocks.length > 0) throw downgradeBlockedError(blocks);
  }
}
