import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { USAGE_PATTERNS } from '@wriven/contracts';
import type {
  ProjectStatsView,
  UsageBucket,
  UsageView,
  WorkspaceStatsView,
} from '@wriven/contracts';
import { UsageService } from './usage.service';

@Controller()
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  /** Batched increment flushed from the gateway's in-process buffer. */
  @MessagePattern(USAGE_PATTERNS.RECORD)
  record(@Payload() p: { buckets: UsageBucket[] }) {
    return this.usage.record(p);
  }

  /** Current-period UsageView (requests used/limit + storage used/limit). */
  @MessagePattern(USAGE_PATTERNS.READ)
  read(@Payload() p: { workspaceId: string }): Promise<UsageView> {
    return this.usage.read(p);
  }

  /** Workspace aggregate stats (projects/members merged by the gateway). */
  @MessagePattern(USAGE_PATTERNS.WORKSPACE_STATS)
  workspaceStats(
    @Payload() p: { workspaceId: string },
  ): Promise<WorkspaceStatsView> {
    return this.usage.workspaceStats(p);
  }

  /** Project-scoped aggregate stats. */
  @MessagePattern(USAGE_PATTERNS.PROJECT_STATS)
  projectStats(
    @Payload() p: { projectId: string },
  ): Promise<ProjectStatsView> {
    return this.usage.projectStats(p);
  }
}
