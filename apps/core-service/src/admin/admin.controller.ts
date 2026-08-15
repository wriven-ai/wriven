import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  ADMIN_PATTERNS,
  AdminContentQueryDto,
  AdminScopedQueryDto,
  AdminTakedownDto,
} from '@wriven/contracts';
import { AdminContentService } from './admin-content.service';
import { AdminContentTypesService } from './admin-content-types.service';
import { AdminKeysService } from './admin-keys.service';
import { AdminMediaService } from './admin-media.service';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminWebhooksService } from './admin-webhooks.service';

/** TCP surface for the platform admin panel (core-service side). */
@Controller()
export class AdminController {
  constructor(
    private readonly metrics: AdminMetricsService,
    private readonly content: AdminContentService,
    private readonly contentTypes: AdminContentTypesService,
    private readonly media: AdminMediaService,
    private readonly keys: AdminKeysService,
    private readonly webhooks: AdminWebhooksService,
  ) {}

  @MessagePattern(ADMIN_PATTERNS.METRICS_CONTENT)
  contentMetrics() {
    return this.metrics.content();
  }

  // ── Content moderation ──────────────────────────────────────────────────────

  @MessagePattern(ADMIN_PATTERNS.CONTENT_LIST)
  listContent(@Payload() query: AdminContentQueryDto) {
    return this.content.list(query);
  }

  @MessagePattern(ADMIN_PATTERNS.CONTENT_GET)
  getContent(@Payload() payload: { id: string }) {
    return this.content.get(payload);
  }

  @MessagePattern(ADMIN_PATTERNS.CONTENT_TAKEDOWN)
  takedownContent(@Payload() payload: { id: string; dto: AdminTakedownDto }) {
    return this.content.takedown(payload);
  }

  @MessagePattern(ADMIN_PATTERNS.CONTENT_TYPES_LIST)
  listContentTypes(@Payload() query: AdminScopedQueryDto) {
    return this.contentTypes.list(query);
  }

  // ── Media ─────────────────────────────────────────────────────────────────

  @MessagePattern(ADMIN_PATTERNS.MEDIA_LIST)
  listMedia(@Payload() query: AdminScopedQueryDto) {
    return this.media.list(query);
  }

  @MessagePattern(ADMIN_PATTERNS.MEDIA_USAGE)
  mediaUsage() {
    return this.media.usage();
  }

  @MessagePattern(ADMIN_PATTERNS.MEDIA_PURGE)
  purgeMedia(@Payload() payload: { id: string }) {
    return this.media.purge(payload);
  }

  // ── API keys ────────────────────────────────────────────────────────────────

  @MessagePattern(ADMIN_PATTERNS.APIKEYS_LIST)
  listKeys(@Payload() query: AdminScopedQueryDto) {
    return this.keys.list(query);
  }

  @MessagePattern(ADMIN_PATTERNS.APIKEYS_REVOKE)
  revokeKey(@Payload() payload: { id: string }) {
    return this.keys.revoke(payload);
  }

  // ── Webhooks ────────────────────────────────────────────────────────────────

  @MessagePattern(ADMIN_PATTERNS.WEBHOOKS_LIST)
  listWebhooks(@Payload() query: AdminScopedQueryDto) {
    return this.webhooks.list(query);
  }

  @MessagePattern(ADMIN_PATTERNS.WEBHOOKS_DISABLE)
  disableWebhook(@Payload() payload: { id: string }) {
    return this.webhooks.disable(payload);
  }
}
