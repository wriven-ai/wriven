import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import type { AiTokenUsage } from '@wriven/contracts';
import {
  AiClient,
  AiClientError,
  type AiClientErrorCode,
  type AiClientResult,
  type AiGenerateRequest,
} from './ai-client.interface';

/**
 * HTTP client to the standalone Python `ai-service`. The only LLM-adjacent code
 * in core-service — it forwards the context payload to `${AI_SERVICE_URL}/generate`
 * and maps failures to {@link AiClientError}. Prompt building, temperature, and
 * `select` validation/retry live in Python; core stays free of any LLM SDK.
 *
 * Auth: the shared `INTERNAL_SECRET` travels in the `X-Internal-Secret` header
 * (ai-service verifies it). Never send the provider key — that lives only in
 * ai-service env.
 */
@Injectable()
export class AiServiceClient implements AiClient {
  private readonly logger = new Logger(AiServiceClient.name);
  private readonly http: AxiosInstance;
  private readonly configuredUrl: boolean;

  constructor(cfg: ConfigService) {
    const baseUrl = cfg.get<string>('AI_SERVICE_URL');
    const secret = cfg.get<string>('INTERNAL_SECRET');
    // This deadline must leave room for ai-service to turn a provider timeout
    // into a response. Keeping both hops at exactly 30s makes core abandon a
    // request just as ai-service is finalizing it, which encourages duplicate
    // paid retries. `AI_TIMEOUT_MS` remains a temporary compatibility fallback
    // for existing core deployments; new configs use AI_SERVICE_TIMEOUT_MS.
    const rawTimeout = Number(
      cfg.get<string>('AI_SERVICE_TIMEOUT_MS') ??
        cfg.get<string>('AI_TIMEOUT_MS') ??
        '35000',
    );
    const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 35_000;

    this.configuredUrl = Boolean(baseUrl && secret);
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: timeoutMs,
      headers: secret ? { 'X-Internal-Secret': secret } : {},
    });
  }

  configured(): boolean {
    return this.configuredUrl;
  }

  async generate(req: AiGenerateRequest): Promise<AiClientResult> {
    let data: unknown;
    try {
      const { requestId, ...payload } = req;
      const res = await this.http.post<unknown>('/generate', payload, {
        headers: { 'X-Request-ID': requestId },
      });
      data = res.data;
    } catch (err) {
      throw this.toClientError(err, req.requestId);
    }
    return this.assertWellFormed(data);
  }

  /**
   * A 2xx is not a contract: a proxy, a stale deployment, or a wrong
   * `AI_SERVICE_URL` can answer 200 with HTML or a legacy body. Validate the
   * essentials before returning so a malformed success takes the normal
   * `failed`-row path instead of crashing mid-`finalize` with the reservation
   * stuck `pending` until the stale reclaim.
   */
  private assertWellFormed(data: unknown): AiClientResult {
    const malformed = () =>
      new AiClientError('AI_GENERATION_FAILED', 'AI generation failed.');
    if (!data || typeof data !== 'object') throw malformed();
    const d = data as Record<string, unknown>;
    const output = d.output as Record<string, unknown> | undefined;
    const outputOk =
      !!output &&
      (output.kind === 'scalar'
        ? typeof output.text === 'string'
        : output.kind === 'record' &&
          typeof output.fields === 'object' &&
          output.fields !== null &&
          Object.values(output.fields).every((v) => typeof v === 'string'));
    const usage = d.usage as Partial<AiTokenUsage> | undefined;
    const usageOk =
      !!usage &&
      (['promptTokens', 'completionTokens', 'totalTokens'] as const).every(
        (k) => typeof usage[k] === 'number' && Number.isFinite(usage[k]),
      );
    if (!outputOk || typeof d.model !== 'string' || !usageOk) {
      this.logger.warn('ai-service returned a malformed 2xx body');
      throw malformed();
    }
    return d as unknown as AiClientResult;
  }

  /**
   * Collapse any axios failure into an {@link AiClientError}. Code allowlist:
   * if ai-service returned a known code (`AI_NOT_CONFIGURED` /
   * `AI_GENERATION_FAILED` / `AI_INPUT_TOO_LARGE`) in the body, pass it through
   * unchanged so the gateway emits the right one — an over-budget request must
   * stay actionable instead of degrading to a generic failure. Everything else
   * (401 secret mismatch, unmapped 5xx, network/timeout) → `AI_GENERATION_FAILED`.
   * Never rethrow raw axios — it can carry the request URL/headers.
   */
  private toClientError(err: unknown, requestId: string): AiClientError {
    const ALLOWED: readonly AiClientErrorCode[] = [
      'AI_NOT_CONFIGURED',
      'AI_GENERATION_FAILED',
      'AI_INPUT_TOO_LARGE',
    ];

    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const code = err.response?.data?.code as AiClientErrorCode | undefined;
      const message = err.response?.data?.message as string | undefined;
      // Only present when the LLM call succeeded but the turn failed (select miss);
      // forwarded so core can meter spent tokens on the failed audit row.
      const model = err.response?.data?.model as string | undefined;
      const usage = err.response?.data?.usage as AiTokenUsage | undefined;
      const providerRequestId = err.response?.data?.providerRequestId as string | undefined;
      const finishReason = err.response?.data?.finishReason as string | undefined;
      const attemptCount = err.response?.data?.attemptCount as number | undefined;

      // No response → network error / timeout (ECONNABORTED).
      if (!err.response) {
        this.logger.warn(
          `ai-service unreachable request_id=${requestId}: ${shortReason(err)}`,
        );
        return new AiClientError('AI_GENERATION_FAILED', 'AI generation failed.');
      }

      if (code && ALLOWED.includes(code)) {
        // ai-service gave us a contract code — pass it (and its message/model/usage) through.
        this.logger.warn(
          `ai-service error request_id=${requestId} status=${status} code=${code}`,
        );
        return new AiClientError(
          code,
          message ?? 'AI generation failed.',
          status,
          model,
          usage,
          providerRequestId,
          finishReason,
          attemptCount,
        );
      }

      // 401 secret mismatch / unmapped status — collapse to a generic failure.
      this.logger.warn(
        `ai-service returned unmapped status=${status} request_id=${requestId}: ${shortReason(err)}`,
      );
      return new AiClientError('AI_GENERATION_FAILED', 'AI generation failed.', status);
    }

    this.logger.warn(`ai-service call failed request_id=${requestId}: ${shortReason(err)}`);
    return new AiClientError('AI_GENERATION_FAILED', 'AI generation failed.');
  }
}

/** Reduce any error to a short, leak-free string for logs. */
function shortReason(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 200);
  return String(err).slice(0, 200);
}
