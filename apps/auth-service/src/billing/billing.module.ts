import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeModule } from './stripe.module';
import { StripeWebhookService } from './stripe-webhook.service';

@Module({
  imports: [StripeModule],
  controllers: [BillingController],
  providers: [BillingService, StripeWebhookService],
})
export class BillingModule {}
