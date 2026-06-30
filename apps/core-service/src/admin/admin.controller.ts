import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { ADMIN_PATTERNS } from '@wriven/contracts';
import { AdminMetricsService } from './admin-metrics.service';

/** TCP surface for the platform admin panel (core-service side). */
@Controller()
export class AdminController {
  constructor(private readonly metrics: AdminMetricsService) {}

  @MessagePattern(ADMIN_PATTERNS.METRICS_CONTENT)
  contentMetrics() {
    return this.metrics.content();
  }
}
