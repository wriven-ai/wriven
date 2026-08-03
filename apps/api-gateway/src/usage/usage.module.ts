import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SERVICE_TOKENS } from '@wriven/contracts';
import { UsageBufferService } from './usage-buffer.service';
import { UsageController } from './usage.controller';
import { UsageEnforceService } from './usage-enforce.service';

/**
 * Usage metering. Registers its own CORE_SERVICE TCP client (the client in
 * `app.module` is module-scoped, not global, so feature modules must register
 * their own). ConfigService is global. See specs/14.
 */
@Module({
  imports: [
    ClientsModule.registerAsync([
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
  controllers: [UsageController],
  providers: [UsageBufferService, UsageEnforceService],
  exports: [UsageBufferService, UsageEnforceService],
})
export class UsageModule {}
