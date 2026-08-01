import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AdminSupportService } from './admin-support.service';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  imports: [StorageModule],
  controllers: [SupportController],
  providers: [SupportService, AdminSupportService],
})
export class SupportModule {}
