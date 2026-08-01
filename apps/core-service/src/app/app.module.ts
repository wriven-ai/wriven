import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@wriven/database';
import * as schema from '../db/schema';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ContentModule } from '../content/content.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { MediaModule } from '../media/media.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/core-service/.env',
    }),
    DatabaseModule.forRoot({ schema }),
    ContentModule,
    ApiKeysModule,
    DeliveryModule,
    MediaModule,
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
