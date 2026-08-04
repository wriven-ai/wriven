import { Module } from '@nestjs/common';
import { CoreEntitlementsModule } from '../entitlements/core-entitlements.module';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';

@Module({
  imports: [CoreEntitlementsModule],
  controllers: [UsageController],
  providers: [UsageService],
})
export class UsageModule {}
