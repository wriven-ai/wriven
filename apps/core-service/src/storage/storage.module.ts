import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/** Provides the storage adapter to any module that needs object URLs/uploads. */
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
