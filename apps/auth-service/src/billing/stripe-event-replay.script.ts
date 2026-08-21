/**
 * Day-one recovery: replay Stripe events from the API through the SAME idempotent
 * `handleEvent` the webhook uses. Run when the webhook endpoint was down, auth-
 * service was unavailable, or after fixing a price-id backfill. Handlers are
 * idempotent (`stripe_events` dedupe + per-subscription event ordering), so
 * re-running is safe — already-applied events are true no-ops.
 *
 * Usage (from repo root):
 *   pnpm billing:replay                    # all events
 *   pnpm billing:replay 2026-07-29T00:00:00Z   # since an ISO timestamp
 *   pnpm billing:replay 6                  # last 6 hours
 *
 * Loads env via AppModule's ConfigModule (apps/auth-service/.env).
 */
import { NestFactory } from '@nestjs/core';
import type Stripe from 'stripe';
import { AppModule } from '../app/app.module';
import { STRIPE_CLIENT } from './stripe-client.provider';
import { StripeWebhookService } from './stripe-webhook.service';

async function main() {
  const arg = process.argv[2];
  const created: { gte: number } | undefined = arg
    ? {
        gte: Math.floor(
          (/^\d+$/.test(arg)
            ? Date.now() - Number(arg) * 3_600_000 // N hours ago
            : new Date(arg).getTime()) / 1000,
        ),
      }
    : undefined;

  const app = await NestFactory.createApplicationContext(AppModule);
  const webhooks = app.get(StripeWebhookService);
  const stripe = app.get<Stripe>(STRIPE_CLIENT);

  let ok = 0;
  let failed = 0;
  for await (const event of stripe.events.list({ created })) {
    try {
      await webhooks.handleEvent(event);
      ok++;
    } catch (err) {
      // Don't abort the whole replay on one bad event; tx rolled back so a re-run retries it.
      failed++;
      console.error(
        `✗ event ${event.id} (${event.type}): ${(err as Error).message}`,
      );
    }
  }
  console.log(`✓ replayed ${ok} event(s)${failed ? `, ✗ ${failed} failed` : ''}`);
  await app.close();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
