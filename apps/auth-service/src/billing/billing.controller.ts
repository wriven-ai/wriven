import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { BILLING_PATTERNS } from '@wriven/contracts';
import type {
  CreateCheckoutSessionDto,
  CreatePortalSessionDto,
} from '@wriven/contracts';
import { rpcError } from '../common/rpc-error';
import { BillingService } from './billing.service';
import { StripeWebhookService } from './stripe-webhook.service';

/**
 * TCP handlers for the billing module. The api-gateway billing controller +
 * Stripe webhook receiver forward to these patterns. See specs/08.
 */
@Controller()
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly webhooks: StripeWebhookService,
  ) {}

  /** Billing mutations (checkout / portal) are owner/admin-only. The gateway
   *  forwards the workspaceRole from WorkspaceGuard; auth-service trusts it
   *  (gateway injects identity, no re-validation). */
  private assertCanManageBilling(role: string | undefined): void {
    if (role !== 'owner' && role !== 'admin') {
      throw rpcError(
        'FORBIDDEN',
        'Only workspace owners or admins can manage billing.',
      );
    }
  }

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
  createCheckout(
    @Payload()
    p: {
      userId: string;
      workspaceId: string;
      workspaceRole?: string;
      dto: CreateCheckoutSessionDto;
    },
  ) {
    this.assertCanManageBilling(p.workspaceRole);
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
  createPortal(
    @Payload() p: {
      workspaceId: string;
      workspaceRole?: string;
      dto: CreatePortalSessionDto;
    },
  ) {
    this.assertCanManageBilling(p.workspaceRole);
    return this.billing.createPortal({
      workspaceId: p.workspaceId,
      returnUrl: p.dto.returnUrl,
    });
  }

  @MessagePattern(BILLING_PATTERNS.STRIPE_WEBHOOK)
  stripeWebhook(@Payload() p: { payload: string; signature?: string }) {
    return this.webhooks.verifyAndHandle(p.payload, p.signature ?? '');
  }
}
