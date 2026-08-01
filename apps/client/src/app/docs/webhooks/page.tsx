import { CodeBlock } from '../../../components/docs/code-block';
import {
  Callout,
  DocTitle,
  H2,
  InlineCode,
  Lead,
  NextLink,
  P,
  ParamTable,
} from '../../../components/docs/prose';

export const metadata = { title: 'Webhooks · Wriven Docs' };

export default function WebhooksDocsPage() {
  return (
    <article>
      <DocTitle>Webhooks</DocTitle>
      <Lead>
        Get a signed HTTP POST the moment content changes — so your site can
        rebuild or revalidate automatically.
      </Lead>

      <H2>Setup</H2>
      <P>
        In the dashboard open <InlineCode>Project Settings → Webhooks</InlineCode>,
        add your endpoint URL, choose the events, and save. The signing{' '}
        <InlineCode>secret</InlineCode> is shown once — store it; you&apos;ll use it
        to verify deliveries.
      </P>

      <H2>Events</H2>
      <ParamTable
        rows={[
          { name: 'entry.published', type: 'event', desc: 'An entry was published, or a live entry was edited (rebuild it).' },
          { name: 'entry.unpublished', type: 'event', desc: 'A published entry moved back to draft/archived.' },
          { name: 'entry.deleted', type: 'event', desc: 'A published entry was deleted (remove it from the site).' },
        ]}
      />

      <H2>Payload</H2>
      <P>
        The body is intentionally small — fetch the full content from the Delivery
        API (it&apos;s the freshest source).
      </P>
      <CodeBlock
        lang="json"
        code={`{
  "event": "entry.published",
  "projectId": "…",
  "firedAt": "2026-06-29T12:00:00.000Z",
  "entry": {
    "id": "…",
    "type": "blog_post",
    "slug": "hello-world",
    "status": "published",
    "publishedAt": "2026-06-29T12:00:00.000Z",
    "updatedAt": "2026-06-29T12:00:00.000Z"
  }
}`}
      />

      <H2>Verifying the signature</H2>
      <P>Every request carries three headers:</P>
      <ParamTable
        rows={[
          { name: 'X-Wriven-Event', type: 'string', desc: 'The event name.' },
          { name: 'X-Wriven-Timestamp', type: 'string', desc: 'ISO time the event fired; signed, and used as a replay guard.' },
          { name: 'X-Wriven-Signature', type: 'string', desc: 'sha256=<HMAC-SHA256 of `${timestamp}.${rawBody}` using your secret>.' },
        ]}
      />
      <P>
        Verify against the <strong>raw</strong> request body, with a constant-time
        compare, and reject stale timestamps:
      </P>
      <CodeBlock
        lang="ts"
        code={`import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyWriven(
  rawBody: string,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const ts = headers['x-wriven-timestamp'] ?? '';
  // Reject anything older than 5 minutes (replay protection).
  if (Math.abs(Date.now() - Date.parse(ts)) > 5 * 60_000) return false;

  const expected =
    'sha256=' +
    createHmac('sha256', secret).update(\`\${ts}.\${rawBody}\`).digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(headers['x-wriven-signature'] ?? '');
  return a.length === b.length && timingSafeEqual(a, b);
}`}
      />

      <Callout type="warning" title="// USE THE RAW BODY">
        Compute the signature over the exact bytes received — not a re-serialized
        JSON object. Most frameworks let you read the raw body before parsing.
      </Callout>

      <H2>Next.js: revalidate on publish</H2>
      <P>
        Point the webhook at a route handler that revalidates the affected path on{' '}
        <InlineCode>entry.published</InlineCode>:
      </P>
      <CodeBlock
        lang="ts"
        code={`// app/api/wriven-webhook/route.ts
import { revalidatePath } from 'next/cache';
import { verifyWriven } from '@/lib/wriven';

export async function POST(req: Request) {
  const raw = await req.text();
  const headers = Object.fromEntries(req.headers);
  if (!verifyWriven(raw, headers, process.env.WRIVEN_WEBHOOK_SECRET!)) {
    return new Response('Bad signature', { status: 401 });
  }
  const { event, entry } = JSON.parse(raw);
  if (event === 'entry.published') revalidatePath(\`/blog/\${entry.slug}\`);
  return Response.json({ ok: true });
}`}
      />
      <Callout type="info" title="// DELIVERY">
        Failed deliveries are retried with backoff. The dashboard shows each
        webhook&apos;s last delivery status.
      </Callout>

      <NextLink href="/docs" title="Back to Introduction" />
    </article>
  );
}
