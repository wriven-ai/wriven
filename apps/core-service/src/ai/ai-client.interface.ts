/**
 * Seam for all LLM access in core-service. The impl is the HTTP client to the
 * Python ai-service; prompt building and output validation live in Python.
 */

import type {
  AiOperation,
  AiOutput,
  AiTargetKind,
  AiTokenUsage,
  AiTurn,
} from '@wriven/contracts';

/** Tier-1 field types eligible for generation (enforced upstream before sending). */
export type AiFieldType = 'text' | 'richtext' | 'select';

/** Sibling entry value fenced as untrusted data by the ai-service prompt builder. */
export interface AiSiblingValue {
  label: string;
  value: string;
}

export interface AiComposeField {
  key: string;
  label: string;
  type: AiFieldType;
  options?: string[];
}

export interface AiProfile {
  brandVoice?: string | null;
  glossary?: { term: string; prefer: string }[];
  language?: string | null;
}

/**
 * core → ai-service payload. Mirrored as a Pydantic model in
 * apps/ai-service/app/schemas.py — keep the camelCase shape in sync.
 */
export interface AiGenerateRequest {
  /** Sent as the internal X-Request-ID correlation header. */
  requestId: string;
  /** Derived by core from (targetKind, intent, preset); ai-service never re-derives it. */
  operation: AiOperation;
  targetKind: AiTargetKind;
  contentTypeName: string;
  /** The target field (single-field ops). Absent for `compose`. */
  field?: { key: string; label: string; type: AiFieldType; options?: string[] };
  /** Composable fields to fill (whole-entry `compose`). Absent for single-field ops. */
  composeFields?: AiComposeField[];
  /** Current target-field draft, fenced as untrusted data by ai-service. */
  sourceContent?: string;
  siblingValues?: AiSiblingValue[];
  history?: AiTurn[];
  instruction?: string;
  profile?: AiProfile;
}

/** Result returned by ai-service. `remaining` is added by core after the call. */
export interface AiClientResult {
  output: AiOutput;
  model: string;
  usage: AiTokenUsage;
  providerRequestId?: string;
  finishReason?: string;
  attemptCount: number;
}

/** Codes the ai-service returns that core passes through unchanged. */
export type AiClientErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_GENERATION_FAILED'
  | 'AI_INPUT_TOO_LARGE';

/**
 * Thrown by the client on any ai-service failure. `code` is the contract error
 * code the gateway emits. `model`/`usage` are set only when the LLM call
 * succeeded but the turn failed (select miss) — the spent tokens are metered
 * on the failed audit row.
 */
export class AiClientError extends Error {
  constructor(
    readonly code: AiClientErrorCode,
    message: string,
    readonly status?: number,
    readonly model?: string,
    readonly usage?: AiTokenUsage,
    readonly providerRequestId?: string,
    readonly finishReason?: string,
    readonly attemptCount?: number,
  ) {
    super(message);
    this.name = 'AiClientError';
  }
}

/** NestJS injection token for the active {@link AiClient}. */
export const AI_CLIENT = Symbol('AI_CLIENT');

/** HTTP client to the ai-service. */
export interface AiClient {
  /** Whether `AI_SERVICE_URL` + `INTERNAL_SECRET` are configured. False → `AI_NOT_CONFIGURED`. */
  configured(): boolean;
  /** Run one generation via ai-service. Throws {@link AiClientError} on any failure. */
  generate(req: AiGenerateRequest): Promise<AiClientResult>;
}
