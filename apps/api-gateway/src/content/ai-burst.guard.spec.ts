import { HttpException } from '@nestjs/common';
import { AiBurstGuard } from './ai-burst.guard';
import { httpContext } from '../testing/http';

const MINUTE = 60_000;

function fire(guard: AiBurstGuard, workspaceId = 'ws-1'): boolean | never {
  return guard.canActivate(httpContext({ workspaceId }));
}

afterEach(() => {
  jest.useRealTimers();
});

describe('AiBurstGuard — sliding-window burst throttle', () => {
  it('no workspace context → pass through (auth guards own the failure)', () => {
    const guard = new AiBurstGuard();
    expect(guard.canActivate(httpContext({}))).toBe(true);
  });

  it('10 requests inside the window pass; the 11th throws 429', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const guard = new AiBurstGuard();

    for (let i = 0; i < 10; i++) {
      expect(fire(guard)).toBe(true);
      jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z').getTime() + i * 1_000);
    }

    expect(() => fire(guard)).toThrow(HttpException);
    try {
      fire(guard);
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(429);
    }
  });

  it('window slides: an old burst stops counting after 60s', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const guard = new AiBurstGuard();

    for (let i = 0; i < 10; i++) fire(guard); // full bucket at t=0
    expect(() => fire(guard)).toThrow(HttpException);

    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z').getTime() + MINUTE + 1_000);
    expect(fire(guard)).toBe(true); // old hits expired out of the window
  });

  it('workspaces are throttled independently', () => {
    const guard = new AiBurstGuard();
    for (let i = 0; i < 10; i++) fire(guard, 'ws-1');
    expect(() => fire(guard, 'ws-1')).toThrow(HttpException);
    expect(fire(guard, 'ws-2')).toBe(true); // unaffected
  });

  it('idle workspaces are swept from the map (bounded memory)', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const guard = new AiBurstGuard();
    fire(guard, 'ws-idle');

    const hits = (guard as unknown as { hits: Map<string, number[]> }).hits;
    expect(hits.has('ws-idle')).toBe(true);

    // Advance past a full window so the next activation sweeps.
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z').getTime() + MINUTE + 2_000);
    fire(guard, 'ws-active');
    expect(hits.has('ws-idle')).toBe(false); // idle entry dropped
    expect(hits.has('ws-active')).toBe(true);
  });
});
