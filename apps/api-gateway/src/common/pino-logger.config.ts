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
 * - Credentials are redacted. Headers via explicit pino redact paths (no
 *   wildcards); query strings by scrubbing `req.url` to its path and dropping
 *   `req.query` — the Google OAuth callback (`?code=…&state=…`) must never
 *   reach the logs. Request/response BODIES are never logged — pino-http
 *   doesn't emit them by default; keep it that way (Stripe webhook bodies and
 *   auth payloads must not reach the logs).
 * - Request-log severity maps from status (customLogLevel): 5xx → error,
 *   4xx → warn, else info. pino-http's default emits everything at `info`,
 *   which would bury failed requests.
 * - `LOG_LEVEL` is the global floor: it is validated (an invalid value makes
 *   pino throw during NestFactory.create — with bufferLogs that crash-loops
 *   invisibly on Render) and only ever lowers verbosity, never the mapping
 *   above. `warn` quiets successful-request lines; 4xx/5xx still log.
 * - `transport` (pino-pretty) is enabled only when NODE_ENV is exactly
 *   'development'. Prod stays JSON-to-stdout (no worker threads); jest
 *   (NODE_ENV=test) must never resolve pino-pretty or the suite hangs on
 *   thread-stream workers. NODE_ENV is read from process.env deliberately:
 *   nx serve sets it (development) and render.yaml ships it in the shared
 *   env group (production); a NODE_ENV inside the app .env would not be
 *   visible here because this file is evaluated through ConfigService for
 *   LOG_LEVEL but boot-time env for NODE_ENV.
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ConfigService } from '@nestjs/config';
import { req as reqSerializer } from 'pino-std-serializers';

/** Paths that never produce a request log line (still get an x-request-id). */
const NOISY_PATHS = new Set(['/', '/v1/health']);

const VALID_LEVELS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);

/** Resolve LOG_LEVEL defensively — never let a bad value crash the boot. */
function resolveLevel(cfg: ConfigService): string {
  const raw = String(cfg.get<string>('LOG_LEVEL') ?? 'info').trim().toLowerCase();
  return VALID_LEVELS.has(raw) ? raw : 'info';
}

export function buildPinoHttpConfig(cfg: ConfigService) {
  return {
    level: resolveLevel(cfg),
    base: { service: 'api-gateway' },
    formatters: {
      // String level labels ("info") instead of numeric in JSON output.
      level: (label: string) => ({ level: label }),
    },
    customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
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
    // Standard req shape (pino-std-serializers) minus anything that could
    // carry a secret: url loses its query string, query is dropped.
    serializers: {
      req: (req: IncomingMessage) => {
        const serialized = reqSerializer(req);
        return {
          ...serialized,
          url: (serialized.url ?? '').split('?')[0],
          query: undefined,
        };
      },
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
