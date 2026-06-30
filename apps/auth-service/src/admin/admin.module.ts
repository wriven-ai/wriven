import { Module } from '@nestjs/common';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminController } from './admin.controller';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminTokenService } from './admin-token.service';
import { AdminUsersService } from './admin-users.service';

@Module({
  controllers: [AdminController],
  providers: [
    AdminAuthService,
    AdminTokenService,
    AdminUsersService,
    AdminAuditService,
    AdminMetricsService,
  ],
})
export class AdminModule {}
