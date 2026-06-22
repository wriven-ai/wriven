/**
 * api-gateway — the only service exposed to the internet.
 * HTTP in, TCP out to internal NestJS services.
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const globalPrefix = 'api/v1';
  app.setGlobalPrefix(globalPrefix);

  app.use(cookieParser());
  app.enableCors({
    origin: true,
    credentials: true,
  });

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
