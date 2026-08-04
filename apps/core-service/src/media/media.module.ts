import { Module } from '@nestjs/common';
import { CoreEntitlementsModule } from '../entitlements/core-entitlements.module';
import { StorageModule } from '../storage/storage.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [StorageModule, CoreEntitlementsModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
