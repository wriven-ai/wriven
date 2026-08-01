import { CodeBlock } from '../../../components/docs/code-block';
import {
  DocTitle,
  H2,
  H3,
  InlineCode,
  Lead,
  NextLink,
  P,
  ParamTable,
} from '../../../components/docs/prose';

export const metadata = { title: 'Delivery API · Wriven Docs' };

export default function DeliveryApiPage() {
  return (
    <article>
      <DocTitle>Delivery API</DocTitle>
      <Lead>
        A read-only REST API that returns published content as JSON. Base URL:{' '}
        <InlineCode>https://api.wriven.com/v1</InlineCode>.
      </Lead>

      <H2>Endpoints</H2>
      <H3>List entries of a type</H3>
      <CodeBlock
        lang="http"
        code={`GET /v1/projects/{projectId}/content/{apiId}`}
      />
      <P>
        Returns a paginated list of published entries of the content type{' '}
        <InlineCode>apiId</InlineCode>.
      </P>

      <H3>Get one entry by slug</H3>
      <CodeBlock
        lang="http"
        code={`GET /v1/projects/{projectId}/content/{apiId}/{slug}`}
      />

      <H2>Entry shape</H2>
      <P>Every entry is returned in this trimmed, public shape:</P>
      <ParamTable
        rows={[
          { name: 'id', type: 'string', desc: 'Unique entry id.' },
          { name: 'type', type: 'string', desc: 'The content type apiId, e.g. "blog_post".' },
          { name: 'slug', type: 'string', desc: 'URL-safe identifier, unique per type.' },
          { name: 'data', type: 'object', desc: 'Your field values, keyed by field name.' },
          { name: 'publishedAt', type: 'string | null', desc: 'ISO timestamp the entry went live.' },
          { name: 'updatedAt', type: 'string', desc: 'ISO timestamp of the last change.' },
        ]}
      />

      <H2>List response</H2>
      <P>
        List endpoints wrap items in a pagination envelope inside the standard{' '}
        <InlineCode>{'{ success, data }'}</InlineCode> response:
      </P>
      <CodeBlock
        lang="json"
        code={`{
  "success": true,
  "data": {
    "items": [
      {
        "id": "8f3b…",
        "type": "blog_post",
        "slug": "hello-world",
        "data": { "title": "Hello world", "body": "…" },
        "publishedAt": "2026-06-01T10:00:00.000Z",
        "updatedAt": "2026-06-02T09:12:00.000Z"
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 1
  }
}`}
      />

      <NextLink href="/docs/querying" title="Querying & Filtering" />
    </article>
  );
}
