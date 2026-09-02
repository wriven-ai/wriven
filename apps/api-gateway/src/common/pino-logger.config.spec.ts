import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ConfigService } from '@nestjs/config';
import { buildPinoHttpConfig } from './pino-logger.config';

/** Minimal ConfigService stand-in — the factory only calls `.get`. */
const cfg = (values: Record<string, string> = {}) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const req = (url: string, headers: Record<string, string> = {}) =>
  ({ url, headers }) as unknown as IncomingMessage;

const res = (statusCode = 200) => {
  const headers: Record<string, string> = {};
  return {
    statusCode,
    setHeader: (k: string, v: string) => void (headers[k] = v),
    headers,
  } as unknown as ServerResponse;
};

describe('buildPinoHttpConfig', () => {
  it('defaults level to info and honors a valid LOG_LEVEL (case-insensitive)', () => {
    expect(buildPinoHttpConfig(cfg()).level).toBe('info');
    expect(buildPinoHttpConfig(cfg({ LOG_LEVEL: 'warn' })).level).toBe('warn');
    expect(buildPinoHttpConfig(cfg({ LOG_LEVEL: ' ERROR ' })).level).toBe('error');
  });

  it('falls back to info on an invalid/empty LOG_LEVEL instead of crashing pino', () => {
    // pino throws `default level must be included in custom levels` on a bad
    // value — with bufferLogs that crash-loops invisibly on Render.
    expect(buildPinoHttpConfig(cfg({ LOG_LEVEL: '' })).level).toBe('info');
    expect(buildPinoHttpConfig(cfg({ LOG_LEVEL: 'verbose' })).level).toBe('info');
    expect(buildPinoHttpConfig(cfg({ LOG_LEVEL: 'warning' })).level).toBe('info');
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

  it('serializes req without its query string (OAuth callback codes never log)', () => {
    const serialized = buildPinoHttpConfig(cfg()).serializers.req(
      req('/v1/auth/google/callback?code=4%2F0AVG7SECRET&state=csrf123', {
        'user-agent': 'test/1',
      }),
    );
    expect(serialized.url).toBe('/v1/auth/google/callback');
    expect(JSON.stringify(serialized)).not.toContain('0AVG7SECRET');
    expect(serialized.query).toBeUndefined();
    // Non-secret fields pass through the standard serializer.
    expect(serialized.headers['user-agent']).toBe('test/1');
  });

  it('maps request-log severity from status: 5xx error, 4xx warn, else info', () => {
    const customLogLevel = buildPinoHttpConfig(cfg()).customLogLevel;
    expect(customLogLevel(req('/x'), res(502), undefined)).toBe('error');
    expect(customLogLevel(req('/x'), res(500), undefined)).toBe('error');
    expect(customLogLevel(req('/x'), res(500), new Error('x'))).toBe('error');
    expect(customLogLevel(req('/x'), res(422), undefined)).toBe('warn');
    expect(customLogLevel(req('/x'), res(404), undefined)).toBe('warn');
    expect(customLogLevel(req('/x'), res(201), undefined)).toBe('info');
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
    const config = buildPinoHttpConfig(cfg());
    // Poisoned inbound header: a trusted implementation would reuse it.
    const poisoned = req('/v1/auth/login', { 'x-request-id': '1; DROP TABLE logs' });
    const result = config.genReqId(poisoned, res());
    expect(result).toMatch(/^[0-9a-f-]{36}$/);
    expect(result).not.toBe('1; DROP TABLE logs');
  });

  it('echoes the generated id on the response', () => {
    const headers: Record<string, string> = {};
    const mockRes = {
      setHeader: (k: string, v: string) => void (headers[k] = v),
    } as unknown as ServerResponse;
    const id = buildPinoHttpConfig(cfg()).genReqId(req('/'), mockRes);
    expect(headers['x-request-id']).toBe(id);
  });

  it('uses no transport outside development (prod JSON, jest worker-free)', () => {
    expect(buildPinoHttpConfig(cfg()).transport).toBeUndefined();
  });

  it('pins the pino-pretty transport to development only', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const transport = buildPinoHttpConfig(cfg()).transport;
      expect(transport).toBeDefined();
      expect(transport?.target).toBe('pino-pretty');
      expect(transport?.options.ignore).toContain('service');
    } finally {
      if (original === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = original;
    }
  });
});
