import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SERVICE_TOKENS } from '@wriven/contracts';
import { AuthController } from '../auth/auth.controller';
import { GoogleStrategy } from '../auth/google.strategy';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectGuard } from '../auth/project.guard';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { AllExceptionsFilter } from '../common/all-exceptions.filter';
import { ResponseInterceptor } from '../common/response.interceptor';
import { ApiKeysController } from '../api-keys/api-keys.controller';
import { ContentController } from '../content/content.controller';
import { MediaController } from '../content/media.controller';
import { DeliveryController } from '../delivery/delivery.controller';
import { InvitationsController } from '../members/invitations.controller';
import { ProjectsController } from '../members/projects.controller';
import { WorkspacesController } from '../members/workspaces.controller';
import { WebhooksController } from '../webhooks/webhooks.controller';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/api-gateway/.env',
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET'),
      }),
    }),
    // Global default: 100 requests / minute / IP. Sensitive auth routes
    // tighten this further via @Throttle in the controller.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PassportModule,
    ClientsModule.registerAsync([
      {
        name: SERVICE_TOKENS.AUTH_SERVICE,
        inject: [ConfigService],
        useFactory: (cfg: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: cfg.get<string>('AUTH_SERVICE_HOST', 'localhost'),
            port: cfg.get<number>('AUTH_SERVICE_PORT', 5001),
          },
        }),
      },
      {
        name: SERVICE_TOKENS.CORE_SERVICE,
        inject: [ConfigService],
        useFactory: (cfg: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: cfg.get<string>('CORE_SERVICE_HOST', 'localhost'),
            port: cfg.get<number>('CORE_SERVICE_PORT', 5002),
          },
        }),
      },
    ]),
  ],
  controllers: [
    AppController,
    AuthController,
    ContentController,
    MediaController,
    DeliveryController,
    ApiKeysController,
    WorkspacesController,
    ProjectsController,
    InvitationsController,
    WebhooksController,
  ],
  providers: [
    AppService,
    JwtAuthGuard,
    WorkspaceGuard,
    ProjectGuard,
    ApiKeyGuard,
    GoogleStrategy,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
