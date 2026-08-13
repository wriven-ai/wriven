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

const UNIT_LABELS: Record<string, string> = {
  s: 'second',
  m: 'minute',
  h: 'hour',
  d: 'day',
};

/**
 * Format a human-readable duration into a friendlier phrase, e.g.
 * `1h` → `1 hour`, `24h` → `24 hours`, `45m` → `45 minutes`. Used to phrase
 * "this link expires in …" mail copy accurately from the configured TTLs.
 */
export function durationToHuman(value: string): string {
  const match = /^(\d+)\s*(s|m|h|d)?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration: "${value}"`);
  }
  const amount = Number(match[1]);
  const unit = match[2] ?? 's';
  const noun = UNIT_LABELS[unit];
  return `${amount} ${noun}${amount === 1 ? '' : 's'}`;
}
