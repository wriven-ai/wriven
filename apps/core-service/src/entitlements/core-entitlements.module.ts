import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SERVICE_TOKENS } from '@wriven/contracts';
import { CoreEntitlementsService } from './core-entitlements.service';

/**
 * Provides plan-limit enforcement to core create paths. Registers a TCP client to
 * auth-service (where plans/subscriptions live) so limits can be resolved.
 */
@Module({
  imports: [
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
    ]),
  ],
  providers: [CoreEntitlementsService],
  exports: [CoreEntitlementsService],
})
export class CoreEntitlementsModule {}
