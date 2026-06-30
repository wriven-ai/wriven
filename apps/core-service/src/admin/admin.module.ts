import { Module } from '@nestjs/common';
import { AdminContentService } from './admin-content.service';
import { AdminController } from './admin.controller';
import { AdminKeysService } from './admin-keys.service';
import { AdminMediaService } from './admin-media.service';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminWebhooksService } from './admin-webhooks.service';

@Module({
  controllers: [AdminController],
  providers: [
    AdminMetricsService,
    AdminContentService,
    AdminMediaService,
    AdminKeysService,
    AdminWebhooksService,
  ],
})
export class AdminModule {}
