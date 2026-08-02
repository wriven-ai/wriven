import { Module } from '@nestjs/common';
import { UsageBufferService } from './usage-buffer.service';
import { UsageController } from './usage.controller';
import { UsageEnforceService } from './usage-enforce.service';

@Module({
  controllers: [UsageController],
  providers: [UsageBufferService, UsageEnforceService],
  exports: [UsageBufferService, UsageEnforceService],
})
export class UsageModule {}

