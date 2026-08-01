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
import { CurrentWorkspaceRole } from '../auth/current-workspace-role.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../auth/workspace.guard';

/**
 * Customer-facing billing endpoints. Thin HTTP adapter → auth-service over TCP.
 * Workspace-scoped (WorkspaceGuard sets workspaceId + workspaceRole). Checkout +
 * portal forward the role so auth-service can gate them to owner/admin. See specs/08.
 */
@Controller('billing')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
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
  getSubscription(@CurrentWorkspace() workspaceId: string) {
    return firstValueFrom(
      this.auth.send(contracts.BILLING_PATTERNS.GET_SUBSCRIPTION, { workspaceId }),
    );
  }

  @Get('invoices')
  listInvoices(@CurrentWorkspace() workspaceId: string) {
    return firstValueFrom(
      this.auth.send(contracts.BILLING_PATTERNS.LIST_INVOICES, { workspaceId }),
    );
  }

  @Post('checkout')
  createCheckout(
    @CurrentUser() user: contracts.AuthUser,
    @CurrentWorkspace() workspaceId: string,
    @CurrentWorkspaceRole() workspaceRole: string | undefined,
    @Body() dto: contracts.CreateCheckoutSessionDto,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.BILLING_PATTERNS.CREATE_CHECKOUT, {
        userId: user.userId,
        workspaceId,
        workspaceRole,
        dto,
      }),
    );
  }

  @Post('portal')
  createPortal(
    @CurrentWorkspace() workspaceId: string,
    @CurrentWorkspaceRole() workspaceRole: string | undefined,
    @Body() dto: contracts.CreatePortalSessionDto,
  ) {
    return firstValueFrom(
      this.auth.send(contracts.BILLING_PATTERNS.CREATE_PORTAL, {
        workspaceId,
        workspaceRole,
        dto,
      }),
    );
  }
}
