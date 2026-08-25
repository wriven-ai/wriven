import { durationToHuman, durationToMs } from './duration';

describe('durationToMs', () => {
  it.each([
    ['45s', 45_000],
    ['15m', 900_000],
    ['1h', 3_600_000],
    ['7d', 604_800_000],
  ])('parses %s', (input, expected) => {
    expect(durationToMs(input)).toBe(expected);
  });

  it('treats a bare number as seconds', () => {
    expect(durationToMs('30')).toBe(30_000);
  });

  it('tolerates whitespace between amount and unit', () => {
    expect(durationToMs('15 m')).toBe(900_000);
    expect(durationToMs('  2h ')).toBe(7_200_000);
  });

  it.each(['5x', 'abc', '', 'm', '-5d', '1.5h'])(
    'throws on invalid input %p',
    (input) => {
      expect(() => durationToMs(input)).toThrow('Invalid duration');
    },
  );
});

describe('durationToHuman', () => {
  it.each([
    ['1h', '1 hour'],
    ['24h', '24 hours'],
    ['45m', '45 minutes'],
    ['1m', '1 minute'],
    ['2d', '2 days'],
    ['1s', '1 second'],
    ['30', '30 seconds'],
  ])('formats %s as %s', (input, expected) => {
    expect(durationToHuman(input)).toBe(expected);
  });

  it('throws on invalid input', () => {
    expect(() => durationToHuman('nope')).toThrow('Invalid duration');
  });
});
