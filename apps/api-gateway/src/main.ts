/**
 * api-gateway — the only service exposed to the internet.
 * HTTP in, TCP out to internal NestJS services.
 */

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app/app.module';
import { CsrfGuard } from './auth/csrf.guard';
import { resolveCorsPolicy } from './common/cors-policy';

async function bootstrap() {
  // rawBody: true exposes req.rawBody (Buffer) so the Stripe webhook route can
  // verify signatures over the exact bytes Stripe signed. Parsed req.body is
  // still populated for every other route.
  // bufferLogs: true holds pre-bootstrap lines until the pino logger is bound
  // below, so nothing is emitted before the structured logger exists.
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });

  // Route ALL logging (Nest boot messages + every Logger.error/warn/log call
  // site in controllers, filters, interceptors) through the pino logger.
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Express 5's default query parser is the `simple` querystring parser, which
  // does NOT expand bracket notation — `filter[category]=news` would arrive as
  // a literal "filter[category]" key instead of nesting into `{ filter }`. The
  // Delivery API + SDK rely on `filter[field]=value`, so use the bundled `qs`
  // parser (extended) that expands it.
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void })
    .set('query parser', 'extended');

  // Trust exactly one proxy hop (Render's LB). Without this Express ignores
  // X-Forwarded-For and every request appears to come from the load balancer —
  // rate limiting (ProxyAwareThrottlerGuard) and any IP logging would merge
  // all visitors into one bucket. One hop only: the client-most XFF entry
  // stays untrusted (spoofable by the sender), which the throttler guard's
  // CF-Connecting-IP-first lookup already accounts for.
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void })
    .set('trust proxy', 1);

  const globalPrefix = 'v1';
  // The public Delivery API mounts at /v1/projects/:projectId/... alongside
  // the management routes, so exclude it from the global prefix — otherwise
  // its path doubles to /v1/v1/projects/... . Wildcard syntax is
  // path-to-regexp v8.
  app.setGlobalPrefix(globalPrefix, {
    exclude: ['v1/projects/*splat'],
  });

  app.use(cookieParser());

  // Two CORS policies (see common/cors-policy.ts — extracted so the routing
  // rule is spec'd):
  // 1. Delivery API (/v1/projects/:projectId/content|media/…) — browser-fetched
  //    from ANY origin. Reflect the origin;
  //    credentials OFF — these routes use Bearer API keys, never cookies.
  // 2. Management + admin — exact-origin allowlist from CORS_ORIGINS
  //    (credentials need a specific origin, never `*`). Includes the
  //    project-scoped management routes that share the /v1/projects prefix.
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.use(
    cors((req, callback) => {
      // cors' CorsRequest type omits path; the underlying object is the Express
      // request, which has it.
      const path = (req as { path?: string }).path ?? '';
      const origin = req.headers.origin ?? '';
      callback(null, resolveCorsPolicy(path, origin, corsOrigins));
    }),
  );

  // Double-submit CSRF check for cookie-authenticated, state-changing requests.
  app.useGlobalGuards(new CsrfGuard());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: 422,
    }),
  );

  const port = Number(process.env.PORT ?? 5000);
  await app.listen(port);
  logger.log(`🚀 api-gateway running on: http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
