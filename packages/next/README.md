# @wriven-ai/next

Next.js helpers for [Wriven](https://wriven.com): a signed-webhook → ISR
revalidation route handler, plus the signature verifier.

```bash
npm i @wriven-ai/next
```

## Revalidate on publish

Create a route handler and re-export its `POST`. Wriven calls it on
publish/unpublish/delete; matching paths/tags are revalidated.

```ts
// app/api/wriven/route.ts
import { createWebhookRoute } from '@wriven-ai/next';

export const { POST } = createWebhookRoute({
  secret: process.env.WRIVEN_WEBHOOK_SECRET!,   // from Project Settings → Webhooks
  revalidate: (p) => ({
    paths: [`/blog/${p.entry.slug}`, '/blog'],
  }),
});
```

Then add a webhook in the dashboard pointing at `https://yoursite.com/api/wriven`.

- Verifies the `X-Wriven-Signature` HMAC over the raw body, with a timestamp
  replay guard — invalid signatures get `401`.
- `revalidate` returns the `paths` and/or `tags` to revalidate per event.
- `onEvent` runs an arbitrary side effect (logging, queueing) per event.

## Just verify (custom handling)

```ts
import { verifyWrivenSignature } from '@wriven-ai/next';

const raw = await req.text();
const headers = Object.fromEntries(req.headers); // lowercase keys
if (!verifyWrivenSignature(raw, headers, secret)) {
  return new Response('Bad signature', { status: 401 });
}
```

Pairs with [`@wriven-ai/client`](https://www.npmjs.com/package/@wriven-ai/client)
(data) and [`@wriven-ai/react`](https://www.npmjs.com/package/@wriven-ai/react)
(rendering).

MIT
