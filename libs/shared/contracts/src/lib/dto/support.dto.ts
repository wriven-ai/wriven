import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  SUPPORT_PRIORITIES,
  SUPPORT_SCOPES,
  SUPPORT_STATUSES,
} from '../types/support.types';
import type {
  SupportPriority,
  SupportScope,
  SupportStatus,
} from '../types/support.types';

export class PresignTicketAttachmentDto {
  @IsString()
  filename!: string;

  @IsString()
  contentType!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  size?: number;
}

export class CreateTicketDto {
  @IsString()
  @Length(3, 160)
  subject!: string;

  @IsString()
  @Length(1, 5000)
  description!: string;

  @IsOptional()
  @IsIn(SUPPORT_SCOPES)
  scopeType?: SupportScope;

  @ValidateIf((o: CreateTicketDto) => o.scopeType === 'project')
  @IsUUID()
  scopeProjectId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(3)
  attachmentKeys?: string[];
}

export class CreateTicketMessageDto {
  @IsString()
  @Length(1, 10000)
  body!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(3)
  attachmentKeys?: string[];
}

export class CloseTicketDto {
  @IsIn(['closed'])
  status!: 'closed';
}

export class ListTicketsQueryDto {
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
  @IsIn(SUPPORT_STATUSES)
  status?: SupportStatus;

  @IsOptional()
  @IsIn(SUPPORT_SCOPES)
  scopeType?: SupportScope;
}

export class AdminTicketListQueryDto {
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
  @IsIn(SUPPORT_STATUSES)
  status?: SupportStatus;

  @IsOptional()
  @IsIn(SUPPORT_PRIORITIES)
  priority?: SupportPriority;

  @IsOptional()
  @IsIn(SUPPORT_SCOPES)
  scopeType?: SupportScope;

  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsOptional()
  @IsUUID()
  assignedAdminId?: string;

  /** Filter to tickets with no assignee (admin panel "Unassigned" preset). */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unassigned?: boolean;

  @IsOptional()
  @IsString()
  q?: string;
}

export class AdminReplyDto {
  @IsString()
  @Length(1, 10000)
  body!: string;

  @IsOptional()
  @IsBoolean()
  internalNote?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(3)
  attachmentKeys?: string[];
}

export class AdminUpdateTicketDto {
  @IsOptional()
  @IsIn(SUPPORT_STATUSES)
  status?: SupportStatus;

  @IsOptional()
  @IsIn(SUPPORT_PRIORITIES)
  priority?: SupportPriority;

  @IsOptional()
  @IsUUID()
  assignedAdminId?: string | null;
}
