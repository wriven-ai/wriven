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
