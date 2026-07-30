import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { stripeClientProvider } from './stripe-client.provider';
import { StripeWebhookService } from './stripe-webhook.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, StripeWebhookService, stripeClientProvider],
})
export class BillingModule {}
