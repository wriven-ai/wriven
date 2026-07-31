import { Module } from '@nestjs/common';
import { stripeClientProvider } from './stripe-client.provider';

/**
 * Shared Stripe client (`STRIPE_CLIENT`). Imported by both `BillingModule`
 * (Checkout/Portal/webhook) and `AdminModule` (plan create/retire sync) so
 * neither has to declare the provider itself. See specs/08, specs/11.
 */
@Module({
  providers: [stripeClientProvider],
  exports: [stripeClientProvider],
})
export class StripeModule {}
