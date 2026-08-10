/**
 * The AI provider seam. All LLM access in core-service goes through this
 * interface — the OpenRouter impl lives in `providers/openrouter.provider.ts`.
 * Swapping it for an HTTP client pointing at the deferred FastAPI `ai-service`
 * is the entire extraction cost (no caller changes). See specs/19.
 */

/** A chat message in the shape the provider expects. */
export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Input to a single provider generation call. */
export interface AiGenerateInput {
  messages: AiChatMessage[];
  /** Sampling temperature — operation-dependent (see ai-prompt.ts). */
  temperature: number;
}

/** Output from a provider generation call. */
export interface AiProviderResult {
  /** The generated text (for `select`: validated against the field's options upstream). */
  text: string;
  /** The model actually used (`response.model` — may differ from `AI_MODEL` for `openrouter/free`). */
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Thrown by a provider on any failure (upstream error, timeout, upstream 429).
 * The service maps it to `AI_GENERATION_FAILED` (502). The "not configured"
 * case (missing key) is NOT an error throw — the service checks `configured()`
 * first and returns `AI_NOT_CONFIGURED` (503).
 */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/** NestJS injection token for the active {@link AiProvider}. */
export const AI_PROVIDER = Symbol('AI_PROVIDER');

/** Implemented by the OpenRouter provider; extractable to an `ai-service` HTTP client. */
export interface AiProvider {
  /** Whether a provider key/endpoint is configured. False → route returns `AI_NOT_CONFIGURED`. */
  configured(): boolean;
  /** Run one generation. Throws {@link AiProviderError} on any failure. */
  generate(input: AiGenerateInput): Promise<AiProviderResult>;
}
