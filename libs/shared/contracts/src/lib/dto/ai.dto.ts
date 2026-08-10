import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * AI content generation contracts. The provider call lives in core-service behind
 * an `AiProvider` seam (extractable to the deferred `ai-service`). See specs/19.
 */

/** Operations the generator supports (Tier-1 fields: text | richtext | select). */
export const AI_OPERATIONS = [
  'generate',
  'expand',
  'shorten',
  'rewrite',
  'tone',
  'summarize',
  'continue',
] as const;
export type AiOperation = (typeof AI_OPERATIONS)[number];

/** One turn of multi-turn refinement history (held client-side, sent on each call). */
export interface AiTurn {
  role: 'user' | 'assistant';
  content: string;
}

class AiTurnDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string;
}

/** Request body for `POST /content/ai/generate` → `core.ai.generate`. */
export class AiGenerateDto {
  /** Content type owning the target field (field-def lookup + prompt context). */
  @IsString()
  contentTypeId!: string;

  /** Existing entry whose sibling field values seed the prompt. */
  @IsOptional()
  @IsString()
  entryId?: string;

  /** Target field (must be Tier-1 with `aiAssist !== false`). */
  @IsString()
  @MaxLength(60)
  fieldKey!: string;

  @IsIn(AI_OPERATIONS)
  operation!: AiOperation;

  /** Freeform refinement note (e.g. "make it punchier", a tone target). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instruction?: string;

  /** Optional tone hint. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tone?: string;

  /** Prior turns for multi-turn refinement; capped client-side to the last ~8. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => AiTurnDto)
  history?: AiTurn[];
}

/** Token usage reported by the provider (metered into `ai_generations`). */
export interface AiTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Response view for `core.ai.generate`. */
export interface AiGenerateResult {
  /** Generated/refined content. For `select`: a member of the field's `options[]`. */
  text: string;
  /** The model actually used (`response.model` — may differ from `AI_MODEL` for `openrouter/free`). */
  model: string;
  usage: AiTokenUsage;
  /** Requests left in the billing period; `null` when the workspace is unmetered. */
  remaining: number | null;
}
