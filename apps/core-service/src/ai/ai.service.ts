import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiGenerateDto,
  AiGenerateResult,
  ERROR_CODES,
  type AiOperation,
  type AiOutput,
  type AiTargetKind,
  type ErrorCodeKey,
  type FieldDef,
  type FieldType,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { currentPeriod } from '../common/period';
import { rpcError } from '../common/rpc-error';
import { CoreEntitlementsService } from '../entitlements/core-entitlements.service';
import * as schema from '../db/schema';
import {
  AI_CLIENT,
  AiClientError,
  type AiClient,
  type AiFieldType,
  type AiGenerateRequest,
  type AiProfile,
} from './ai-client.interface';
import { costMicrousdFor, resolveModelPrice, type ModelPrice } from './ai-model-prices';
import { AiProfileService } from './ai-profile.service';

const { contentTypes, contentEntries, aiGenerations } = schema;

/** Fields eligible for AI generation (Tier 1). */
const TIER1: readonly FieldType[] = ['text', 'richtext', 'select'];
const STALE_RESERVATION_SQL = sql`now() - interval '5 minutes'`;
// v4: topical anchor in both prompts — whatever the instruction asks, the
// answer must be publishable field/entry content, never chat (off-topic or
// injected instructions included). v3: last-position output guardrail. v2:
// fenced <voice_guide> voice-profile injection.
const TEXT_PROMPT_VERSION = 'text-v4';

type Reservation =
  | { kind: 'reserved'; generationId: string; remaining: number | null }
  | {
      kind: 'replay';
      generationId: string;
      output: AiOutput;
      model: string;
      usage: { promptTokens: number; completionTokens: number; totalTokens: number };
      remaining: number | null;
      truncated: boolean;
    };

function isTier1Type(type: FieldType): type is AiFieldType {
  return TIER1.includes(type);
}

/**
 * Collapse (targetKind, intent, preset) into the operation persisted on the
 * audit row. The editor only offers "generate" and "refine", but the provider
 * still gets a tight per-verb prompt — a specific template beats a generic
 * "revise as instructed" on weak free models.
 */
function deriveOperation(dto: AiGenerateDto): AiOperation {
  if (dto.targetKind === 'entry') return 'compose';
  if (dto.intent === 'generate') return 'generate';
  return dto.preset ?? 'refine';
}

