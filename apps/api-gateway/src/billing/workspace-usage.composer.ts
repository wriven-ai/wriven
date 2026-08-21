import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import {
  SERVICE_TOKENS,
  USAGE_PATTERNS,
  WORKSPACE_PATTERNS,
  type WorkspaceStatsView,
} from '@wriven/contracts';
import { firstValueFrom } from 'rxjs';

/** auth-owned tenancy counts merged into the core stats view. */
export interface WorkspaceTenancyStats {
  projects: number;
  members: number;
}

/**
 * Composes {@link WorkspaceStatsView}: core returns projects/members as 0
 * placeholders; auth's real counts overwrite them. Shared by the stats
 * endpoint and the downgrade guard.
 */
@Injectable()
export class WorkspaceUsageComposer {
  constructor(
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
    @Inject(SERVICE_TOKENS.CORE_SERVICE) private readonly core: ClientProxy,
  ) {}

  async compose(workspaceId: string): Promise<WorkspaceStatsView> {
    const [tenancy, core] = await Promise.all([
      firstValueFrom(
        this.auth.send<WorkspaceTenancyStats>(WORKSPACE_PATTERNS.STATS, {
          workspaceId,
        }),
      ),
      firstValueFrom(
        this.core.send<WorkspaceStatsView>(USAGE_PATTERNS.WORKSPACE_STATS, {
          workspaceId,
        }),
      ),
    ]);
    return { ...core, projects: tenancy.projects, members: tenancy.members };
  }
}
