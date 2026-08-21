import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from '../types/billing.types';

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
const PASSWORD_MESSAGE =
  'Password must be at least 8 characters with one uppercase letter and one special character';

const ADMIN_ROLES = ['admin', 'moderator', 'member'] as const;

export class AdminLoginDto {
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class CreateAdminDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password!: string;

  @IsIn(ADMIN_ROLES)
  role!: (typeof ADMIN_ROLES)[number];
}

export class UpdateAdminDto {
  @IsOptional()
  @IsIn(ADMIN_ROLES)
  role?: (typeof ADMIN_ROLES)[number];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Admin moderation of a tenant user: suspend/reactivate, force email verify. */
export class AdminUpdateUserDto {
  @IsOptional()
  @IsBoolean()
  suspended?: boolean;

  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;
}

/** Content moderation browser query: pagination + scope/status filters. */
export class AdminContentQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  contentTypeId?: string;

  @IsOptional()
  @IsIn(['draft', 'published', 'archived'])
  status?: 'draft' | 'published' | 'archived';
}

/** Pagination + optional workspace/project scope (media, keys, webhooks). */
export class AdminScopedQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}

/** Takedown an entry — unpublish (draft) or hide (archived). */
export class AdminTakedownDto {
  @IsIn(['draft', 'archived'])
  status!: 'draft' | 'archived';
}

/** Create a plan (admin). limits/features are open objects (see PlanLimits). */
export class CreatePlanDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  key!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  /**
   * USD dollars on the wire (≤2 decimals); auth-service converts once. No
   * `@Transform` here — the HTTP and TCP pipes both validate with
   * `transform: true`, so a transform would apply twice ($10 → 100000).
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceMonthly?: number;

  /** USD dollars on the wire (≤2 decimals) — the auth-service converts to cents. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceYearly?: number;

  /**
   * Yearly discount percent (0–100). When set, `priceMonthly` is required and
   * `priceYearly` must NOT also be sent — the server computes the final yearly
   * price (`round(monthly × 12 × (1 − percent/100))` cents) and stores the
   * breakdown (`yearlyDiscountPercent` + `yearlyDiscountAmount`).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  yearlyDiscountPercent?: number;

  @IsOptional()
  limits?: Record<string, number | null>;

  @IsOptional()
  features?: Record<string, unknown>;

  /** Tier rank — higher = more expensive. Drives upgrade/downgrade semantics
   *  (client CTA labels, swap deferral) and catalog ordering. Defaults to
   *  max(existing) + 1 on the service side when omitted. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/** Update a plan (admin). All fields optional. Prices are read-only after
 *  create (Stripe owns pricing — change via a new Stripe Price + repoint). */
export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  limits?: Record<string, number | null>;

  @IsOptional()
  features?: Record<string, unknown>;

  /** Tier rank — higher = more expensive (see CreatePlanDto.sortOrder). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/** Assign a plan to a workspace (admin). Identify the plan by key. */
export class AssignPlanDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  planKey!: string;

  @IsOptional()
  @IsIn([...SUBSCRIPTION_STATUSES])
  status?: SubscriptionStatus;

  @IsOptional()
  overrides?: Record<string, number | null>;
}

/** Common pagination/search query for admin list endpoints. */
export class AdminListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;
}

/** Admin projects list — pagination/search plus optional workspace scope. */
export class AdminProjectsQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;
}

/** Admin audit log list — pagination/search plus action/target filters. */
export class AdminAuditQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  targetType?: string;
}

/** Admin users list — pagination/search plus optional suspension filter. */
export class AdminUsersQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  suspended?: boolean;
}
