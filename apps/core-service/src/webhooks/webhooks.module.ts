import { Module } from '@nestjs/common';
import { CoreEntitlementsModule } from '../entitlements/core-entitlements.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [CoreEntitlementsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
