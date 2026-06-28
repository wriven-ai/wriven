import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FIELD_TYPES } from '../types/cms.types';
import type { FieldType } from '../types/cms.types';

const API_ID = /^[a-z][a-z0-9_]*$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUSES = ['draft', 'published', 'archived'] as const;

export class FieldDefDto {
  @IsString()
  @Matches(API_ID, { message: 'key must be snake_case (a-z, 0-9, _)' })
  @MaxLength(60)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsIn(FIELD_TYPES)
  type!: FieldType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  unique?: boolean;

  @IsOptional()
  @IsBoolean()
  multiple?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsString()
  refTypeId?: string;
}

export class CreateContentTypeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsString()
  @Matches(API_ID, { message: 'apiId must be snake_case (a-z, 0-9, _)' })
  @MaxLength(60)
  apiId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldDefDto)
  fields!: FieldDefDto[];
}

export class UpdateContentTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldDefDto)
  fields?: FieldDefDto[];
}

export class CreateEntryDto {
  @IsString()
  contentTypeId!: string;

  @IsOptional()
  @IsString()
  @Matches(SLUG, { message: 'slug must be kebab-case' })
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  /** Field values keyed by FieldDef.key — validated against the type's fields. */
  @IsObject()
  data!: Record<string, unknown>;
}

export class UpdateEntryDto {
  @IsOptional()
  @IsString()
  @Matches(SLUG, { message: 'slug must be kebab-case' })
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

/** Query params for the public Content Delivery API. */
export class DeliveryQueryDto {
  /** Comma-separated field keys to return, e.g. "title,body". */
  @IsOptional()
  @IsString()
  select?: string;

  /** Sort by a system field, prefix `-` for descending, e.g. "-publishedAt". */
  @IsOptional()
  @IsString()
  sort?: string;

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

  /** Depth to expand `reference` fields (0–3). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3)
  include?: number;

  /** Equality filters on data keys: `filter[title]=Hello`. */
  @IsOptional()
  @IsObject()
  filter?: Record<string, string>;
}

const MEDIA_KINDS = ['image', 'video', 'file'] as const;

export class PresignUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  contentType!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  size?: number;
}

export class CreateMediaDto {
  /** The object key returned by presign. */
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  key!: string;

  @IsIn(MEDIA_KINDS)
  kind!: (typeof MEDIA_KINDS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(150)
  mime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  size?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  height?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  alt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  originalFilename?: string;
}

export class ListEntriesQueryDto {
  @IsOptional()
  @IsString()
  contentTypeId?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

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
}
