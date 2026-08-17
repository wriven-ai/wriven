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
// Bumped to v4: a topical anchor added to both prompts — whatever the
// instruction asks, the answer is publishable field/entry content, never chat
// (off-topic or injected instructions included). v3 added the last-position
// output guardrail; v2 injected the per-project AI profile (brand voice /
// glossary / language) as a fenced <voice_guide>.
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

/** Type guard: narrows a `FieldType` to the Tier-1 types (avoids an `as` cast). */
function isTier1Type(type: FieldType): type is AiFieldType {
  return TIER1.includes(type);
}

/**
 * Collapse the author-facing `(targetKind, intent, preset)` triple into the
 * operation persisted on the audit row.
 *
 * The editor only offers "generate" and "refine" (plus preset chips), but the
 * provider still receives a tight per-verb prompt: on a weak free model a
 * specific template beats one generic "revise as instructed" by a wide margin.
 * The UI collapse is presentational; the engine keeps every operation.
 */
function deriveOperation(dto: AiGenerateDto): AiOperation {
  if (dto.targetKind === 'entry') return 'compose';
  if (dto.intent === 'generate') return 'generate';
  return dto.preset ?? 'refine';
}

@Injectable()
export class AiService {
  /**
   * Step-level trace logger. The browser's requestId correlates a generation
   * across all three hops (gateway → core → ai-service logs it too). Log only
   * ids, enums, tokens, durations, and outcome codes — never field content,
   * instructions, or provider payloads.
   */
  private readonly logger = new Logger('AiService');
  private readonly auditRetentionDays: number;
  /**
   * Env-configured list price for the deployment's default model, used only as a
   * fallback when the returned model has no rule in `ai-model-prices`. Both
   * halves must be set or it is null (never a half-price).
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

    // 1. Load the content type that owns the target.
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

    // 2. Fail fast if the ai-service client isn't configured (no boot failure —
    //    missing AI_SERVICE_URL/INTERNAL_SECRET returns 503; a reachable but
    //    key-less ai-service returns AI_NOT_CONFIGURED through the client).
    if (!this.client.configured()) {
      throw rpcError(
        'AI_NOT_CONFIGURED',
        'AI generation is not configured for this workspace.',
      );
    }

    // 3. Load the per-project AI profile (brand voice / glossary / language)
    //    before reserving quota. Absent profile = empty guidance; never blocks.
    //    One indexed single-row read — deliberately uncached.
    const profile: AiProfile = await this.profiles.read(projectId);

    // 4. Validate the target + build the ai-service request per target kind.
    //    Eligibility is derived, not configured: a field is a valid target when
    //    it is Tier-1, single-valued, and not marked sensitive.
    const isEligible = (f: FieldDef): boolean =>
      isTier1Type(f.type) && !f.multiple && !f.aiPrivate;

    let req: AiGenerateRequest;
    let targetFieldKey: string | null;

    if (dto.targetKind === 'entry') {
      // Whole-entry composition drafts every eligible field in one call — one
      // generation, one quota unit, regardless of how many fields it fills.
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
      // The compose path never reads entry data (no sibling context), so the
      // entry's existence/scope must be checked explicitly — an arbitrary id
      // must not land in the audit/provenance row.
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
        // Compose is a one-shot whole-entry draft — multi-turn history doesn't
        // apply, so it isn't forwarded (Python's build_compose_messages ignores
        // it; sending it was dead payload).
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
      // `tone` has no dedicated input any more — the author's instruction carries
      // the target tone, so an empty instruction would leave the model guessing.
      if (operation === 'tone' && !dto.instruction?.trim()) {
        throw rpcError('VALIDATION_ERROR', 'Describe the tone you want.');
      }

      // Build sibling context before reserving quota. A bad/stale entry must
      // fail without leaving a metered `pending` reservation behind.
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

    // 5. Atomic quota reserve (advisory lock + pending row). Limit resolves
    //    OUTSIDE the lock so an auth round-trip never extends the lock hold.
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

    // 6. Generate via ai-service (HTTP). Prompt building, temperature, and
    //    `select`/`compose` output validation + retry all live in Python now.
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
        // Persist a canonical text form for idempotent replay: the scalar text,
        // or the record serialized as JSON (reconstructed on replay by targetKind).
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
        // The provider hit the output cap — the author is looking at a partial
        // answer and must be told, not silently handed truncated content.
        truncated: result.finishReason === 'length',
      };
    } catch (err) {
      // AiClientError carries a contract code (AI_NOT_CONFIGURED,
      // AI_GENERATION_FAILED, or AI_INPUT_TOO_LARGE) from the ai-service — map
      // it through unchanged. RpcException (already mapped, e.g. the quota
      // throw) rethrows as-is.
      if (err instanceof AiClientError) {
        // err.model/err.usage present only when the LLM call succeeded but the
        // turn failed (select miss) — record the spent tokens on the failed row.
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
   * Redact the only recoverable content kept in the audit row once its
   * idempotency-recovery window has elapsed. The durable operational metadata
   * remains available for metering, cost reconciliation, and incident review.
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
      // Window count instead of materializing every redacted id into Node —
      // retention days can touch thousands of rows.
      .returning({ n: sql<number>`count(*) over ()` });
    return rows[0]?.n ?? 0;
  }

  /**
   * Insert a `pending` row under a per-workspace advisory lock, then count
   * reserved+succeeded rows this period. Over limit → throws (txn rolls back,
   * discarding the pending row, so no quota is consumed and no provider call
   * happens). Returns the pending row id + remaining count.
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
      // A process can die after reserving quota but before finalizing the row.
      // Reclaim stale reservations while holding the same workspace lock so they
      // cannot block every future generation in the billing period.
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
            // Retention redacted the stored result — the replay window for this
            // key is over. Distinct from a failure: never report a
            // succeeded-but-expired request as a generic error.
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
            // Reconstruct the typed output from the canonical stored text.
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
        // Failed row: rethrow the ORIGINAL code so a retried key keeps its
        // status class (422 input-too-large stays 422 on retry). Rows written
        // before the error_code column existed carry no stored code, and an
        // unknown stored value must never crash the registry lookup.
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
        // Explicitly unlimited plan. Entitlement lookup failures are rejected by
        // aiTextLimit(), because paid AI generation must fail closed.
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
      /** Contract error code persisted beside `error` so a retried failed key
       *  rethrows with its original status class. */
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
    // Context is opt-in per target field. This prevents unrelated CMS data from
    // reaching a provider merely because it happens to share an entry.
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

/**
 * Canonical text form of an output for the audit row's `output` column: the
 * scalar text, or the record's fields serialized as JSON. `reconstructOutput`
 * is its inverse, keyed by the row's `target_kind`.
 */
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
      // A malformed stored record shouldn't crash a replay; return empty.
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
