import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentTypesService } from './content-types.service';
import { EntriesService } from './entries.service';

@Module({
  controllers: [ContentController],
  providers: [ContentTypesService, EntriesService],
})
export class ContentModule {}
