/**
 * api-gateway — the only service exposed to the internet.
 * HTTP in, TCP out to internal NestJS services.
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { AppModule } from './app/app.module';
import { CsrfGuard } from './auth/csrf.guard';

async function bootstrap() {
  // rawBody: true exposes req.rawBody (Buffer) so the Stripe webhook route can
  // verify signatures over the exact bytes Stripe signed. Parsed req.body is
  // still populated for every other route.
  const app = await NestFactory.create(AppModule, { rawBody: true });

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
  // The public Content Delivery API is its own versioned surface mounted at
  // /v1/projects/:projectId/... (per specs/01 and the @wriven-ai/client SDK). It
  // shares the /v1 root with the management routes, so exclude it from the global
  // prefix — otherwise the DeliveryController's `v1/projects/...` path gets
  // doubled to /v1/v1/projects/... . Wildcard syntax is path-to-regexp v8.
  app.setGlobalPrefix(globalPrefix, {
    exclude: ['v1/projects/*splat'],
  });

  app.use(cookieParser());

  // Two CORS policies, split by surface:
  //
  // 1. Public Delivery API (/v1/projects/…) — customer display apps fetch it
  //    straight from the browser on ANY origin (Contentful/Sanity CDA model).
  //    Reflect the request origin; credentials stay OFF — these routes
  //    authenticate with Bearer API keys, never cookies, so reflecting is safe.
  // 2. Management + admin surface — exact-origin allowlist from CORS_ORIGINS
  //    (credentials require a specific origin, never `*`). Prod lists
  //    wriven.tech/admin.wriven.tech (+www); dev defaults to the local servers.
  //
  // Requests without an Origin header (curl, same-origin, server-to-server)
  // are not CORS and pass through untouched either way.
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.use(
    cors((req, callback) => {
      // cors' CorsRequest type omits path; the underlying object is the Express
      // request, which has it.
      const path = (req as { path?: string }).path ?? '';
      const isDelivery = path.startsWith('/v1/projects/');
      const origin = req.headers.origin ?? '';
      if (isDelivery) {
        return callback(null, { origin: true, credentials: false });
      }
      callback(null, {
        origin: !origin || corsOrigins.includes(origin),
        credentials: true,
      });
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
  Logger.log(
    `🚀 api-gateway running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
