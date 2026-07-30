import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from '../types/billing.types';

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMonthly?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceYearly?: number;

  @IsOptional()
  limits?: Record<string, number | null>;

  @IsOptional()
  features?: Record<string, unknown>;
}

/** Update a plan (admin). All fields optional. */
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
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMonthly?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceYearly?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  limits?: Record<string, number | null>;

  @IsOptional()
  features?: Record<string, unknown>;
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
