import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { API_KEY_SCOPES } from '../types/api-key.types';
import type { ApiKeyScope } from '../types/api-key.types';

export class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  /** Defaults to `read` (published-only delivery) when omitted. */
  @IsOptional()
  @IsIn(API_KEY_SCOPES)
  scope?: ApiKeyScope;
}
