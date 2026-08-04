import { Module } from '@nestjs/common';
import { CoreEntitlementsModule } from '../entitlements/core-entitlements.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';

@Module({
  imports: [CoreEntitlementsModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
})
export class ApiKeysModule {}
