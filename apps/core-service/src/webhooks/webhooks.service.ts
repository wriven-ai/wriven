import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import {
  CreateWebhookDto,
  CreateWebhookResult,
  UpdateWebhookDto,
  WebhookEvent,
  WebhookPayload,
  WebhookView,
  WEBHOOK_EVENTS,
} from '@wriven/contracts';
import { DRIZZLE } from '@wriven/database';
import type { DrizzleDB } from '@wriven/database';
import { and, eq } from 'drizzle-orm';
import { rpcError } from '../common/rpc-error';
import * as schema from '../db/schema';

const { webhooks } = schema;
type WebhookRow = typeof webhooks.$inferSelect;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>) {}

  /** Create a subscription. Secret returned ONCE; it signs outgoing payloads. */
  async create(p: {
    workspaceId: string;
    projectId: string;
    userId: string;
    dto: CreateWebhookDto;
  }): Promise<CreateWebhookResult> {
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    const events = p.dto.events?.length ? p.dto.events : [...WEBHOOK_EVENTS];

    const [row] = await this.db
      .insert(webhooks)
      .values({
        workspaceId: p.workspaceId,
        projectId: p.projectId,
        url: p.dto.url,
        events,
        secret,
        createdBy: p.userId,
      })
      .returning();

    return { webhook: this.toView(row), secret };
  }

  async list(p: { projectId: string }): Promise<WebhookView[]> {
    const rows = await this.db.query.webhooks.findMany({
      where: eq(webhooks.projectId, p.projectId),
      orderBy: webhooks.createdAt,
    });
    return rows.map((r) => this.toView(r));
  }

  async update(p: {
    projectId: string;
    id: string;
    dto: UpdateWebhookDto;
  }): Promise<WebhookView> {
    await this.requireRow(p.projectId, p.id);
    const [row] = await this.db
      .update(webhooks)
      .set({
        ...(p.dto.url !== undefined ? { url: p.dto.url } : {}),
        ...(p.dto.events !== undefined ? { events: p.dto.events } : {}),
        ...(p.dto.active !== undefined ? { active: p.dto.active } : {}),
      })
      .where(eq(webhooks.id, p.id))
      .returning();
    return this.toView(row);
  }

  async remove(p: { projectId: string; id: string }): Promise<{ success: true }> {
    await this.requireRow(p.projectId, p.id);
    await this.db.delete(webhooks).where(eq(webhooks.id, p.id));
    return { success: true };
  }

  /**
   * Fire an event to every active subscriber of `projectId`. Best-effort and
   * fire-and-forget — a slow/failing endpoint never blocks or breaks the publish
   * that triggered it. Each delivery is HMAC-signed and retried with backoff.
   */
  async dispatch(projectId: string, payload: WebhookPayload): Promise<void> {
    const hooks = await this.db.query.webhooks.findMany({
      where: and(eq(webhooks.projectId, projectId), eq(webhooks.active, true)),
    });
    const subscribers = hooks.filter((h) =>
      (h.events as string[]).includes(payload.event),
    );
    await Promise.all(
      subscribers.map((h) =>
        this.deliver(h, payload).catch((err) =>
          this.logger.warn(`Webhook ${h.id} delivery error: ${String(err)}`),
        ),
      ),
    );
  }

  /** POST a signed payload, retrying on non-2xx; records the last status. */
  private async deliver(hook: WebhookRow, payload: WebhookPayload): Promise<void> {
    const body = JSON.stringify(payload);
    const ts = payload.firedAt;
    const signature = createHmac('sha256', hook.secret)
      .update(`${ts}.${body}`)
      .digest('hex');
    const headers = {
      'Content-Type': 'application/json',
      'X-Wriven-Event': payload.event,
      'X-Wriven-Timestamp': ts,
      'X-Wriven-Signature': `sha256=${signature}`,
    };

    const backoff = [500, 2000]; // ms before retry 2 and 3
    let status = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(hook.url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });
        clearTimeout(timer);
        status = res.status;
        if (res.ok) break;
      } catch {
        status = 0; // network error / timeout
      }
      if (attempt < backoff.length) await sleep(backoff[attempt]);
    }

    await this.db
      .update(webhooks)
      .set({ lastStatus: status, lastFiredAt: new Date() })
      .where(eq(webhooks.id, hook.id));
  }

  private async requireRow(projectId: string, id: string): Promise<WebhookRow> {
    const row = await this.db.query.webhooks.findFirst({
      where: and(eq(webhooks.id, id), eq(webhooks.projectId, projectId)),
    });
    if (!row) throw rpcError('NOT_FOUND', 'Webhook not found.');
    return row;
  }

  private toView(r: WebhookRow): WebhookView {
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      projectId: r.projectId,
      url: r.url,
      events: r.events as WebhookEvent[],
      active: r.active,
      lastStatus: r.lastStatus,
      lastFiredAt: r.lastFiredAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
