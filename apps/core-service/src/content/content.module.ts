import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ContentController } from './content.controller';
import { ContentTypesService } from './content-types.service';
import { EntriesService } from './entries.service';

@Module({
  imports: [WebhooksModule],
  controllers: [ContentController],
  providers: [ContentTypesService, EntriesService],
})
export class ContentModule {}
