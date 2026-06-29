import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CORE_PATTERNS,
  CreateWebhookDto,
  UpdateWebhookDto,
} from '@wriven/contracts';
import { WebhooksService } from './webhooks.service';

@Controller()
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @MessagePattern(CORE_PATTERNS.WEBHOOK_CREATE)
  create(
    @Payload()
    p: {
      workspaceId: string;
      projectId: string;
      userId: string;
      dto: CreateWebhookDto;
    },
  ) {
    return this.webhooks.create(p);
  }

  @MessagePattern(CORE_PATTERNS.WEBHOOK_LIST)
  list(@Payload() p: { projectId: string }) {
    return this.webhooks.list(p);
  }

  @MessagePattern(CORE_PATTERNS.WEBHOOK_UPDATE)
  update(@Payload() p: { projectId: string; id: string; dto: UpdateWebhookDto }) {
    return this.webhooks.update(p);
  }

  @MessagePattern(CORE_PATTERNS.WEBHOOK_DELETE)
  remove(@Payload() p: { projectId: string; id: string }) {
    return this.webhooks.remove(p);
  }
}
