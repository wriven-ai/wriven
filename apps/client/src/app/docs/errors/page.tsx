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

export const metadata = { title: 'Errors · Wriven Docs' };

export default function ErrorsPage() {
  return (
    <article>
      <DocTitle>Errors</DocTitle>
      <Lead>
        Every response uses a consistent envelope. On failure you get a
        machine-readable code and an HTTP status — never a stack trace or an
        internal service name.
      </Lead>

      <H2>Response envelope</H2>
      <P>Success and failure are both wrapped, distinguished by the <InlineCode>success</InlineCode> flag:</P>
      <CodeBlock
        lang="json"
        code={`// success
{ "success": true, "data": { "the": "payload" } }

// error
{ "success": false,
  "error": { "code": "NOT_FOUND", "message": "Content not found.", "statusCode": 404 } }`}
      />

      <H2>Status codes</H2>
      <ParamTable
        rows={[
          { name: '401 UNAUTHORIZED', type: 'error', desc: 'Missing, invalid, expired, or revoked API key. Check your token.' },
          { name: '403 FORBIDDEN', type: 'error', desc: 'The project in the path does not match the key’s project, or the scope is wrong.' },
          { name: '404 NOT_FOUND', type: 'error', desc: 'Unknown content type apiId, unknown slug, or no published entry matches.' },
          { name: '422 VALIDATION_ERROR', type: 'error', desc: 'Malformed query parameters (bad sort key, limit over 100, unknown select field, etc.).' },
          { name: '429 RATE_LIMITED', type: 'error', desc: 'Monthly Delivery request quota exceeded, when usage enforcement is enabled. See Rate Limits.' },
          { name: '500 INTERNAL_ERROR', type: 'error', desc: 'Server-side failure. Safe to retry; transient.' },
        ]}
      />

      <H2>Handling errors</H2>
      <P>Check the HTTP status (or the <InlineCode>success</InlineCode> flag) before reading the payload:</P>
      <CodeBlock
        lang="ts"
        code={`const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
const body = await res.json();
if (!res.ok || body.success === false) {
  const err = body.error ?? { code: 'REQUEST_FAILED', message: 'Request failed.' };
  throw new Error('[' + err.code + '] ' + err.message);
}
const data = body.data;`}
      />
      <Callout type="info" title="// SAFE BY DESIGN">
        Error messages are generic and never leak internals — database errors,
        service names, and stack traces are all stripped before the response
        leaves the gateway.
      </Callout>

      <NextLink href="/docs/rate-limits" title="Rate Limits & Usage" />
    </article>
  );
}
