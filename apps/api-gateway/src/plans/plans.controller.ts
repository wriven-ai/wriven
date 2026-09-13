import { Controller, Get, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { BILLING_PATTERNS, SERVICE_TOKENS } from '@wriven/contracts';
import type { PlanView } from '@wriven/contracts';
import { sendWithTimeout } from '../common/send-with-timeout';
/**
 * Public pricing catalog — only the global throttler applies. LIST_PLANS
 * returns just isPublic && active plans, Stripe ids omitted.
 */
@Controller('plans')
export class PlansController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  @Get()
  list(): Promise<PlanView[]> {
    return sendWithTimeout<PlanView[]>(this.auth, BILLING_PATTERNS.LIST_PLANS, {});
  }
}
