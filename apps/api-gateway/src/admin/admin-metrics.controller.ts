import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ADMIN_PATTERNS,
  AdminMetricsOverview,
  SERVICE_TOKENS,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminRolesGuard } from './admin-roles.guard';

interface AuthMetrics {
  users: { total: number; verified: number };
  workspaces: { total: number };
  projects: { total: number };
  plans: { key: string; name: string; count: number }[];
}
interface ContentMetrics {
  entries: number;
  published: number;
  mediaBytes: number;
}

@UseGuards(AdminJwtGuard, AdminRolesGuard)
@Controller('admin/metrics')
export class AdminMetricsController {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  @Get('overview')
  async overview(): Promise<AdminMetricsOverview> {
    const [a, c] = await Promise.all([
      firstValueFrom(
        this.auth.send<AuthMetrics>(ADMIN_PATTERNS.METRICS_AUTH, {}),
      ),
      firstValueFrom(
        this.core.send<ContentMetrics>(ADMIN_PATTERNS.METRICS_CONTENT, {}),
      ),
    ]);
    return {
      users: a.users,
      workspaces: a.workspaces,
      projects: a.projects,
      content: { entries: c.entries, published: c.published },
      media: { totalBytes: c.mediaBytes },
      plans: a.plans,
    };
  }
}
