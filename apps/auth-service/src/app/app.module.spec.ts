import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { AuthService } from '../auth/auth.service';
import { TokenService } from '../auth/token.service';
import { AuthorizationService } from '../auth/authorization.service';
import { BillingService } from '../billing/billing.service';
import { StripeWebhookService } from '../billing/stripe-webhook.service';
import { STRIPE_CLIENT } from '../billing/stripe-client.provider';

// Fail-fast providers need these at construct time; every external client
// (postgres, Stripe, nodemailer) is lazy — nothing connects during compile.
process.env.DATABASE_URL ??= 'postgresql://smoke:smoke@127.0.0.1:5432/smoke';
process.env.STRIPE_SECRET_KEY ??= 'sk_test_bootstrap_smoke';

/**
 * Bootstrap smoke: prove the real AppModule wires — the TCP message graph,
 * the Stripe client factory, the DB provider, and every scheduled/cron
 * provider resolve together. Unit specs build service graphs by hand; only
 * this spec catches a broken provider token or a constructor that throws.
 */
describe('AppModule — bootstrap smoke', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('compiles the full DI graph', () => {
    expect(moduleRef).toBeDefined();
  });

  it('resolves the Stripe client from the factory (fail-fast env read works)', () => {
    const stripe = moduleRef.get(STRIPE_CLIENT, { strict: false });
    expect(stripe).toBeDefined();
    expect(
      typeof (stripe as { webhooks?: { constructEvent?: unknown } }).webhooks
        ?.constructEvent,
    ).toBe('function');
  });

  it('constructs the core auth/billing services against the real module graph', () => {
    expect(moduleRef.get(AuthService, { strict: false })).toBeInstanceOf(AuthService);
    expect(moduleRef.get(TokenService, { strict: false })).toBeInstanceOf(TokenService);
    expect(moduleRef.get(AuthorizationService, { strict: false })).toBeInstanceOf(
      AuthorizationService,
    );
    expect(moduleRef.get(BillingService, { strict: false })).toBeInstanceOf(BillingService);
    expect(moduleRef.get(StripeWebhookService, { strict: false })).toBeInstanceOf(
      StripeWebhookService,
    );
  });
});
