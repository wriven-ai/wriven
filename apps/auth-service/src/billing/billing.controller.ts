import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { BILLING_PATTERNS, Permission } from '@wriven/contracts';
import type {
  CreateCheckoutSessionDto,
  CreatePortalSessionDto,
  SwapPlanDto,
} from '@wriven/contracts';
import { AuthorizationService } from '../auth/authorization.service';
import { BillingService } from './billing.service';
import { StripeWebhookService } from './stripe-webhook.service';

/**
 * TCP handlers for the billing module. The api-gateway billing controller +
 * Stripe webhook receiver forward to these patterns. See specs/08.
 *
 * Billing mutations (checkout / portal) require WORKSPACE_BILLING_MANAGE,
 * enforced at both the gateway (`PermissionGuard`) and here (defense-in-depth,
 * resolving from auth-service's own membership data).
 */
@Controller()
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly webhooks: StripeWebhookService,
    private readonly authz: AuthorizationService,
  ) {}

  @MessagePattern(BILLING_PATTERNS.LIST_PLANS)
  listPlans() {
    return this.billing.listPlans();
  }

  @MessagePattern(BILLING_PATTERNS.GET_SUBSCRIPTION)
  getSubscription(@Payload() p: { workspaceId: string }) {
    return this.billing.getSubscription(p.workspaceId);
  }

  @MessagePattern(BILLING_PATTERNS.LIST_INVOICES)
  listInvoices(@Payload() p: { workspaceId: string }) {
    return this.billing.listInvoices(p.workspaceId);
  }

  @MessagePattern(BILLING_PATTERNS.CREATE_CHECKOUT)
  async createCheckout(
    @Payload()
    p: { userId: string; workspaceId: string; dto: CreateCheckoutSessionDto },
  ) {
    await this.authz.authorize({
      userId: p.userId,
      permission: Permission.WORKSPACE_BILLING_MANAGE,
      workspaceId: p.workspaceId,
    });
    return this.billing.createCheckout({
      workspaceId: p.workspaceId,
      userId: p.userId,
      planKey: p.dto.planKey,
      billingCycle: p.dto.billingCycle,
      successUrl: p.dto.successUrl,
      cancelUrl: p.dto.cancelUrl,
    });
  }

  @MessagePattern(BILLING_PATTERNS.CREATE_PORTAL)
  async createPortal(
    @Payload()
    p: { userId: string; workspaceId: string; dto: CreatePortalSessionDto },
  ) {
    await this.authz.authorize({
      userId: p.userId,
      permission: Permission.WORKSPACE_BILLING_MANAGE,
      workspaceId: p.workspaceId,
    });
    return this.billing.createPortal({
      workspaceId: p.workspaceId,
      returnUrl: p.dto.returnUrl,
    });
  }

  @MessagePattern(BILLING_PATTERNS.SWAP_PLAN)
  async swapPlan(
    @Payload()
    p: { userId: string; workspaceId: string; dto: SwapPlanDto },
  ) {
    await this.authz.authorize({
      userId: p.userId,
      permission: Permission.WORKSPACE_BILLING_MANAGE,
      workspaceId: p.workspaceId,
    });
    return this.billing.swapPlan({
      workspaceId: p.workspaceId,
      planKey: p.dto.planKey,
      billingCycle: p.dto.billingCycle,
    });
  }

  @MessagePattern(BILLING_PATTERNS.STRIPE_WEBHOOK)
  stripeWebhook(@Payload() p: { payload: string; signature?: string }) {
    return this.webhooks.verifyAndHandle(p.payload, p.signature ?? '');
  }
}
