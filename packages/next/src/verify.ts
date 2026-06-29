import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify a Wriven webhook signature. Constant-time compare over the **raw** body
 * with a timestamp replay guard. Header keys must be lowercase (as produced by
 * iterating a `Request.headers`).
 */
export function verifyWrivenSignature(
  rawBody: string,
  headers: Record<string, string>,
  secret: string,
  options?: { toleranceMs?: number },
): boolean {
  const timestamp = headers['x-wriven-timestamp'] ?? '';
  const signature = headers['x-wriven-signature'] ?? '';
  if (!timestamp || !signature) return false;

  const tolerance = options?.toleranceMs ?? 5 * 60_000;
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed) || Math.abs(Date.now() - parsed) > tolerance) return false;

  const expected =
    'sha256=' +
    createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
