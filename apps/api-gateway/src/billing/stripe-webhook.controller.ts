import { Controller, Inject, Post, Req } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { BILLING_PATTERNS, SERVICE_TOKENS } from '@wriven/contracts';
import type { Request } from 'express';
import { firstValueFrom } from 'rxjs';

type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Receives Stripe webhooks. Public — auth is the Stripe signature, not a JWT
 * (no JwtAuthGuard; CSRF guard short-circuits with no access_token cookie).
 * Stays thin per "gateway owns no business logic": forwards the raw body +
 * signature to auth-service, which verifies + reconciles.
 */
@SkipThrottle()
@Controller('webhooks/stripe')
export class StripeWebhookController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  @Post()
  async receive(@Req() req: RawBodyRequest) {
    const payload = req.rawBody?.toString('utf8') ?? '';
    const signature = (req.headers['stripe-signature'] as string | undefined) ?? '';
    // Acknowledge fast; auth-service verifies + reconciles (idempotent).
    await firstValueFrom(
      this.auth.send(BILLING_PATTERNS.STRIPE_WEBHOOK, { payload, signature }),
    );
    return { received: true };
  }
}
