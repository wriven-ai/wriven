import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { SERVICE_TOKENS } from '@wriven/contracts';
import { ProxyAwareThrottlerGuard } from '../common/proxy-aware.throttler.guard';
import { AdminAdminsController } from '../admin/admin-admins.controller';
import { AdminApiKeysController } from '../admin/admin-apikeys.controller';
import { AdminAuditController } from '../admin/admin-audit.controller';
import { AdminAuthController } from '../admin/admin-auth.controller';
import { AdminContentController } from '../admin/admin-content.controller';
import { AdminContentTypesController } from '../admin/admin-content-types.controller';
import { AdminJwtGuard } from '../admin/admin-jwt.guard';
import { AdminMediaController } from '../admin/admin-media.controller';
import { AdminMetricsController } from '../admin/admin-metrics.controller';
import { AdminPlansController } from '../admin/admin-plans.controller';
import { AdminProjectsController } from '../admin/admin-projects.controller';
import { AdminRolesGuard } from '../admin/admin-roles.guard';
import { AdminUsersController } from '../admin/admin-users.controller';
import { AdminSupportController } from '../admin/admin-support.controller';
import { AdminSupportMetricsController } from '../admin/admin-support-metrics.controller';
import { AdminWebhooksController } from '../admin/admin-webhooks.controller';
import { AdminWorkspacesController } from '../admin/admin-workspaces.controller';
import { AuditInterceptor } from '../admin/audit.interceptor';
import { WorkspaceAuditInterceptor } from '../common/workspace-audit.interceptor';
import { AuthController } from '../auth/auth.controller';
import { UsersController } from '../users/users.controller';
import { GoogleStrategy } from '../auth/google.strategy';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectGuard } from '../auth/project.guard';
import { WorkspaceGuard } from '../auth/workspace.guard';
import { AllExceptionsFilter } from '../common/all-exceptions.filter';
import { ResponseInterceptor } from '../common/response.interceptor';
import { ApiKeysController } from '../api-keys/api-keys.controller';
import { AiController } from '../content/ai.controller';
import { ContentController } from '../content/content.controller';
import { MediaController } from '../content/media.controller';
import { DeliveryController } from '../delivery/delivery.controller';
import { InvitationsController } from '../members/invitations.controller';
import { ProjectsController } from '../members/projects.controller';
import { WorkspacesController } from '../members/workspaces.controller';
import { WebhooksController } from '../webhooks/webhooks.controller';
import { SupportController } from '../support/support.controller';
import { PlansController } from '../plans/plans.controller';
import { BillingController } from '../billing/billing.controller';
import { StripeWebhookController } from '../billing/stripe-webhook.controller';
import { UsageBufferService } from '../usage/usage-buffer.service';
import { WorkspaceUsageComposer } from '../billing/workspace-usage.composer';
import { UsageController } from '../usage/usage.controller';
import { LogsController } from '../logs/logs.controller';
import { StatsController } from '../stats/stats.controller';
import { UsageEnforceService } from '../usage/usage-enforce.service';
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
    UsersController,
    AiController,
    ContentController,
    MediaController,
    DeliveryController,
    ApiKeysController,
    WorkspacesController,
    ProjectsController,
    InvitationsController,
    WebhooksController,
    SupportController,
    PlansController,
    UsageController,
    LogsController,
    StatsController,
    BillingController,
    StripeWebhookController,
    AdminAuthController,
    AdminMetricsController,
    AdminAdminsController,
    AdminAuditController,
    AdminUsersController,
    AdminWorkspacesController,
    AdminProjectsController,
    AdminContentController,
    AdminContentTypesController,
    AdminMediaController,
    AdminApiKeysController,
    AdminWebhooksController,
    AdminPlansController,
    AdminSupportController,
    AdminSupportMetricsController,
  ],
  providers: [
    AppService,
    JwtAuthGuard,
    WorkspaceGuard,
    ProjectGuard,
    ApiKeyGuard,
    GoogleStrategy,
    AdminJwtGuard,
    AdminRolesGuard,
    AuditInterceptor,
    WorkspaceAuditInterceptor,
    UsageBufferService,
    UsageEnforceService,
    WorkspaceUsageComposer,
    { provide: APP_GUARD, useClass: ProxyAwareThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
