import { ClientProxy } from '@nestjs/microservices';
import { ERROR_CODES } from '@wriven/contracts';
import type { ServiceError } from '@wriven/contracts';
import { firstValueFrom, timeout, TimeoutError } from 'rxjs';

/**
 * Default deadline for one gateway → downstream TCP round-trip. Generous for
 * ordinary CRUD (services answer in well under a second); its job is not to
 * tune latency but to bound damage — 2026-09-13, a wedged core-service DB
 * pool left every proxied request (and its browser skeleton) pending forever.
 * Overrides belong at the call site (see ai.controller's provider-budget
 * timeouts), not in a longer global default.
 */
export const DEFAULT_TCP_TIMEOUT_MS = 10_000;

/**
 * Bound one TCP send with a hard deadline. ClientTCP sends never time out on
 * their own — a write into a socket whose server died mid-restart, or whose
 * handler is wedged on a stalled DB connection, never errors the observable —
 * so every gateway send must go through here (or pipe `timeout()` itself).
 *
 * A deadline miss becomes the leak-free GATEWAY_TIMEOUT envelope (504, not
 * 502: nothing was computed). Downstream errors pass through untouched for
 * the AllExceptionsFilter to forward.
 */
export async function sendWithTimeout<T>(
  client: ClientProxy,
  pattern: string,
  payload: unknown,
  timeoutMs: number = DEFAULT_TCP_TIMEOUT_MS,
): Promise<T> {
  try {
    return await firstValueFrom(
      client.send<T>(pattern, payload).pipe(timeout(timeoutMs)),
    );
  } catch (err) {
    if (err instanceof TimeoutError) {
      const error: ServiceError = {
        code: ERROR_CODES.GATEWAY_TIMEOUT.code,
        message: 'The request timed out. Please try again.',
        statusCode: ERROR_CODES.GATEWAY_TIMEOUT.statusCode,
      };
      throw error;
    }
    throw err;
  }
}
