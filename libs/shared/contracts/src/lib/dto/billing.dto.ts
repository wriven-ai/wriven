import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { BillingCycle } from '../types/billing.types';

/**
 * Start (or change) a paid subscription by creating a Stripe Checkout Session.
 * `planKey` must be a paid plan — the free plan has no checkout. See specs/08.
 */
export class CreateCheckoutSessionDto {
  @IsString()
  @IsIn(['pro', 'business'])
  planKey!: 'pro' | 'business';

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
