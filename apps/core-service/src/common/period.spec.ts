import { currentPeriod } from './period';

describe('currentPeriod', () => {
  afterEach(() => jest.useRealTimers());

  it('returns UTC calendar-month boundaries', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-15T12:34:56.789Z'));
    expect(currentPeriod()).toEqual({
      start: new Date('2026-01-01T00:00:00.000Z'),
      end: new Date('2026-02-01T00:00:00.000Z'),
    });
  });

  it('rolls into January across the year boundary', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-12-31T23:59:59.999Z'));
    expect(currentPeriod()).toEqual({
      start: new Date('2026-12-01T00:00:00.000Z'),
      end: new Date('2027-01-01T00:00:00.000Z'),
    });
  });

  it('uses UTC even when the local clock is in another month', () => {
    // 2026-01-01T00:30 UTC is still 2025-12-31 in UTC-5 local time.
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:30:00.000Z'));
    const { start } = currentPeriod();
    expect(start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});
