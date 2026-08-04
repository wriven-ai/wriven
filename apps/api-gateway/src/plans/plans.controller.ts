import { Controller, Get, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { BILLING_PATTERNS, SERVICE_TOKENS } from '@wriven/contracts';
import type { PlanView } from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';

/**
 * Public plan catalog for the marketing `/pricing` page — no JWT, no workspace.
 * Reuses `BILLING_PATTERNS.LIST_PLANS`, which returns only `isPublic && active`
 * plans and omits Stripe ids (safe to expose). Only the global `ThrottlerGuard`
 * applies (no `JwtAuthGuard` on this controller). See specs/15.
 */
@Controller('plans')
export class PlansController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  @Get()
  list(): Promise<PlanView[]> {
    return firstValueFrom(
      this.auth.send<PlanView[]>(BILLING_PATTERNS.LIST_PLANS, {}),
    );
  }
}
