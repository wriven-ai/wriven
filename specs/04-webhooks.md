# 04 — Webhooks (publish → site rebuild)

The Jamstack loop: when content changes, the customer's site rebuilds. Core
emits **signed** HTTP POSTs to registered URLs on entry events. Implements
plans/01 Phase 6.

## Events

| Event | When |
|-------|------|
| `entry.published` | an update results in status `published` (publish, or any edit to a live entry — triggers a rebuild) |
| `entry.unpublished` | a published entry moves to a non-published status |
| `entry.deleted` | a **published** entry is (soft-)deleted (purge consumer caches) |

A webhook subscribes to any subset of events.

## Data model

`webhooks` table (core_svc): `id, workspaceId, projectId, url, events (jsonb
string[]), secret, active, lastStatus, lastFiredAt, createdBy, createdAt`. The
`secret` is **stored** (it signs outgoing requests) and shown to the user only
once at creation. Migration `0005_smiling_domino.sql`.

## Dispatch

`EntriesService` fires events fire-and-forget after the DB write — a slow or
failing endpoint never blocks or breaks the publish. `WebhooksService.dispatch`
finds active subscribers for the event and delivers to each.

Each delivery: **retry up to 3×** with backoff (0.5s, 2s), 10s timeout per
attempt; the last HTTP status + timestamp are recorded on the row.

## Payload

```json
{
  "event": "entry.published",
  "projectId": "…",
  "firedAt": "2026-06-29T12:00:00.000Z",
  "entry": {
    "id": "…", "type": "blog_posts", "slug": "hello",
    "status": "published", "publishedAt": "…", "updatedAt": "…"
  }
}
```

Payload is intentionally thin — the consumer refetches full content via the
Delivery API (it always wants the freshest data anyway).

## Signing (security)

Headers on every POST:

```
X-Wriven-Event: entry.published
X-Wriven-Timestamp: 2026-06-29T12:00:00.000Z
X-Wriven-Signature: sha256=<hex HMAC-SHA256( secret, `${timestamp}.${rawBody}` )>
```

Consumer verification (Node), **constant-time** + replay guard:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody: string, headers: Record<string, string>, secret: string) {
  const ts = headers['x-wriven-timestamp'];
  // Reject stale (>5 min) to block replay.
  if (Math.abs(Date.now() - Date.parse(ts)) > 5 * 60_000) return false;
  const expected = 'sha256=' + createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(headers['x-wriven-signature'] ?? '');
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Verify against the **raw** request body (not re-serialized JSON).

## API (gateway → core, session auth + workspace/project guards)

| Method | Route | Pattern |
|--------|-------|---------|
| POST | `/webhooks` | `WEBHOOK_CREATE` — returns the secret once |
| GET | `/webhooks` | `WEBHOOK_LIST` |
| PATCH | `/webhooks/:id` | `WEBHOOK_UPDATE` (url, events, active) |
| DELETE | `/webhooks/:id` | `WEBHOOK_DELETE` |

## Dashboard UI

Project Settings → **Webhooks**: add URL + pick events, secret revealed once,
list with last delivery status, pause/resume (`active`), delete.

## Known follow-ups

- **Delivery log** (per-attempt history + manual redeliver) — only `lastStatus`
  is kept now.
- **Secret rotation** endpoint.
- Move dispatch to a durable queue (BullMQ) for at-least-once delivery across
  restarts — current retries are in-process only.
- Wire the **same publish events to CDN purge** (plans/01 P5) — the dispatcher hook
  point is shared.
