import { Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import type { AiGenerateDto } from '@wriven/contracts';
import { AiService } from './ai.service';
import { AiClientError, type AiClient } from './ai-client.interface';
import type { AiProfileService } from './ai-profile.service';
import type { CoreEntitlementsService } from '../entitlements/core-entitlements.service';
import { asDb, chain, chainOf, createDbMock } from '../testing/drizzle-mock';
import { configStub } from '../testing/config-stub';

const FIELDS = [
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'body', label: 'Body', type: 'richtext' },
];

function typeRow() {
  return { id: 'ct-1', name: 'Post', apiId: 'post', fields: FIELDS };
}

function dto(overrides: Partial<AiGenerateDto> = {}): AiGenerateDto {
  return {
    requestId: 'req-1',
    contentTypeId: 'ct-1',
    targetKind: 'field',
    fieldKey: 'body',
    intent: 'generate',
    ...overrides,
  } as AiGenerateDto;
}

function clientResult(overrides: Record<string, unknown> = {}) {
  return {
    output: { kind: 'scalar', text: 'Generated body text.' },
    model: 'meta/llama-3:free', // :free suffix → a real (zero) price rule
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    finishReason: 'stop',
    attemptCount: 1,
    providerRequestId: 'prov-1',
    ...overrides,
  };
}

function makeService(overrides: { limit?: unknown; generate?: jest.Mock } = {}) {
  const db = createDbMock();
  // `limit: null` is meaningful (unlimited) — only undefined falls back to 250.
  const limit = overrides.limit === undefined ? 250 : overrides.limit;
  const entitlements = {
    aiTextLimit: jest.fn().mockResolvedValue(limit),
  };
  const client = {
    configured: jest.fn().mockReturnValue(true),
    generate: overrides.generate ?? jest.fn().mockResolvedValue(clientResult()),
  };
  const profiles = { read: jest.fn().mockResolvedValue({ brandVoice: null }) };
  const service = new AiService(
    asDb(db),
    entitlements as unknown as CoreEntitlementsService,
    client as unknown as AiClient,
    profiles as unknown as AiProfileService,
    configStub({}),
  );
  return { service, db, entitlements, client, profiles };
}

/** Wire the in-tx reserve sequence: no existing row → insert → period count. */
function wireFreshReserve(db: ReturnType<typeof createDbMock>, periodCount: number) {
  db.__tx.select
    .mockImplementationOnce(() => chain([])) // existing idempotency row: none
    .mockImplementationOnce(() => chain([{ n: periodCount }]));
  db.__tx.insert.mockImplementationOnce(() => chain([{ id: 'gen-1' }]));
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    if (err instanceof RpcException) {
      return err.getError() as { code: string; message: string };
    }
    throw err;
  }
  throw new Error('expected rejection');
}

beforeAll(() => {
  Logger.overrideLogger([]);
});

const base = { workspaceId: 'ws-1', projectId: 'p1', userId: 'u1' };

