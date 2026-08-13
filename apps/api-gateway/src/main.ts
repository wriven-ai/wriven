/**
 * api-gateway — the only service exposed to the internet.
 * HTTP in, TCP out to internal NestJS services.
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
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
  app.enableCors({
    origin: true,
    credentials: true,
  });

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
