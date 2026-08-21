import { Module } from '@nestjs/common';
import { stripeClientProvider } from './stripe-client.provider';

/**
 * Shared Stripe client (`STRIPE_CLIENT`) — imported by both `BillingModule`
 * (Checkout/Portal/webhook) and `AdminModule` (plan create/retire sync) so
 * neither declares the provider itself.
 */
@Module({
  providers: [stripeClientProvider],
  exports: [stripeClientProvider],
})
export class StripeModule {}