describe('AiService.generate — validation before any metering', () => {
  it('unknown content type (or wrong workspace) → NOT_FOUND', async () => {
    const ctx = makeService();
    ctx.db.query.contentTypes.findFirst.mockResolvedValue(undefined);

    const err = await rejection(
      ctx.service.generate({ ...base, dto: dto() }),
    );
    expect(err.code).toBe('NOT_FOUND');
    expect(ctx.client.generate).not.toHaveBeenCalled();
  });

  it('ai-service unconfigured → AI_NOT_CONFIGURED, no reserve', async () => {
    const ctx = makeService();
    ctx.db.query.contentTypes.findFirst.mockResolvedValue(typeRow());
    ctx.client.configured.mockReturnValue(false);

    const err = await rejection(ctx.service.generate({ ...base, dto: dto() }));
    expect(err.code).toBe('AI_NOT_CONFIGURED');
    expect(ctx.db.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['entry compose with intent=refine', dto({ targetKind: 'entry' as never, intent: 'refine' })],
    ['entry compose with a preset', dto({ targetKind: 'entry' as never, preset: 'shorten' })],
    ['entry compose targeting a field', dto({ targetKind: 'entry' as never, fieldKey: 'body' })],
  ])('%s → VALIDATION_ERROR', async (_name, bad) => {
    const ctx = makeService();
    ctx.db.query.contentTypes.findFirst.mockResolvedValue(typeRow());

    const err = await rejection(ctx.service.generate({ ...base, dto: bad }));
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['unknown field key', dto({ fieldKey: 'nope' })],
    ['refine without source content', dto({ intent: 'refine', sourceContent: '  ' })],
    ['tone preset without an instruction', dto({ intent: 'refine', preset: 'tone' })],
  ])('%s → VALIDATION_ERROR', async (_name, bad) => {
    const ctx = makeService();
    ctx.db.query.contentTypes.findFirst.mockResolvedValue(typeRow());

    const err = await rejection(ctx.service.generate({ ...base, dto: bad }));
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('non-tier1 field type (number) → only text/richtext/select are eligible', async () => {
    const ctx = makeService();
    ctx.db.query.contentTypes.findFirst.mockResolvedValue({
      ...typeRow(),
      fields: [{ key: 'price', label: 'Price', type: 'number' }],
    });

    const err = await rejection(ctx.service.generate({ ...base, dto: dto({ fieldKey: 'price' }) }));
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toContain('text, richtext');
  });

  it('aiPrivate field → AI generation disabled for this field', async () => {
    const ctx = makeService();
    ctx.db.query.contentTypes.findFirst.mockResolvedValue({
      ...typeRow(),
      fields: [{ key: 'secret', label: 'Secret', type: 'text', aiPrivate: true }],
    });

    const err = await rejection(
      ctx.service.generate({ ...base, dto: dto({ fieldKey: 'secret' }) }),
    );
    expect(err.message).toContain('disabled for this field');
  });
});

describe('AiService.generate — happy path (field)', () => {
  it('reserves, calls the provider, finalizes succeeded, returns the result', async () => {
    const ctx = makeService({ limit: 250 });
    ctx.db.query.contentTypes.findFirst.mockResolvedValue(typeRow());
    wireFreshReserve(ctx.db, 5);

    const result = await ctx.service.generate({ ...base, dto: dto() });

    // Reserve: advisory lock + stale reclaim + pending insert inside one tx.
    expect(ctx.db.__tx.insert).toHaveBeenCalled();
    expect(ctx.entitlements.aiTextLimit).toHaveBeenCalledWith('ws-1');
    // Provider call carries the resolved field + profile.
    expect(ctx.client.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'generate',
        targetKind: 'field',
        field: expect.objectContaining({ key: 'body', type: 'richtext' }),
      }),
    );
    // Finalize wrote the audit outcome.
    expect(ctx.db.update).toHaveBeenCalled();
    const finalizeSet = chainOf(ctx.db.update).set.mock.calls[0][0] as Record<string, unknown>;
    expect(finalizeSet).toMatchObject({
      status: 'succeeded',
      model: 'meta/llama-3:free',
      totalTokens: 150,
      promptVersion: 'text-v4',
      attemptCount: 1,
      costMicrousd: 0, // :free suffix rule — priced, not guessed
    });
    expect(result).toMatchObject({
      generationId: 'gen-1',
      remaining: 245, // 250 - 5
      truncated: false,
    });
    expect(result.output).toEqual({ kind: 'scalar', text: 'Generated body text.' });
  });

  it('finishReason=length → truncated=true surfaced to the author', async () => {
    const ctx = makeService({ generate: jest.fn().mockResolvedValue(clientResult({ finishReason: 'length' })) });
    ctx.db.query.contentTypes.findFirst.mockResolvedValue(typeRow());
    wireFreshReserve(ctx.db, 1);

    const result = await ctx.service.generate({ ...base, dto: dto() });
    expect(result.truncated).toBe(true);
  });

  it('unlimited plan (limit null) → remaining null', async () => {
    const ctx = makeService({ limit: null });
    ctx.db.query.contentTypes.findFirst.mockResolvedValue(typeRow());
    ctx.db.__tx.select.mockImplementationOnce(() => chain([])); // existing: none
    ctx.db.__tx.insert.mockImplementationOnce(() => chain([{ id: 'gen-1' }]));
    // No count query on the unlimited path.

    const result = await ctx.service.generate({ ...base, dto: dto() });
    expect(result.remaining).toBeNull();
  });
});

describe('AiService.generate — provider failure', () => {
  it('AiClientError → audit row finalized failed, code passed through', async () => {
    const failure = new AiClientError(
      'AI_GENERATION_FAILED',
      'provider 500',
      502,
      'gpt-4o-mini',
      { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
    );
    const ctx = makeService({ generate: jest.fn().mockRejectedValue(failure) });
    ctx.db.query.contentTypes.findFirst.mockResolvedValue(typeRow());
    wireFreshReserve(ctx.db, 1);
    ctx.db.update.mockImplementationOnce(() => chain([]));

    const err = await rejection(ctx.service.generate({ ...base, dto: dto() }));

    expect(err.code).toBe('AI_GENERATION_FAILED');
    const finalizeSet = chainOf(ctx.db.update).set.mock.calls[0][0] as Record<string, unknown>;
    expect(finalizeSet).toMatchObject({
      status: 'failed',
      errorCode: 'AI_GENERATION_FAILED',
      totalTokens: 10, // spent tokens still metered on the failed row
    });
  });
});

describe('AiService.generate — quota gate', () => {
  it('period count over the limit → PLAN_LIMIT_REACHED, no provider call', async () => {
    const ctx = makeService({ limit: 5 });
    ctx.db.query.contentTypes.findFirst.mockResolvedValue(typeRow());
    wireFreshReserve(ctx.db, 6); // 6 > 5 after this insert

    const err = await rejection(ctx.service.generate({ ...base, dto: dto() }));
    expect(err.code).toBe('PLAN_LIMIT_REACHED');
    expect(ctx.client.generate).not.toHaveBeenCalled();
  });

  it('aiTextLimit failing closed → the error propagates before any reserve', async () => {
    const ctx = makeService();
    ctx.db.query.contentTypes.findFirst.mockResolvedValue(typeRow());
    const quota = new RpcException({ code: 'AI_QUOTA_UNAVAILABLE', message: 'down' });
    ctx.entitlements.aiTextLimit.mockRejectedValue(quota);

    await expect(ctx.service.generate({ ...base, dto: dto() })).rejects.toBe(quota);
    expect(ctx.db.transaction).not.toHaveBeenCalled();
  });
});

describe('AiService.generate — idempotency (requestId replay)', () => {
  function existingRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'gen-existing',
      requestHash: null, // set per test to match/mismatch
      status: 'succeeded',
      output: 'Stored text.',
      targetKind: 'field',
      model: 'gpt-4o-mini',
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      finishReason: 'stop',
      error: null,
      errorCode: null,
      ...overrides,
    };
  }

  /** Wire the reserve tx so the existing-row select returns `row`. */
  function wireExisting(db: ReturnType<typeof createDbMock>, row: unknown) {
    db.__tx.select.mockImplementationOnce(() => chain([row]));
  }

  it('same key + same input → replay without a provider call', async () => {
    const ctx = makeService({ limit: 100 });
    ctx.db.query.contentTypes.findFirst.mockResolvedValue(typeRow());

    // First call computes hash H1 from dto; wire the existing row with a hash
    // that will match by running the identical dto — simulate via capturing
    // the requestHash the service stores on a fresh reserve, then replay.
    ctx.db.__tx.select.mockImplementationOnce(() => chain([])); // no existing row
    ctx.db.__tx.insert.mockImplementationOnce(() => chain([{ id: 'gen-1' }]));
    ctx.db.__tx.select.mockImplementationOnce(() => chain([{ n: 1 }]));
    await ctx.service.generate({ ...base, dto: dto() });
    const storedHash = (chainOf(ctx.db.__tx.insert).values.mock.calls[0][0] as Record<string, unknown>)
      .requestHash as string;
    expect(storedHash).toMatch(/^[a-f0-9]{64}$/);

    // Second call with the identical dto → existing row with that hash replays.
    ctx.db.__tx.select.mockImplementationOnce(() =>
      chain([existingRow({ requestHash: storedHash })]),
    );
    ctx.db.__tx.select.mockImplementationOnce(() => chain([{ n: 1 }])); // replay remaining count
    const replay = await ctx.service.generate({ ...base, dto: dto() });

    expect(ctx.client.generate).toHaveBeenCalledTimes(1); // only the first call
    expect(replay.generationId).toBe('gen-existing');
    expect(replay.output).toEqual({ kind: 'scalar', text: 'Stored text.' });
    expect(replay.remaining).toBe(99);
  });

  it('same key + DIFFERENT input → IDEMPOTENCY_KEY_REUSED', async () => {
    const ctx = makeService();
    ctx.db.query.contentTypes.findFirst.mockResolvedValue(typeRow());
    wireExisting(ctx.db, existingRow({ requestHash: 'different-hash' }));

    const err = await rejection(ctx.service.generate({ ...base, dto: dto() }));
    expect(err.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('key still pending → AI_GENERATION_IN_PROGRESS', async () => {
    const ctx = makeService();
    ctx.db.query.contentTypes.findFirst.mockResolvedValue(typeRow());
    wireExisting(ctx.db, existingRow({ status: 'pending' }));

    const err = await rejection(ctx.service.generate({ ...base, dto: dto() }));
    expect(err.code).toBe('AI_GENERATION_IN_PROGRESS');
  });

  it('succeeded but redacted output → AI_RESULT_EXPIRED', async () => {
    const ctx = makeService();
    ctx.db.query.contentTypes.findFirst.mockResolvedValue(typeRow());
    wireExisting(ctx.db, existingRow({ output: null }));

    const err = await rejection(ctx.service.generate({ ...base, dto: dto() }));
    expect(err.code).toBe('AI_RESULT_EXPIRED');
  });

  it('previously failed key rethrows its ORIGINAL error code', async () => {
    const ctx = makeService();
    ctx.db.query.contentTypes.findFirst.mockResolvedValue(typeRow());
    wireExisting(
      ctx.db,
      existingRow({
        status: 'failed',
        output: null,
        error: 'provider 500',
        errorCode: 'AI_INPUT_TOO_LARGE',
      }),
    );

    const err = await rejection(ctx.service.generate({ ...base, dto: dto() }));
    expect(err.code).toBe('AI_INPUT_TOO_LARGE');
  });

  it('failed key with a legacy/unknown code falls back to AI_GENERATION_FAILED', async () => {
    const ctx = makeService();
    ctx.db.query.contentTypes.findFirst.mockResolvedValue(typeRow());
    wireExisting(ctx.db, existingRow({ status: 'failed', output: null, errorCode: null }));

    const err = await rejection(ctx.service.generate({ ...base, dto: dto() }));
    expect(err.code).toBe('AI_GENERATION_FAILED');
  });
});

describe('AiService.redactExpiredAuditData — retention', () => {
  it('nulls recoverable content past the window and reports the count', async () => {
    const ctx = makeService();
    ctx.db.update.mockImplementationOnce(() => chain([{ n: 7 }]));

    const n = await ctx.service.redactExpiredAuditData();

    expect(n).toBe(7);
    expect(chainOf(ctx.db.update).set).toHaveBeenCalledWith({
      output: null,
      requestHash: null,
    });
  });
});