@Injectable()
export class AiService {
  /**
   * Step-level trace logger; requestId correlates a generation across all
   * three services. Log only ids, enums, tokens, durations, and outcome
   * codes — never field content, instructions, or provider payloads.
   */
  private readonly logger = new Logger('AiService');
  private readonly auditRetentionDays: number;
  /**
   * Env-configured list price for the deployment's default model, used only
   * when the returned model has no rule in ai-model-prices. Null unless both
   * halves are set (never a half-price).
   */
  private readonly envDefaultPrice: ModelPrice | null;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly entitlements: CoreEntitlementsService,
    @Inject(AI_CLIENT) private readonly client: AiClient,
    private readonly profiles: AiProfileService,
    cfg: ConfigService,
  ) {
    const configured = Number(cfg.get<string>('AI_AUDIT_RETENTION_DAYS') ?? '30');
    // Blank/NaN env → 30: `Number('')` is 0, which would otherwise clamp to a
    // 1-day retention window on a stray `AI_AUDIT_RETENTION_DAYS=` line.
    this.auditRetentionDays =
      Number.isInteger(configured) && configured >= 1
        ? Math.min(configured, 365)
        : 30;
    const inputRate = configuredTokenRate(
      cfg.get<string>('AI_INPUT_COST_MICROUSD_PER_MILLION_TOKENS'),
    );
    const outputRate = configuredTokenRate(
      cfg.get<string>('AI_OUTPUT_COST_MICROUSD_PER_MILLION_TOKENS'),
    );
    this.envDefaultPrice =
      inputRate == null || outputRate == null
        ? null
        : { inputPerMillion: inputRate, outputPerMillion: outputRate };
  }

  async generate(p: {
    workspaceId: string;
    projectId: string;
    userId: string;
    dto: AiGenerateDto;
  }): Promise<AiGenerateResult> {
    const { workspaceId, projectId, userId, dto } = p;
    const requestHash = generationRequestHash(dto);

    const type = await this.db.query.contentTypes.findFirst({
      where: and(
        eq(contentTypes.id, dto.contentTypeId),
        eq(contentTypes.workspaceId, workspaceId),
        eq(contentTypes.projectId, projectId),
        isNull(contentTypes.deletedAt),
      ),
    });
    if (!type) throw rpcError('NOT_FOUND', 'Content type not found.');

    const fields = (type.fields ?? []) as FieldDef[];
    const operation = deriveOperation(dto);

    // Fail fast: missing AI_SERVICE_URL/INTERNAL_SECRET → 503 here; a reachable
    // but key-less ai-service returns AI_NOT_CONFIGURED through the client.
    if (!this.client.configured()) {
      throw rpcError(
        'AI_NOT_CONFIGURED',
        'AI generation is not configured for this workspace.',
      );
    }

    // Absent profile = empty guidance, never blocks. Single indexed read,
    // uncached by design.
    const profile: AiProfile = await this.profiles.read(projectId);

    const isEligible = (f: FieldDef): boolean =>
      isTier1Type(f.type) && !f.multiple && !f.aiPrivate;

    let req: AiGenerateRequest;
    let targetFieldKey: string | null;

    if (dto.targetKind === 'entry') {
      // One generation, one quota unit — no matter how many fields it fills.
      if (dto.intent !== 'generate') {
        throw rpcError(
          'VALIDATION_ERROR',
          'Whole-entry drafting can only generate a new draft.',
        );
      }
      if (dto.preset) {
        throw rpcError(
          'VALIDATION_ERROR',
          'Refine actions apply to a single field, not a whole entry.',
        );
      }
      if (dto.fieldKey) {
        throw rpcError(
          'VALIDATION_ERROR',
          'Whole-entry drafting does not target a field.',
        );
      }
      // Compose never reads entry data, so scope-check explicitly — an
      // arbitrary id must not reach the audit row.
      if (dto.entryId) {
        const entry = await this.db.query.contentEntries.findFirst({
          where: and(
            eq(contentEntries.id, dto.entryId),
            eq(contentEntries.workspaceId, workspaceId),
            eq(contentEntries.projectId, projectId),
            eq(contentEntries.contentTypeId, type.id),
            isNull(contentEntries.deletedAt),
          ),
          columns: { id: true },
        });
        if (!entry) throw rpcError('NOT_FOUND', 'Content entry not found.');
      }
      const composeFields = fields.filter(isEligible).map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type as AiFieldType,
        options: f.options,
      }));
      if (composeFields.length === 0) {
        throw rpcError(
          'VALIDATION_ERROR',
          'This content type has no AI-eligible fields to draft.',
        );
      }
      targetFieldKey = null;
      req = {
        requestId: dto.requestId,
        operation,
        targetKind: 'entry',
        contentTypeName: type.name,
        composeFields,
        // History isn't forwarded — compose is a one-shot draft and ignores it.
        instruction: dto.instruction,
        profile,
      };
    } else {
      if (!dto.fieldKey) {
        throw rpcError('VALIDATION_ERROR', 'A target field is required.');
      }
      const field = fields.find((f) => f.key === dto.fieldKey);
      if (!field) {
        throw rpcError('VALIDATION_ERROR', `Unknown field "${dto.fieldKey}".`);
      }
      if (!isTier1Type(field.type) || field.multiple) {
        throw rpcError(
          'VALIDATION_ERROR',
          'AI generation is only available on text, richtext, and single-value select fields.',
        );
      }
      if (field.aiPrivate) {
        throw rpcError('VALIDATION_ERROR', 'AI generation is disabled for this field.');
      }
      if (dto.preset && dto.intent !== 'refine') {
        throw rpcError(
          'VALIDATION_ERROR',
          'A refine action is only valid when refining existing content.',
        );
      }
      if (field.type === 'select' && operation !== 'generate') {
        throw rpcError('VALIDATION_ERROR', 'Select fields can only be generated.');
      }
      if (dto.intent === 'refine' && !dto.sourceContent?.trim()) {
        throw rpcError(
          'VALIDATION_ERROR',
          'Current field content is required for AI refinement.',
        );
      }
      // `tone` has no dedicated input — the author's instruction carries the
      // target tone.
      if (operation === 'tone' && !dto.instruction?.trim()) {
        throw rpcError('VALIDATION_ERROR', 'Describe the tone you want.');
      }

      // Before the quota reserve — a stale entry must fail without leaving a
      // metered pending row.
      const siblingValues = dto.entryId
        ? await this.siblingValues({
            workspaceId,
            projectId,
            contentTypeId: type.id,
            entryId: dto.entryId,
            fieldKey: field.key,
            fields,
            allowedFieldKeys: field.aiContextFields ?? [],
          })
        : undefined;
      targetFieldKey = field.key;
      req = {
        requestId: dto.requestId,
        operation,
        targetKind: 'field',
        contentTypeName: type.name,
        field: {
          key: field.key,
          label: field.label,
          type: field.type,
          options: field.options,
        },
        sourceContent: dto.sourceContent,
        siblingValues,
        history: dto.history,
        instruction: dto.instruction,
        profile,
      };
    }

    // Quota reserve: advisory lock + pending row. The limit resolves outside
    // the lock so an auth round-trip never extends the lock hold.
    this.logger.log(
      `ai.generate step=validated request_id=${dto.requestId} operation=${operation} ` +
        `target=${targetFieldKey ?? 'entry'} content_type=${type.id} profile=${profile.brandVoice ? 'set' : 'empty'}`,
    );
    const limit = await this.entitlements.aiTextLimit(workspaceId);
    const reservation = await this.reserveQuota({
      workspaceId,
      projectId,
      userId,
      dto,
      operation,
      targetKind: dto.targetKind,
      fieldKey: targetFieldKey,
      contentTypeId: type.id,
      limit,
      requestHash,
    });
    if (reservation.kind === 'replay') {
      this.logger.log(
        `ai.generate step=reserved request_id=${dto.requestId} outcome=replay generation=${reservation.generationId}`,
      );
      return {
        generationId: reservation.generationId,
        output: reservation.output,
        model: reservation.model,
        usage: reservation.usage,
        remaining: reservation.remaining,
        truncated: reservation.truncated,
      };
    }

    this.logger.log(
      `ai.generate step=reserved request_id=${dto.requestId} outcome=reserved ` +
        `generation=${reservation.generationId} remaining=${reservation.remaining ?? 'unlimited'}`,
    );
    const startedAt = Date.now();
    try {
      const result = await this.client.generate(req);
      this.logger.log(
        `ai.generate step=provider-complete request_id=${dto.requestId} ` +
          `model=${result.model} total_tokens=${result.usage.totalTokens} ` +
          `finish_reason=${result.finishReason ?? 'unknown'} attempts=${result.attemptCount}`,
      );
      await this.finalize(reservation.generationId, 'succeeded', result.model, result.usage, {
        output: storedOutputText(result.output),
        promptVersion: TEXT_PROMPT_VERSION,
        latencyMs: Date.now() - startedAt,
        attemptCount: result.attemptCount,
        providerRequestId: result.providerRequestId,
        finishReason: result.finishReason,
      });
      this.logger.log(
        `ai.generate step=finalized request_id=${dto.requestId} outcome=succeeded ` +
          `generation=${reservation.generationId} latency_ms=${Date.now() - startedAt}`,
      );
      return {
        generationId: reservation.generationId,
        output: result.output,
        model: result.model,
        usage: result.usage,
        remaining: reservation.remaining,
        // 'length' = the provider hit the output cap; the author must know.
        truncated: result.finishReason === 'length',
      };
    } catch (err) {
      // AiClientError carries a contract code — map it through unchanged;
      // RpcException (e.g. the quota throw) rethrows as-is.
      if (err instanceof AiClientError) {
        // model/usage set only when the LLM call succeeded but the turn failed.
        this.logger.warn(
          `ai.generate step=provider-failed request_id=${dto.requestId} code=${err.code} ` +
            `model=${err.model ?? 'unknown'} total_tokens=${err.usage?.totalTokens ?? 0} ` +
            `attempts=${err.attemptCount ?? 1} duration_ms=${Date.now() - startedAt}`,
        );
        await this.finalize(reservation.generationId, 'failed', err.model, err.usage, {
          error: err.message,
          errorCode: err.code,
          latencyMs: Date.now() - startedAt,
          attemptCount: err.attemptCount,
          providerRequestId: err.providerRequestId,
          finishReason: err.finishReason,
        });
        throw rpcError(err.code, err.message);
      }
      throw err;
    }
  }

  /**
   * Redact recoverable audit content once the replay window has elapsed;
   * operational metadata survives for metering and incident review.
   */
  async redactExpiredAuditData(): Promise<number> {
    const cutoff = new Date(
      Date.now() - this.auditRetentionDays * 24 * 60 * 60 * 1000,
    );
    const rows = await this.db
      .update(aiGenerations)
      .set({ output: null, requestHash: null })
      .where(
        and(
          lt(aiGenerations.createdAt, cutoff),
          or(isNotNull(aiGenerations.output), isNotNull(aiGenerations.requestHash)),
        ),
      )
      // Window count instead of materializing ids into Node — retention can
      // touch thousands of rows.
      .returning({ n: sql<number>`count(*) over ()` });
    return rows[0]?.n ?? 0;
  }

  /**
   * Insert a pending row under a per-workspace advisory lock, then count this
   * period's reserved+succeeded rows. Over limit → throw; the txn rolls back
   * and discards the pending row, so no quota is consumed and no provider
   * call happens.
   */
  private async reserveQuota(p: {
    workspaceId: string;
    projectId: string;
    userId: string;
    dto: AiGenerateDto;
    operation: AiOperation;
    targetKind: AiTargetKind;
    /** Resolved target key, or null for a whole-entry `compose`. */
    fieldKey: string | null;
    contentTypeId: string;
    limit: number | null;
    requestHash: string;
  }): Promise<Reservation> {
    const {
      workspaceId,
      projectId,
      userId,
      dto,
      operation,
      targetKind,
      fieldKey,
      contentTypeId,
      limit,
      requestHash,
    } = p;
    // UTC month boundary, shared with /usage and stats. Never date_trunc(now()) —
    // that resolves in the DB session timezone and can straddle the boundary.
    const periodStart = currentPeriod().start;

    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${workspaceId})::bigint)`,
      );
      // A process can die between reserve and finalize — reclaim stale rows
      // under the same lock so they can't block the whole billing period.
      await tx
        .update(aiGenerations)
        .set({
          status: 'failed',
          error: 'generation reservation expired before completion',
          completedAt: new Date(),
        })
        .where(
          and(
            eq(aiGenerations.workspaceId, workspaceId),
            eq(aiGenerations.status, 'pending'),
            sql`${aiGenerations.createdAt} < ${STALE_RESERVATION_SQL}`,
          ),
        );
      const reservedThisPeriod = async (): Promise<number> => {
        const [{ n }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(aiGenerations)
          .where(
            and(
              eq(aiGenerations.workspaceId, workspaceId),
              inArray(aiGenerations.status, ['pending', 'succeeded']),
              gte(aiGenerations.createdAt, periodStart),
            ),
          );
        return n;
      };
      const [existing] = await tx
        .select({
          id: aiGenerations.id,
          requestHash: aiGenerations.requestHash,
          status: aiGenerations.status,
          output: aiGenerations.output,
          targetKind: aiGenerations.targetKind,
          model: aiGenerations.model,
          promptTokens: aiGenerations.promptTokens,
          completionTokens: aiGenerations.completionTokens,
          totalTokens: aiGenerations.totalTokens,
          finishReason: aiGenerations.finishReason,
          error: aiGenerations.error,
          errorCode: aiGenerations.errorCode,
        })
        .from(aiGenerations)
        .where(
          and(
            eq(aiGenerations.workspaceId, workspaceId),
            eq(aiGenerations.createdBy, userId),
            eq(aiGenerations.idempotencyKey, dto.requestId),
          ),
        )
        .limit(1);

      if (existing) {
        if (existing.requestHash && existing.requestHash !== requestHash) {
          this.logger.warn(
            `ai.generate step=reserve request_id=${dto.requestId} outcome=rejected reason=idempotency-key-reused`,
          );
          throw rpcError(
            'IDEMPOTENCY_KEY_REUSED',
            'This request key was already used for different generation input.',
          );
        }
        if (existing.status === 'pending') {
          this.logger.warn(
            `ai.generate step=reserve request_id=${dto.requestId} outcome=rejected reason=still-in-progress generation=${existing.id}`,
          );
          throw rpcError(
            'AI_GENERATION_IN_PROGRESS',
            'This generation is still in progress. Retry the same request shortly.',
          );
        }
        if (existing.status === 'succeeded') {
          if (existing.output == null) {
            // Retention redacted the result — replay window over; don't report
            // it as a generic failure.
            this.logger.warn(
              `ai.generate step=reserve request_id=${dto.requestId} outcome=rejected reason=result-expired generation=${existing.id}`,
            );
            throw rpcError(
              'AI_RESULT_EXPIRED',
              'The stored result for this request has expired. Start a new generation.',
            );
          }
          const remaining =
            limit == null ? null : Math.max(limit - (await reservedThisPeriod()), 0);
          return {
            kind: 'replay',
            generationId: existing.id,
            output: reconstructOutput(existing.targetKind, existing.output),
            model: existing.model,
            usage: {
              promptTokens: existing.promptTokens ?? 0,
              completionTokens: existing.completionTokens ?? 0,
              totalTokens: existing.totalTokens ?? 0,
            },
            remaining,
            truncated: existing.finishReason === 'length',
          };
        }
        // Rethrow the original code so a retried key keeps its status class
        // (422 stays 422). Pre-error_code rows fall back to AI_GENERATION_FAILED.
        const storedCode = existing.errorCode;
        const replayCode: ErrorCodeKey =
          storedCode && storedCode in ERROR_CODES
            ? (storedCode as ErrorCodeKey)
            : 'AI_GENERATION_FAILED';
        throw rpcError(
          replayCode,
          existing.error ?? 'The previous generation request failed. Start a new generation to retry.',
        );
      }

      const [row] = await tx
        .insert(aiGenerations)
        .values({
          workspaceId,
          projectId,
          contentTypeId,
          entryId: dto.entryId,
          fieldKey,
          targetKind,
          operation,
          idempotencyKey: dto.requestId,
          requestHash,
          model: '', // finalized after the provider call
          status: 'pending',
          createdBy: userId,
        })
        .returning({ id: aiGenerations.id });

      if (limit == null) {
        // Explicitly unlimited plan — entitlement lookup failures fail closed
        // in aiTextLimit().
        return { kind: 'reserved', generationId: row.id, remaining: null };
      }

      const n = await reservedThisPeriod();

      if (n > limit) {
        this.logger.warn(
          `ai.generate step=reserve request_id=${dto.requestId} outcome=rejected reason=plan-limit-reached limit=${limit}`,
        );
        throw rpcError(
          'PLAN_LIMIT_REACHED',
          `Your plan allows ${limit} AI generations per month. Upgrade for more.`,
        );
      }
      return { kind: 'reserved', generationId: row.id, remaining: Math.max(limit - n, 0) };
    });
  }

  /** Finalize a pending row with the outcome + token totals. */
  private async finalize(
    pendingId: string,
    status: 'succeeded' | 'failed',
    model?: string,
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number },
    opts?: {
      error?: string;
      /** Persisted so a retried failed key rethrows its original status class. */
      errorCode?: string;
      output?: string;
      promptVersion?: string;
      latencyMs?: number;
      attemptCount?: number;
      providerRequestId?: string;
      finishReason?: string;
    },
  ): Promise<void> {
    await this.db
      .update(aiGenerations)
      .set({
        status,
        model: model ?? '',
        promptTokens: usage?.promptTokens ?? null,
        completionTokens: usage?.completionTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        output: opts?.output ?? null,
        promptVersion: opts?.promptVersion ?? TEXT_PROMPT_VERSION,
        latencyMs: opts?.latencyMs ?? null,
        attemptCount: opts?.attemptCount ?? 1,
        providerRequestId: opts?.providerRequestId ?? null,
        finishReason: opts?.finishReason ?? null,
        costMicrousd: costMicrousdFor(usage, resolveModelPrice(model, this.envDefaultPrice)),
        error: opts?.error ?? null,
        errorCode: opts?.errorCode ?? null,
        completedAt: new Date(),
      })
      .where(eq(aiGenerations.id, pendingId));
  }

  /** Sibling field values from an entry, fenced upstream as untrusted data. */
  private async siblingValues(p: {
    workspaceId: string;
    projectId: string;
    contentTypeId: string;
    entryId: string;
    fieldKey: string;
    fields: FieldDef[];
    allowedFieldKeys: string[];
  }): Promise<{ label: string; value: string }[]> {
    const entry = await this.db.query.contentEntries.findFirst({
      where: and(
        eq(contentEntries.id, p.entryId),
        eq(contentEntries.workspaceId, p.workspaceId),
        eq(contentEntries.projectId, p.projectId),
        eq(contentEntries.contentTypeId, p.contentTypeId),
        isNull(contentEntries.deletedAt),
      ),
    });
    if (!entry) throw rpcError('NOT_FOUND', 'Content entry not found.');
    // Context is opt-in per target field, so unrelated CMS data never reaches
    // a provider just because it shares an entry.
    if (p.allowedFieldKeys.length === 0) return [];
    const allowed = new Set(p.allowedFieldKeys);
    const data = (entry.data ?? {}) as Record<string, unknown>;
    const out: { label: string; value: string }[] = [];
    for (const f of p.fields) {
      if (f.key === p.fieldKey || f.aiPrivate || !allowed.has(f.key)) continue;
      const v = data[f.key];
      if (v == null) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        out.push({ label: f.label, value: String(v) });
      }
    }
    return out;
  }
}

/** Hash only explicit client input—never prompt/context—so no CMS data is duplicated in audit. */
function generationRequestHash(dto: AiGenerateDto): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        contentTypeId: dto.contentTypeId,
        entryId: dto.entryId ?? null,
        targetKind: dto.targetKind,
        fieldKey: dto.fieldKey ?? null,
        intent: dto.intent,
        preset: dto.preset ?? null,
        instruction: dto.instruction ?? null,
        sourceContent: dto.sourceContent ?? null,
        history: dto.history ?? [],
      }),
    )
    .digest('hex');
}

/** Canonical audit form: scalar text, or the record's fields as JSON.
 * reconstructOutput() is its inverse. */
function storedOutputText(output: AiOutput): string {
  return output.kind === 'record' ? JSON.stringify(output.fields) : output.text;
}

/** Rebuild the typed output from a stored row for idempotent replay. */
function reconstructOutput(targetKind: string, stored: string): AiOutput {
  if (targetKind === 'entry') {
    try {
      const fields = JSON.parse(stored) as Record<string, string>;
      return { kind: 'record', fields };
    } catch {
      // Don't crash a replay on malformed stored JSON.
      return { kind: 'record', fields: {} };
    }
  }
  return { kind: 'scalar', text: stored };
}

/** Optional non-negative micro-USD / one-million-token deployment setting. */
function configuredTokenRate(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
