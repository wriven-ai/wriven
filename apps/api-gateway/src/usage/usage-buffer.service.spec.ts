import { USAGE_PATTERNS, type UsageBucket } from '@wriven/contracts';
import { UsageBufferService } from './usage-buffer.service';
import { configStub } from '../testing/config-stub';

function makeService(map: Record<string, unknown> = {}) {
  const emit = jest.fn();
  const core = { emit } as never;
  const service = new UsageBufferService(
    core,
    configStub({ USAGE_FLUSH_INTERVAL_MS: 15_000, USAGE_FLUSH_THRESHOLD: 100, ...map }),
  );
  return { service, emit };
}

afterEach(() => {
  jest.useRealTimers();
});

describe('UsageBufferService.bump — in-process counting', () => {
  it('aggregates requests per workspace+period into one bucket', () => {
    const { service, emit } = makeService();

    service.bump('ws-1');
    service.bump('ws-1');
    service.bump('ws-1');

    expect(emit).not.toHaveBeenCalled(); // below threshold, nothing flushed
    const buckets = (service as unknown as { buffer: Map<string, UsageBucket> }).buffer;
    expect(buckets.size).toBe(1);
    expect([...buckets.values()][0].requestCount).toBe(3);
  });

  it('distinct workspaces get distinct buckets', () => {
    const { service } = makeService();

    service.bump('ws-1');
    service.bump('ws-2');

    const buckets = (service as unknown as { buffer: Map<string, UsageBucket> }).buffer;
    expect(buckets.size).toBe(2);
    expect([...buckets.values()].every((b) => b.requestCount === 1)).toBe(true);
  });

  it('a month boundary splits buckets — period tagged at bump time', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-31T23:59:00.000Z'));
    const { service } = makeService();

    service.bump('ws-1');
    jest.setSystemTime(new Date('2026-02-01T00:01:00.000Z'));
    service.bump('ws-1');

    const buckets = [...(service as unknown as { buffer: Map<string, UsageBucket> }).buffer.values()];
    expect(buckets).toHaveLength(2);
    expect(buckets[0].periodStart).toMatch(/^2026-01-01/);
    expect(buckets[1].periodStart).toMatch(/^2026-02-01/);
  });
});

describe('UsageBufferService.flush — batched emit to core', () => {
  it('drains the buffer in one RECORD emit and clears it', async () => {
    const { service, emit } = makeService();
    service.bump('ws-1');
    service.bump('ws-1');

    await service.flush();

    expect(emit).toHaveBeenCalledTimes(1);
    const [pattern, payload] = emit.mock.calls[0];
    expect(pattern).toBe(USAGE_PATTERNS.RECORD);
    expect(payload.buckets).toHaveLength(1);
    expect(payload.buckets[0]).toMatchObject({ workspaceId: 'ws-1', requestCount: 2 });

    await service.flush(); // buffer cleared — no second emit
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('empty buffer → no emit', async () => {
    const { service, emit } = makeService();
    await service.flush();
    expect(emit).not.toHaveBeenCalled();
  });

  it('threshold crossing flushes inline (threshold counts distinct buckets)', () => {
    const { service, emit } = makeService({ USAGE_FLUSH_THRESHOLD: 3 });

    service.bump('ws-1');
    service.bump('ws-1'); // same bucket — size still 1
    expect(emit).not.toHaveBeenCalled();
    service.bump('ws-2'); // size 2
    service.bump('ws-3'); // size hits 3 → flush
    expect(emit).toHaveBeenCalledTimes(1);
    const { buckets } = emit.mock.calls[0][1];
    expect(buckets).toHaveLength(3);
    expect(buckets.find((b: UsageBucket) => b.workspaceId === 'ws-1').requestCount).toBe(2);
  });
});

describe('UsageBufferService — lifecycle', () => {
  it('bootstrap starts the interval; destroy drains and stops it', async () => {
    jest.useFakeTimers();
    const { service, emit } = makeService();

    service.onApplicationBootstrap();
    service.bump('ws-1');
    jest.advanceTimersByTime(15_000); // interval fires → background flush

    service.onModuleDestroy();
    await Promise.resolve(); // let the best-effort final drain settle

    expect(emit.mock.calls.every((c) => c[0] === USAGE_PATTERNS.RECORD)).toBe(true);
    expect(emit).toHaveBeenCalled();
  });
});
