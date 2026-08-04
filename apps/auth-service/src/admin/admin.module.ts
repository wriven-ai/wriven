import { Module } from '@nestjs/common';
import { StripeModule } from '../billing/stripe.module';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminController } from './admin.controller';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminPlansService } from './admin-plans.service';
import { AdminTenancyService } from './admin-tenancy.service';
import { AdminTokenService } from './admin-token.service';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [StripeModule],
  controllers: [AdminController],
  providers: [
    AdminAuthService,
    AdminTokenService,
    AdminUsersService,
    AdminAuditService,
    AdminMetricsService,
    AdminTenancyService,
    AdminPlansService,
  ],
})
export class AdminModule {}
