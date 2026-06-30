import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AUTH_PATTERNS,
  PlanLimits,
  SERVICE_TOKENS,
  WorkspaceEntitlements,
} from '@wriven/contracts';
import { DRIZZLE, DrizzleDB } from '@wriven/database';
import { and, eq, isNull } from 'drizzle-orm';
import { firstValueFrom } from 'rxjs';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';

const { contentEntries, contentTypes, apiKeys, webhooks } = schema;

/**
 * Core-side plan enforcement. Limits live in auth-service (plans/subscriptions),
 * so we fetch them over TCP and count this service's own resources. Counts are
 * point-in-time (no advisory lock) — acceptable for these soft caps.
 */
@Injectable()
export class CoreEntitlementsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
    @Inject(SERVICE_TOKENS.AUTH_SERVICE) private readonly auth: ClientProxy,
  ) {}

  private async limits(workspaceId: string): Promise<PlanLimits> {
    const res = await firstValueFrom(
      this.auth.send<WorkspaceEntitlements>(
        AUTH_PATTERNS.ENTITLEMENTS_RESOLVE,
        { workspaceId },
      ),
    );
    return res.limits;
  }

  async assertEntryQuota(workspaceId: string): Promise<void> {
    const max = (await this.limits(workspaceId)).entries;
    if (max == null) return;
    const used = await this.db.$count(
      contentEntries,
      and(
        eq(contentEntries.workspaceId, workspaceId),
        isNull(contentEntries.deletedAt),
      ),
    );
    this.assert(used, max, 'entries');
  }

  async assertContentTypeQuota(workspaceId: string): Promise<void> {
    const max = (await this.limits(workspaceId)).contentTypes;
    if (max == null) return;
    const used = await this.db.$count(
      contentTypes,
      and(
        eq(contentTypes.workspaceId, workspaceId),
        isNull(contentTypes.deletedAt),
      ),
    );
    this.assert(used, max, 'content types');
  }

  async assertApiKeyQuota(workspaceId: string): Promise<void> {
    const max = (await this.limits(workspaceId)).apiKeys;
    if (max == null) return;
    const used = await this.db.$count(
      apiKeys,
      and(eq(apiKeys.workspaceId, workspaceId), isNull(apiKeys.revokedAt)),
    );
    this.assert(used, max, 'API keys');
  }

  async assertWebhookQuota(workspaceId: string): Promise<void> {
    const max = (await this.limits(workspaceId)).webhooks;
    if (max == null) return;
    const used = await this.db.$count(
      webhooks,
      eq(webhooks.workspaceId, workspaceId),
    );
    this.assert(used, max, 'webhooks');
  }

  /** Storage cap in bytes for a workspace, or null if unlimited. */
  async storageLimitBytes(workspaceId: string): Promise<number | null> {
    const mb = (await this.limits(workspaceId)).storageMb;
    return mb == null ? null : mb * 1024 * 1024;
  }

  private assert(used: number, max: number, label: string): void {
    if (used >= max) {
      throw rpcError(
        'PLAN_LIMIT_REACHED',
        `Your plan allows ${max} ${label}. Upgrade to add more.`,
      );
    }
  }
}
