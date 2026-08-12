/**
 * The AI client seam. All LLM access in core-service goes through this interface
 * — the concrete impl (`ai-service.client.ts`) is an HTTP client to the standalone
 * Python `ai-service`. Prompt building, temperature, and `select` validation/retry
 * live in Python now; core only assembles the context payload and meters usage.
 */

import type { AiOperation, AiTokenUsage, AiTurn } from '@wriven/contracts';

/** Tier-1 field types eligible for generation (enforced upstream before sending). */
export type AiFieldType = 'text' | 'richtext' | 'select';

/** Sibling entry value fenced as untrusted data by the ai-service prompt builder. */
export interface AiSiblingValue {
  label: string;
  value: string;
}

/**
 * Context payload core → ai-service over HTTP. Mirrored as a Pydantic model in
 * `apps/ai-service/app/schemas.py` — keep the camelCase shape + the `operation`
 * enum in sync (the TS `AiOperation` is the single source of truth).
 */
export interface AiGenerateRequest {
  /** Browser request id, propagated as the internal correlation-id header. */
  requestId: string;
  operation: AiOperation;
  contentTypeName: string;
  field: { key: string; label: string; type: AiFieldType; options?: string[] };
  /** Current target-field draft, fenced as untrusted data by ai-service. */
  sourceContent?: string;
  siblingValues?: AiSiblingValue[];
  history?: AiTurn[];
  instruction?: string;
  tone?: string;
}

/** Result returned by ai-service. `remaining` is added by core after the call. */
export interface AiClientResult {
  text: string;
  model: string;
  usage: AiTokenUsage;
  providerRequestId?: string;
  finishReason?: string;
  attemptCount: number;
}

/** Codes the ai-service returns that core passes through unchanged. */
export type AiClientErrorCode = 'AI_NOT_CONFIGURED' | 'AI_GENERATION_FAILED';

/**
 * Thrown by the client on any failure (non-2xx from ai-service, network, timeout).
 * `code` carries the contract error code the gateway ultimately emits. The
 * "not configured" case (missing AI_SERVICE_URL/INTERNAL_SECRET) is checked via
 * {@link AiClient.configured} before calling — but ai-service may also return
 * `AI_NOT_CONFIGURED` when its own provider key is missing.
 *
 * `model` + `usage` are present only when the LLM call succeeded but the turn
 * still failed (e.g. `select` option miss after retry) — ai-service forwards
 * the spent totals so core can meter them on the `failed` audit row.
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

/** HTTP client to ai-service. The extraction target — one file. */
export interface AiClient {
  /** Whether `AI_SERVICE_URL` + `INTERNAL_SECRET` are configured. False → `AI_NOT_CONFIGURED`. */
  configured(): boolean;
  /** Run one generation via ai-service. Throws {@link AiClientError} on any failure. */
  generate(req: AiGenerateRequest): Promise<AiClientResult>;
}
