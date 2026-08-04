/**
 * Project-scoped outgoing webhooks. On publish/unpublish/delete the core service
 * POSTs a signed payload to each registered URL — the Jamstack rebuild loop.
 * The signing secret is shown in full exactly once, at creation.
 */

/** Events a webhook can subscribe to. */
export type WebhookEvent =
  | 'entry.published'
  | 'entry.unpublished'
  | 'entry.deleted';

export const WEBHOOK_EVENTS: readonly WebhookEvent[] = [
  'entry.published',
  'entry.unpublished',
  'entry.deleted',
];

/** Safe representation — never carries the signing secret. */
export interface WebhookView {
  id: string;
  workspaceId: string;
  projectId: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  /** HTTP status of the last delivery attempt, or null if never fired. */
  lastStatus: number | null;
  lastFiredAt: string | null;
  createdAt: string;
}

/** Returned ONLY from create — carries the signing secret exactly once. */
export interface CreateWebhookResult {
  webhook: WebhookView;
  secret: string;
}

/** The JSON body POSTed to a subscriber when an event fires. */
export interface WebhookPayload {
  event: WebhookEvent;
  projectId: string;
  /** ISO timestamp the event fired (also sent as `X-Wriven-Timestamp`). */
  firedAt: string;
  entry: {
    id: string;
    type: string; // content type apiId
    slug: string;
    status: string;
    publishedAt: string | null;
    updatedAt: string;
  };
}
