/**
 * Structured (JSON) request logging for the gateway, built on pino-http via
 * nestjs-pino. One line per HTTP request — method, path, status, duration,
 * server-generated request id — mirroring ai-service's per-request log.
 *
 * Policy decisions baked in here:
 * - The inbound `x-request-id` header is NEVER trusted. The gateway is the
 *   public edge; only the internet could send it (core never calls the
 *   gateway, Render health checks send none), so honoring it would let
 *   callers poison correlation ids or inject content into log lines. The id
 *   is always generated here and echoed back on the response.
 * - Health/liveness probes are excluded from request logging (`/` and
 *   `/v1/health` — Render healthCheckPath, Docker HEALTHCHECK, and external
 *   pollers). They still receive an `x-request-id` response header.
 * - Credentials are redacted by explicit path enumeration (pino redaction
 *   supports no wildcards). Request/response BODIES are never logged —
 *   pino-http doesn't emit them by default; keep it that way (Stripe
 *   webhook bodies and auth payloads must not reach the logs).
 * - `transport` (pino-pretty) is enabled only when NODE_ENV is exactly
 *   'development'. Prod stays JSON-to-stdout (no worker threads); jest
 *   (NODE_ENV=test) must never resolve pino-pretty or the suite hangs on
 *   thread-stream workers.
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ConfigService } from '@nestjs/config';

/** Paths that never produce a request log line (still get an x-request-id). */
const NOISY_PATHS = new Set(['/', '/v1/health']);

export function buildPinoHttpConfig(cfg: ConfigService) {
  return {
    level: cfg.get<string>('LOG_LEVEL') ?? 'info',
    base: { service: 'api-gateway' },
    formatters: {
      // String level labels ("info") instead of numeric in JSON output.
      level: (label: string) => ({ level: label }),
    },
    redact: {
      censor: '[REDACTED]',
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["set-cookie"]',
        'res.headers["set-cookie"]',
        'req.headers["x-api-key"]',
      ],
    },
    genReqId: (_req: IncomingMessage, res: ServerResponse) => {
      const id = randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
    autoLogging: {
      ignore: (req: IncomingMessage) =>
        NOISY_PATHS.has((req.url ?? '').split('?')[0]),
    },
    transport:
      process.env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname,service',
            },
          }
        : undefined,
  };
}
