import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/** DI token for the configured Stripe client. */
export const STRIPE_CLIENT = 'STRIPE_CLIENT';

/**
 * Configured Stripe client. Reads `STRIPE_SECRET_KEY` from auth-service `.env`,
 * fail-fast at boot if missing. `apiVersion` uses Stripe.API_VERSION so it
 * stays in lockstep with the installed SDK types — register the Dashboard
 * webhook endpoint under the same version.
 */
export const stripeClientProvider: Provider = {
  provide: STRIPE_CLIENT,
  inject: [ConfigService],
  useFactory: (cfg: ConfigService): Stripe => {
    const key = cfg.get<string>('STRIPE_SECRET_KEY');
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    return new Stripe(key, {
      apiVersion: Stripe.API_VERSION,
      appInfo: { name: 'wriven-auth-service' },
    });
  },
};
