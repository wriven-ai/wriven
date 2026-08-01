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
}
