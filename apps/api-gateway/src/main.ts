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

  const globalPrefix = 'api/v1';
  app.setGlobalPrefix(globalPrefix);

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
