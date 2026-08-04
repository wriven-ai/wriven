import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeModule } from './stripe.module';
import { StripeWebhookService } from './stripe-webhook.service';

@Module({
  imports: [StripeModule, AuthModule],
  controllers: [BillingController],
  providers: [BillingService, StripeWebhookService],
})
export class BillingModule {}
