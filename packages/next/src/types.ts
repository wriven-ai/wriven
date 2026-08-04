export type WrivenWebhookEvent =
  | 'entry.published'
  | 'entry.unpublished'
  | 'entry.deleted';

/** The JSON body Wriven POSTs to a webhook endpoint. */
export interface WrivenWebhookPayload {
  event: WrivenWebhookEvent;
  projectId: string;
  firedAt: string;
  entry: {
    id: string;
    type: string;
    slug: string;
    status: string;
    publishedAt: string | null;
    updatedAt: string;
  };
}
