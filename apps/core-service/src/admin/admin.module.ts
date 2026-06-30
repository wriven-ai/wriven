import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminMetricsService } from './admin-metrics.service';

@Module({
  controllers: [AdminController],
  providers: [AdminMetricsService],
})
export class AdminModule {}
