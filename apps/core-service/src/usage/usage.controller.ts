import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { USAGE_PATTERNS } from '@wriven/contracts';
import type { UsageBucket, UsageView } from '@wriven/contracts';
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
}
