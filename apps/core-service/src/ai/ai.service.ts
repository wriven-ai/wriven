import { Inject, Injectable } from '@nestjs/common';
import {
  AiGenerateDto,
  AiGenerateResult,
  type FieldDef,
  type FieldType,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import { CoreEntitlementsService } from '../entitlements/core-entitlements.service';
import * as schema from '../db/schema';
import { AI_PROVIDER, AiProviderError } from './ai-provider.interface';
import type { AiProvider } from './ai-provider.interface';
import { buildMessages, temperatureFor, type PromptContext } from './ai-prompt';

const { contentTypes, contentEntries, aiGenerations } = schema;

/** Fields eligible for AI generation (Tier 1). */
const TIER1: readonly FieldType[] = ['text', 'richtext', 'select'];

@Injectable()
export class AiService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    private readonly entitlements: CoreEntitlementsService,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  async generate(p: {
    workspaceId: string;
    projectId: string;
    userId: string;
    dto: AiGenerateDto;
  }): Promise<AiGenerateResult> {
    const { workspaceId, projectId, userId, dto } = p;

    // 1. Load + validate the target field.
    const type = await this.db.query.contentTypes.findFirst({
      where: and(
        eq(contentTypes.id, dto.contentTypeId),
        eq(contentTypes.workspaceId, workspaceId),
        isNull(contentTypes.deletedAt),
      ),
    });
    if (!type) throw rpcError('NOT_FOUND', 'Content type not found.');

    const fields = (type.fields ?? []) as FieldDef[];
    const field = fields.find((f) => f.key === dto.fieldKey);
    if (!field) {
      throw rpcError('VALIDATION_ERROR', `Unknown field "${dto.fieldKey}".`);
    }
    if (!TIER1.includes(field.type)) {
      throw rpcError(
        'VALIDATION_ERROR',
        'AI generation is only available on text, richtext, and select fields.',
      );
    }
    if (field.aiAssist === false) {
      throw rpcError(
        'VALIDATION_ERROR',
        'AI generation is disabled for this field.',
      );
    }

    // 2. Fail fast if the provider isn't configured (no boot failure — see spec).
    if (!this.provider.configured()) {
      throw rpcError(
        'AI_NOT_CONFIGURED',
        'AI generation is not configured for this workspace.',
      );
    }

    // 3. Atomic quota reserve (advisory lock + pending row). Limit resolves
    //    OUTSIDE the lock so an auth round-trip never extends the lock hold.
    const limit = await this.entitlements.aiTextLimit(workspaceId);
    const { pendingId, remaining } = await this.reserveQuota(
      workspaceId,
      projectId,
      userId,
      dto,
      type.id,
      limit,
    );

    // 4. Build the prompt (sibling entry values fenced as untrusted data).
    const siblingValues = dto.entryId
      ? await this.siblingValues(workspaceId, dto.entryId, dto.fieldKey, fields)
      : undefined;
    const ctx: PromptContext = {
      contentTypeName: type.name,
      fieldLabel: field.label,
      fieldKey: field.key,
      fieldType: field.type,
      options: field.options,
      siblingValues,
      instruction: dto.instruction,
      tone: dto.tone,
      history: dto.history,
    };
    const messages = buildMessages(ctx, dto.operation);
    const temperature = temperatureFor(dto.operation, field.type);

    // 5. Generate (with one retry for `select` if the model misses the options).
    try {
      let result = await this.provider.generate({ messages, temperature });
      if (field.type === 'select' && field.options?.length) {
        if (!field.options.includes(result.text.trim())) {
          // Retry once — free models can't be trusted with constrained output.
          result = await this.provider.generate({ messages, temperature });
        }
        if (!field.options.includes(result.text.trim())) {
          // Still missing → unconstrainable. No quota charge (failed rows don't count).
          await this.finalize(pendingId, 'failed', result.model, result.usage, {
            error: 'select option miss after retry',
          });
          throw rpcError(
            'AI_GENERATION_FAILED',
            'The model could not produce a valid option. Please try again.',
          );
        }
        result = { ...result, text: result.text.trim() };
      }

      await this.finalize(pendingId, 'succeeded', result.model, result.usage);
      return {
        text: result.text,
        model: result.model,
        usage: result.usage,
        remaining,
      };
    } catch (err) {
      // AiProviderError → map to AI_GENERATION_FAILED. RpcException (already
      // mapped, e.g. the select-miss above) rethrows unchanged.
      if (err instanceof AiProviderError) {
        await this.finalize(pendingId, 'failed', undefined, undefined, {
          error: err.message,
        });
        throw rpcError('AI_GENERATION_FAILED', err.message);
      }
      throw err;
    }
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
  ): Promise<{ pendingId: string; remaining: number | null }> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${workspaceId})::bigint)`,
      );
      const [row] = await tx
        .insert(aiGenerations)
        .values({
          workspaceId,
          projectId,
          contentTypeId,
          entryId: dto.entryId,
          fieldKey: dto.fieldKey,
          operation: dto.operation,
          model: '', // finalized after the provider call
          status: 'pending',
          createdBy: userId,
        })
        .returning({ id: aiGenerations.id });

      if (limit == null) {
        // Unmetered / limit unresolvable (fail-open, consistent with other quotas).
        return { pendingId: row.id, remaining: null };
      }

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

      if (n > limit) {
        throw rpcError(
          'PLAN_LIMIT_REACHED',
          `Your plan allows ${limit} AI generations per month. Upgrade for more.`,
        );
      }
      return { pendingId: row.id, remaining: Math.max(limit - n, 0) };
    });
  }

  /** Finalize a pending row with the outcome + token totals. */
  private async finalize(
    pendingId: string,
    status: 'succeeded' | 'failed',
    model?: string,
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number },
    opts?: { error?: string },
  ): Promise<void> {
    await this.db
      .update(aiGenerations)
      .set({
        status,
        model: model ?? '',
        promptTokens: usage?.promptTokens ?? null,
        completionTokens: usage?.completionTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        error: opts?.error ?? null,
      })
      .where(eq(aiGenerations.id, pendingId));
  }

  /** Sibling field values from an entry, fenced upstream as untrusted data. */
  private async siblingValues(
    workspaceId: string,
    entryId: string,
    fieldKey: string,
    fields: FieldDef[],
  ): Promise<{ label: string; value: string }[]> {
    const entry = await this.db.query.contentEntries.findFirst({
      where: and(
        eq(contentEntries.id, entryId),
        eq(contentEntries.workspaceId, workspaceId),
        isNull(contentEntries.deletedAt),
      ),
    });
    if (!entry) return [];
    const data = (entry.data ?? {}) as Record<string, unknown>;
    const out: { label: string; value: string }[] = [];
    for (const f of fields) {
      if (f.key === fieldKey) continue;
      const v = data[f.key];
      if (v == null) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        out.push({ label: f.label, value: String(v) });
      }
    }
    return out;
  }
}
