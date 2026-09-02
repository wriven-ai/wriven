import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ConfigService } from '@nestjs/config';
import { buildPinoHttpConfig } from './pino-logger.config';

/** Minimal ConfigService stand-in — the factory only calls `.get`. */
const cfg = (values: Record<string, string> = {}) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const req = (url: string) => ({ url }) as unknown as IncomingMessage;

describe('buildPinoHttpConfig', () => {
  it('defaults level to info and honors LOG_LEVEL', () => {
    expect(buildPinoHttpConfig(cfg()).level).toBe('info');
    expect(buildPinoHttpConfig(cfg({ LOG_LEVEL: 'warn' })).level).toBe('warn');
  });

  it('redacts credential headers by explicit path', () => {
    const paths = buildPinoHttpConfig(cfg()).redact.paths;
    for (const p of [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["set-cookie"]',
      'res.headers["set-cookie"]',
      'req.headers["x-api-key"]',
    ]) {
      expect(paths).toContain(p);
    }
  });

  it('ignores health/noise paths, including querystrings', () => {
    const ignore = buildPinoHttpConfig(cfg()).autoLogging.ignore;
    expect(ignore(req('/'))).toBe(true);
    expect(ignore(req('/v1/health'))).toBe(true);
    expect(ignore(req('/v1/health?x=1'))).toBe(true);
    expect(ignore(req('/v1/auth/login'))).toBe(false);
    expect(ignore(req('/v1/projects/p1/content/hero'))).toBe(false);
    expect(ignore(req(undefined as never))).toBe(false);
  });

  it('generates a UUID request id and echoes it on the response — inbound header ignored', () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => void (headers[k] = v),
    } as unknown as ServerResponse;
    const id = buildPinoHttpConfig(cfg()).genReqId(req('/'), res);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers['x-request-id']).toBe(id);
  });

  it('uses no transport outside development (prod JSON, jest worker-free)', () => {
    expect(buildPinoHttpConfig(cfg()).transport).toBeUndefined();
  });
});
