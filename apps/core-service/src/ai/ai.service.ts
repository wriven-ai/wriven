import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiGenerateDto,
  AiGenerateResult,
  type FieldDef,
  type FieldType,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import { CoreEntitlementsService } from '../entitlements/core-entitlements.service';
import * as schema from '../db/schema';
import {
  AI_CLIENT,
  AiClientError,
  type AiClient,
  type AiGenerateRequest,
} from './ai-client.interface';

const { contentTypes, contentEntries, aiGenerations } = schema;

/** Fields eligible for AI generation (Tier 1). */
const TIER1: readonly FieldType[] = ['text', 'richtext', 'select'];
const REFINEMENT_OPERATIONS = new Set([
  'expand',
  'shorten',
  'rewrite',
  'tone',
  'summarize',
  'continue',
]);
const STALE_RESERVATION_SQL = sql`now() - interval '5 minutes'`;
const TEXT_PROMPT_VERSION = 'text-v1';

type Reservation =
  | { kind: 'reserved'; generationId: string; remaining: number | null }
  | {
      kind: 'replay';
      generationId: string;
      text: string;
      model: string;
      usage: { promptTokens: number; completionTokens: number; totalTokens: number };
      remaining: number | null;
    };

/** Type guard: narrows a `FieldType` to the Tier-1 types (avoids an `as` cast). */
function isTier1Type(type: FieldType): type is AiGenerateRequest['field']['type'] {
  return TIER1.includes(type);
}

