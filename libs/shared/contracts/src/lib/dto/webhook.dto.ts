import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsUrl,
} from 'class-validator';
import { WEBHOOK_EVENTS } from '../types/webhook.types';
import type { WebhookEvent } from '../types/webhook.types';

export class CreateWebhookDto {
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  url!: string;

  /** Defaults to all events when omitted. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(WEBHOOK_EVENTS, { each: true })
  events?: WebhookEvent[];
}

export class UpdateWebhookDto {
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  url?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(WEBHOOK_EVENTS, { each: true })
  events?: WebhookEvent[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
