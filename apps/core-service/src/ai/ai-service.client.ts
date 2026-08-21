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
 * The only LLM-adjacent code in core-service — no LLM SDK here, prompt building
 * lives in Python. Auth is the shared INTERNAL_SECRET header; the provider key
 * never leaves ai-service env.
 */
@Injectable()
export class AiServiceClient implements AiClient {
  private readonly logger = new Logger(AiServiceClient.name);
  private readonly http: AxiosInstance;
  private readonly configuredUrl: boolean;

  constructor(cfg: ConfigService) {
    const baseUrl = cfg.get<string>('AI_SERVICE_URL');
    const secret = cfg.get<string>('INTERNAL_SECRET');
    // Must exceed ai-service's own provider timeout — if both are 30s, core
    // abandons the request just as ai-service finalizes it, inviting duplicate
    // paid retries. AI_TIMEOUT_MS is the legacy fallback name.
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
   * A 2xx is not a contract (a proxy or stale deployment can answer with HTML):
   * validate before returning so a malformed success takes the failed-row path
   * instead of crashing mid-finalize.
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
   * Map any axios failure to AiClientError: known ai-service codes pass through
   * unchanged, everything else (401, unmapped 5xx, network) becomes
   * AI_GENERATION_FAILED. Never rethrow raw axios — it carries URL/headers.
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
      // Set only when the LLM call succeeded but the turn failed (select miss).
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
