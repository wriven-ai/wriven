import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { CoreEntitlementsModule } from '../entitlements/core-entitlements.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ContentController } from './content.controller';
import { ContentTypesService } from './content-types.service';
import { EntriesService } from './entries.service';

@Module({
  imports: [WebhooksModule, CacheModule, CoreEntitlementsModule],
  controllers: [ContentController],
  providers: [ContentTypesService, EntriesService],
})
export class ContentModule {}