@Injectable()
export class AiService {
  private readonly auditRetentionDays: number;
  private readonly inputCostMicrousdPerMillionTokens: number | null;
  private readonly outputCostMicrousdPerMillionTokens: number | null;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly entitlements: CoreEntitlementsService,
    @Inject(AI_CLIENT) private readonly client: AiClient,
    cfg: ConfigService,
  ) {
    const configured = Number(cfg.get<string>('AI_AUDIT_RETENTION_DAYS') ?? '30');
    this.auditRetentionDays = Number.isInteger(configured)
      ? Math.min(Math.max(configured, 1), 365)
      : 30;
    this.inputCostMicrousdPerMillionTokens = configuredTokenRate(
      cfg.get<string>('AI_INPUT_COST_MICROUSD_PER_MILLION_TOKENS'),
    );
    this.outputCostMicrousdPerMillionTokens = configuredTokenRate(
      cfg.get<string>('AI_OUTPUT_COST_MICROUSD_PER_MILLION_TOKENS'),
    );
  }

  async generate(p: {
    workspaceId: string;
    projectId: string;
    userId: string;
    dto: AiGenerateDto;
  }): Promise<AiGenerateResult> {
    const { workspaceId, projectId, userId, dto } = p;
    const requestHash = generationRequestHash(dto);

    // 1. Load + validate the target field.
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
    if (field.aiPrivate || field.aiAssist === false) {
      throw rpcError(
        'VALIDATION_ERROR',
        'AI generation is disabled for this field.',
      );
    }
    if (field.aiOperations?.length && !field.aiOperations.includes(dto.operation)) {
      throw rpcError('VALIDATION_ERROR', 'This AI action is disabled for this field.');
    }
    if (field.type === 'select' && dto.operation !== 'generate') {
      throw rpcError('VALIDATION_ERROR', 'Select fields only support the generate AI action.');
    }
    if (
      REFINEMENT_OPERATIONS.has(dto.operation) &&
      !dto.sourceContent?.trim()
    ) {
      throw rpcError(
        'VALIDATION_ERROR',
        'Current field content is required for AI refinement.',
      );
    }
    if (dto.operation === 'tone' && !dto.tone?.trim()) {
      throw rpcError('VALIDATION_ERROR', 'A target tone is required.');
    }

    // 2. Fail fast if the ai-service client isn't configured (no boot failure —
    //    missing AI_SERVICE_URL/INTERNAL_SECRET returns 503; a reachable but
    //    key-less ai-service returns AI_NOT_CONFIGURED through the client).
    if (!this.client.configured()) {
      throw rpcError(
        'AI_NOT_CONFIGURED',
        'AI generation is not configured for this workspace.',
      );
    }

    // 3. Build the context payload before reserving quota. A bad/stale entry
    //    must fail without leaving a metered `pending` reservation behind.
    const siblingValues = dto.entryId
      ? await this.siblingValues({
          workspaceId,
          projectId,
          contentTypeId: type.id,
          entryId: dto.entryId,
          fieldKey: dto.fieldKey,
          fields,
          allowedFieldKeys: field.aiContextFields ?? [],
        })
      : undefined;
    const req: AiGenerateRequest = {
      requestId: dto.requestId,
      operation: dto.operation,
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
      tone: dto.tone,
    };

    // 4. Atomic quota reserve (advisory lock + pending row). Limit resolves
    //    OUTSIDE the lock so an auth round-trip never extends the lock hold.
    const limit = await this.entitlements.aiTextLimit(workspaceId);
    const reservation = await this.reserveQuota(
      workspaceId,
      projectId,
      userId,
      dto,
      type.id,
      limit,
      requestHash,
    );
    if (reservation.kind === 'replay') {
      return {
        generationId: reservation.generationId,
        text: reservation.text,
        model: reservation.model,
        usage: reservation.usage,
        remaining: reservation.remaining,
      };
    }

    // 5. Generate via ai-service (HTTP). Prompt building, temperature, and
    //    `select` option validation/retry all live in the Python service now.
    const startedAt = Date.now();
    try {
      const result = await this.client.generate(req);
      await this.finalize(reservation.generationId, 'succeeded', result.model, result.usage, {
        output: result.text,
        promptVersion: TEXT_PROMPT_VERSION,
        latencyMs: Date.now() - startedAt,
        attemptCount: result.attemptCount,
        providerRequestId: result.providerRequestId,
        finishReason: result.finishReason,
      });
      return {
        generationId: reservation.generationId,
        text: result.text,
        model: result.model,
        usage: result.usage,
        remaining: reservation.remaining,
      };
    } catch (err) {
      // AiClientError carries a contract code (AI_NOT_CONFIGURED or
      // AI_GENERATION_FAILED) from the ai-service — map it through unchanged.
      // RpcException (already mapped, e.g. the quota throw) rethrows as-is.
      if (err instanceof AiClientError) {
        // err.model/err.usage present only when the LLM call succeeded but the
        // turn failed (select miss) — record the spent tokens on the failed row.
        await this.finalize(reservation.generationId, 'failed', err.model, err.usage, {
          error: err.message,
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
      .returning({ id: aiGenerations.id });
    return rows.length;
  }

  /**
   * Insert a `pending` row under a per-workspace advisory lock, then count
   * reserved+succeeded rows this period. Over limit → throws (txn rolls back,
   * discarding the pending row, so no quota is consumed and no provider call
   * happens). Returns the pending row id + remaining count.
   */
  private async reserveQuota(
    workspaceId: string,
    projectId: string,
    userId: string,
    dto: AiGenerateDto,
    contentTypeId: string,
    limit: number | null,
    requestHash: string,
  ): Promise<Reservation> {
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
              sql`${aiGenerations.createdAt} >= date_trunc('month', now())`,
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
          model: aiGenerations.model,
          promptTokens: aiGenerations.promptTokens,
          completionTokens: aiGenerations.completionTokens,
          totalTokens: aiGenerations.totalTokens,
          error: aiGenerations.error,
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
          throw rpcError(
            'IDEMPOTENCY_KEY_REUSED',
            'This request key was already used for different generation input.',
          );
        }
        if (existing.status === 'pending') {
          throw rpcError(
            'AI_GENERATION_IN_PROGRESS',
            'This generation is still in progress. Retry the same request shortly.',
          );
        }
        if (existing.status === 'succeeded' && existing.output != null) {
          const remaining =
            limit == null ? null : Math.max(limit - (await reservedThisPeriod()), 0);
          return {
            kind: 'replay',
            generationId: existing.id,
            text: existing.output,
            model: existing.model,
            usage: {
              promptTokens: existing.promptTokens ?? 0,
              completionTokens: existing.completionTokens ?? 0,
              totalTokens: existing.totalTokens ?? 0,
            },
            remaining,
          };
        }
        throw rpcError(
          'AI_GENERATION_FAILED',
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
          fieldKey: dto.fieldKey,
          operation: dto.operation,
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
        costMicrousd: this.costMicrousd(usage),
        error: opts?.error ?? null,
        completedAt: new Date(),
      })
      .where(eq(aiGenerations.id, pendingId));
  }

  /**
   * Provider prices are deployment configuration because they vary by model and
   * contract. Do not infer a price from a model name: missing or incomplete
   * configuration stays null so finance can distinguish "unknown" from free.
   */
  private costMicrousd(
    usage?: { promptTokens: number; completionTokens: number },
  ): number | null {
    if (
      !usage ||
      this.inputCostMicrousdPerMillionTokens == null ||
      this.outputCostMicrousdPerMillionTokens == null
    ) {
      return null;
    }
    return Math.round(
      (usage.promptTokens * this.inputCostMicrousdPerMillionTokens +
        usage.completionTokens * this.outputCostMicrousdPerMillionTokens) /
        1_000_000,
    );
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
        fieldKey: dto.fieldKey,
        operation: dto.operation,
        instruction: dto.instruction ?? null,
        sourceContent: dto.sourceContent ?? null,
        tone: dto.tone ?? null,
        history: dto.history ?? [],
      }),
    )
    .digest('hex');
}

/** Optional non-negative micro-USD / one-million-token deployment setting. */
function configuredTokenRate(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
