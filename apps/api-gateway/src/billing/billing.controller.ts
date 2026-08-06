import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
// Namespace import (not named) so DTO classes stay runtime values for
// ValidationPipe metadata while satisfying TS1272 under isolatedModules +
// emitDecoratorMetadata. See specs/08.
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

/**
 * Customer-facing billing endpoints. Thin HTTP adapter → auth-service over TCP.
 * Workspace-scoped (WorkspaceGuard sets workspaceId + the cascade-resolved
 * permission set). PermissionGuard gates mutations to billing admins; reads are
 * open to any member. auth-service re-checks WORKSPACE_BILLING_MANAGE as
 * defense-in-depth. See specs/08.
 */
@Controller('billing')
@UseGuards(JwtAuthGuard, WorkspaceGuard, PermissionGuard)
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
   *  workspace holds more stock resources than the target plan allows. See
   *  specs/08 + specs/18. */
  @Post('swap')
  @RequirePermission(contracts.Permission.WORKSPACE_BILLING_MANAGE)
  async swapPlan(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @Body() dto: contracts.SwapPlanDto,
  ) {
    await this.assertDowngradeAllowed(workspaceId, dto.planKey);
    return firstValueFrom(
      this.auth.send(contracts.BILLING_PATTERNS.SWAP_PLAN, {
        userId: user.userId,
        workspaceId,
        dto,
      }),
    );
  }

  /**
   * Block a downgrade when the workspace exceeds the target plan's stock-resource
   * limits. Resolves current + target plan from the public catalog and only runs
   * the usage check when `target.sortOrder < current.sortOrder` (paid down or →
   * Free). Upgrades, cycle-switches, reactivation, and unknown-plan cases are
   * passed through to auth-service untouched. The gateway check is the
   * authoritative gate; the client's eager preview is the fast-path UX.
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
