const UNITS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/**
 * Parse a human-readable duration to milliseconds.
 * Accepts `15m`, `1h`, `7d`, `45s`. A bare number is treated as seconds.
 */
export function durationToMs(value: string): number {
  const match = /^(\d+)\s*(s|m|h|d)?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration: "${value}"`);
  }
  const amount = Number(match[1]);
  const unit = match[2];
  return unit ? amount * UNITS[unit] : amount * 1000;
}
