import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SERVICE_TOKENS } from '@wriven/contracts';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/api-gateway/.env',
    }),
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
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
