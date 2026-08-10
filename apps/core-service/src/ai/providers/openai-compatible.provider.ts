import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  AiGenerateInput,
  AiProvider,
  AiProviderError,
  AiProviderResult,
} from '../ai-provider.interface';

/**
 * Generic OpenAI-compatible provider. Talks the Chat Completions API shape, so it
 * works with **any** compatible endpoint — OpenRouter, OpenAI direct, Groq,
 * Together, local Ollama, etc. Swap provider by changing env, **no code change**:
 *
 *   AI_API_KEY   — the provider's key (sk-or-…, sk-…, etc.)
 *   AI_BASE_URL  — any Chat Completions endpoint (https://openrouter.ai/api/v1, …)
 *   AI_MODEL     — any model the endpoint serves
 *   AI_TIMEOUT_MS — request timeout (default 30s; overrides the SDK's 10-min default)
 *   AI_HEADERS   — optional JSON of extra headers for provider-specific needs
 *                  (e.g. OpenRouter attribution: {"HTTP-Referer":"…","X-Title":"…"})
 *
 * The `openai` SDK is imported **only here**, keeping the {@link AiProvider} seam
 * clean — extraction to the deferred `ai-service` swaps this one file for an HTTP
 * client. See specs/19.
 *
 * Uses Chat Completions (not OpenAI's Responses API) for widest compatibility.
 */
@Injectable()
export class OpenAiCompatibleProvider implements AiProvider {
  private readonly logger = new Logger(OpenAiCompatibleProvider.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(cfg: ConfigService) {
    const key = cfg.get<string>('AI_API_KEY');
    this.model = cfg.get<string>('AI_MODEL') ?? 'openrouter/free';
    this.client = key
      ? new OpenAI({
          apiKey: key,
          baseURL: cfg.get<string>('AI_BASE_URL') ?? 'https://openrouter.ai/api/v1',
          timeout: cfg.get<number>('AI_TIMEOUT_MS') ?? 30_000,
          defaultHeaders: parseHeaders(cfg.get<string>('AI_HEADERS')),
        })
      : null;
  }

  configured(): boolean {
    return this.client !== null;
  }

  async generate(input: AiGenerateInput): Promise<AiProviderResult> {
    if (!this.client) {
      // Defensive — the service checks configured() first and maps to AI_NOT_CONFIGURED.
      throw new AiProviderError('AI provider not configured', 503);
    }
    try {
      const res = await this.client.chat.completions.create({
        model: this.model,
        messages: input.messages,
        temperature: input.temperature,
      });
      const text = res.choices[0]?.message?.content ?? '';
      const u = res.usage;
      return {
        text,
        // `response.model` is the model actually used — for routed endpoints
        // (e.g. openrouter/free) this may differ from the requested `AI_MODEL`.
        model: res.model,
        usage: {
          promptTokens: u?.prompt_tokens ?? 0,
          completionTokens: u?.completion_tokens ?? 0,
          totalTokens: u?.total_tokens ?? 0,
        },
      };
    } catch (err) {
      // Never leak the raw provider payload upstream — log details, throw a short reason.
      const status = (err as { status?: number }).status;
      this.logger.warn(
        `AI generation failed (status=${status ?? 'n/a'}): ${shortReason(err)}`,
      );
      throw new AiProviderError(
        status === 429
          ? 'The AI provider is busy — try again shortly.'
          : 'AI generation failed.',
        status,
      );
    }
  }
}

/** Parse the optional `AI_HEADERS` JSON env into a header record; tolerant. */
function parseHeaders(raw?: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Reduce any error to a short, leak-free string for logs. */
function shortReason(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 200);
  return String(err).slice(0, 200);
}
