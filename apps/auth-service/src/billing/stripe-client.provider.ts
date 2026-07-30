import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/** DI token for the configured Stripe client. */
export const STRIPE_CLIENT = 'STRIPE_CLIENT';

/**
 * Configured Stripe client. Reads `STRIPE_SECRET_KEY` from auth-service `.env`.
 * Fail-fast at boot: ConfigModule has no Joi schema, so a missing/empty key
 * throws here rather than failing on the first Stripe call.
 *
 * `apiVersion` is pinned to the version the bundled SDK types target
 * (2026-06-24.dahlia) so the runtime object shapes match what TypeScript
 * type-checks against — leaving it unset lets the account default drift
 * independently and silently null-reads renamed/moved fields. The Stripe
 * Dashboard webhook endpoint must be registered under the SAME version.
 * See specs/08 (Phase 5 setup).
 */
export const stripeClientProvider: Provider = {
  provide: STRIPE_CLIENT,
  inject: [ConfigService],
  useFactory: (cfg: ConfigService): Stripe => {
    const key = cfg.get<string>('STRIPE_SECRET_KEY');
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    return new Stripe(key, {
      apiVersion: '2026-06-24.dahlia',
      appInfo: { name: 'wriven-auth-service' },
    });
  },
};
