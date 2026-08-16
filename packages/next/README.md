# @wriven-ai/next

[![npm](https://img.shields.io/npm/v/@wriven-ai/next)](https://www.npmjs.com/package/@wriven-ai/next)
[![license](https://img.shields.io/npm/l/@wriven-ai/next)](./LICENSE)

Next.js helpers for [Wriven](https://wriven.tech): a signature-verified
webhook → ISR revalidation route handler, plus the raw signature verifier for
custom handling.

- **Verified before anything runs** — HMAC over the raw body, timing-safe
  compare, timestamp replay guard
- **Revalidate paths or tags** per event — wire it to however you fetch
- **Zero config surface** — one function, one export

Peer dependency: `next >= 14` (App Router route handlers). `next/cache` is
imported lazily, so this package never bundles Next itself.

```bash
npm i @wriven-ai/client @wriven-ai/next
```

> A full Next.js setup uses all three Wriven packages:
> [`client`](https://www.npmjs.com/package/@wriven-ai/client) fetches,
> [`react`](https://www.npmjs.com/package/@wriven-ai/react) renders the body,
> `next` revalidates on publish.

## Table of contents

- [Quickstart](#quickstart)
- [Events](#events)
- [Payload](#payload)
- [Options](#options)
- [Signature verification](#signature-verification)
- [Tag-based revalidation](#tag-based-revalidation)
- [Custom handling](#custom-handling)
- [Responses](#responses)
- [FAQ](#faq)

## Quickstart

Create an App Router route handler and re-export the generated `POST`:

```ts
// app/api/wriven/route.ts
import { createWebhookRoute } from '@wriven-ai/next';

export const { POST } = createWebhookRoute({
  secret: process.env.WRIVEN_WEBHOOK_SECRET!, // dashboard → Project Settings → Webhooks
  revalidate: (p) => ({
    paths: [`/blog/${p.entry.slug}`, '/blog'],
  }),
});
```

Then register a webhook in the dashboard pointing at
`https://yoursite.com/api/wriven`. On every publish/unpublish/delete Wriven
POSTs a signed payload; the route verifies it and revalidates the paths (or
tags) you return for that event.

## Events

| Event | Fires when |
|-------|------------|
| `entry.published` | an entry is published or re-published with changes |
| `entry.unpublished` | a published entry goes back to draft |
| `entry.deleted` | an entry is deleted |

Filter by event inside `revalidate` — return nothing (or `{}`) to skip:

```ts
revalidate: (p) =>
  p.event === 'entry.deleted'
    ? { paths: [`/blog/${p.entry.slug}`, '/blog'] }
    : { paths: ['/blog', `/blog/${p.entry.slug}`] },
```

## Payload

`revalidate` and `onEvent` receive the verified body:

| Field | Type | Notes |
|-------|------|-------|
| `event` | `'entry.published' \| 'entry.unpublished' \| 'entry.deleted'` | |
| `projectId` | `string` | project the entry belongs to |
| `firedAt` | `string` | ISO timestamp (also sent as `X-Wriven-Timestamp`) |
| `entry.id` | `string` | |
| `entry.type` | `string` | content type apiId, e.g. `"blog_post"` |
| `entry.slug` | `string` | |
| `entry.status` | `string` | `draft` / `published` / `archived` |
| `entry.publishedAt` | `string \| null` | |
| `entry.updatedAt` | `string` | ISO timestamp |

## Options

```ts
createWebhookRoute({
  secret: string,             // required — the whsec_… signing secret
  revalidate?: (payload) => { paths?: string[]; tags?: string[] } | void,
  onEvent?: (payload) => void | Promise<void>,
})
```

| Option | Notes |
|--------|-------|
| `secret` | Shown exactly once when the webhook is created (dashboard → Project Settings → Webhooks). Keep it in a server env var. |
| `revalidate` | Map an event to `paths` and/or `tags` to revalidate. Return nothing to skip. |
| `onEvent` | Arbitrary side effect per verified event — logging, queueing a rebuild, analytics. Runs after revalidation; awaited. |

## Signature verification

Every Wriven webhook delivery carries:

- `X-Wriven-Signature: sha256=<hex>` — HMAC-SHA256 of `${timestamp}.${rawBody}`
  keyed with the webhook's signing secret
- `X-Wriven-Timestamp` — ISO timestamp of the fire

`verifyWrivenSignature` (used internally, exported too) checks:

1. both headers present,
2. the timestamp is within ±5 minutes (replay guard — configurable via
   `options.toleranceMs`),
3. the signature matches a **timing-safe** comparison over the raw body —
   never a re-serialized parse.

The route verifies **before** parsing or revalidating anything, so an
unsigned/tampered request never triggers cache invalidation.

## Tag-based revalidation

Paths are one option; tags scale better. Fetch with
[`@wriven-ai/client`](https://www.npmjs.com/package/@wriven-ai/client) using
matching `next.tags`, then revalidate the tag for whole-type changes:

```ts
// When fetching (e.g. in a page or generateStaticParams)
const posts = await wriven.getEntries('blog_post', {
  next: { revalidate: 60, tags: ['blog'] },
});

// app/api/wriven/route.ts
export const { POST } = createWebhookRoute({
  secret: process.env.WRIVEN_WEBHOOK_SECRET!,
  revalidate: (p) => ({
    tags: ['blog'],                    // every fetch tagged 'blog' is purged
    paths: [`/blog/${p.entry.slug}`],  // plus the affected page
  }),
});
```

Every cached fetch tagged `blog` is invalidated at once — no path list to
maintain.

## Custom handling

Skip the route builder and verify yourself (works in any Node runtime —
this function has no Next.js dependency):

```ts
import { verifyWrivenSignature } from '@wriven-ai/next';

export async function POST(req: Request) {
  const raw = await req.text();
  const headers = Object.fromEntries(req.headers); // keys are lowercase
  if (!verifyWrivenSignature(raw, headers, secret)) {
    return new Response('Bad signature', { status: 401 });
  }
  // …your logic
}
```

Tighten the replay window if your clocks are trusted:

```ts
verifyWrivenSignature(raw, headers, secret, { toleranceMs: 60_000 }); // ±1 min
```

## Responses

| Status | Body | Meaning |
|--------|------|---------|
| `200` | `{ ok: true, event }` | verified, revalidated, `onEvent` ran |
| `401` | `Invalid signature` | missing/stale/tampered signature — not processed |
| `400` | `Invalid payload` | body is not valid JSON |

Wriven retries failed deliveries (non-2xx) a few times with backoff; a `200`
stops retries.

## FAQ

**Pages Router?** The verifier works anywhere; `createWebhookRoute` targets
App Router `route.ts` files (it returns a `Request → Response` handler). Use
`verifyWrivenSignature` + `res.revalidate()` in Pages Router API routes.

**Is `next/cache` bundled?** No — it's dynamically imported at request time and
marked external, so this package stays runtime- and version-agnostic
(`next >= 14`).

**Multiple webhooks / secrets?** One route per secret, or read the signature
yourself with `verifyWrivenSignature` and branch on `X-Wriven-Event`.

MIT
