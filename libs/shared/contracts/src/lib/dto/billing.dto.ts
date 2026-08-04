import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { BillingCycle } from '../types/billing.types';

/**
 * Start (or change) a paid subscription by creating a Stripe Checkout Session.
 * `planKey` must be a paid plan — the free plan has no checkout. See specs/08.
 */
export class CreateCheckoutSessionDto {
  @IsString()
  @IsIn(['starter', 'pro'])
  planKey!: 'starter' | 'pro';

  @IsString()
  @IsIn(['monthly', 'yearly'])
  billingCycle!: BillingCycle;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  successUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  cancelUrl?: string;
}

/**
 * Change an existing paid subscription's plan and/or billing cycle directly via
 * a Stripe subscription update (proration), or cancel down to free. Only valid
 * when a live `stripe_subscription_id` exists — the free→paid transition uses
 * Checkout. `planKey: 'free'` schedules cancellation at period end. See specs/08.
 */
export class SwapPlanDto {
  @IsString()
  @IsIn(['free', 'starter', 'pro'])
  planKey!: 'free' | 'starter' | 'pro';

  @IsString()
  @IsIn(['monthly', 'yearly'])
  billingCycle!: BillingCycle;
}

/**
 * Open the Stripe Billing Portal so the customer can manage their card,
 * upgrade/downgrade, or cancel. See specs/08.
 */
export class CreatePortalSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  returnUrl?: string;
}
