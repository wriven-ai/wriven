import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@wriven/database';
import * as schema from '../db/schema';
import { AdminModule } from '../admin/admin.module';
import { AiModule } from '../ai/ai.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ContentModule } from '../content/content.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { MediaModule } from '../media/media.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { SupportModule } from '../support/support.module';
import { UsageModule } from '../usage/usage.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/core-service/.env',
    }),
    DatabaseModule.forRoot({ schema }),
    AdminModule,
    AiModule,
    ContentModule,
    ApiKeysModule,
    DeliveryModule,
    MediaModule,
    WebhooksModule,
    SupportModule,
    UsageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
