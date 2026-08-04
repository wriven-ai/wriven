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

export const metadata = { title: 'Querying & Filtering · Wriven Docs' };

export default function QueryingPage() {
  return (
    <article>
      <DocTitle>Querying &amp; Filtering</DocTitle>
      <Lead>
        Shape list responses with query parameters — select fields, filter, sort,
        paginate, and expand references.
      </Lead>

      <H2>Parameters</H2>
      <ParamTable
        rows={[
          { name: 'select', type: 'string', desc: 'Comma-separated field keys to return, e.g. select=title,slug.' },
          { name: 'filter[key]', type: 'string', desc: 'Equality filter on a data field, e.g. filter[category]=news.' },
          { name: 'sort', type: 'string', desc: 'Sort by publishedAt, createdAt, updatedAt or slug. Prefix - for descending.' },
          { name: 'page', type: 'number', desc: 'Page number, starting at 1.' },
          { name: 'limit', type: 'number', desc: 'Items per page (1–100, default 20).' },
          { name: 'include', type: 'number', desc: 'Depth (0–3) to expand reference fields into nested entries.' },
        ]}
      />

      <H2>Examples</H2>
      <P>Latest 5 posts, only the title and slug:</P>
      <CodeBlock
        lang="bash"
        code={`curl "https://api.wriven.com/v1/projects/PROJECT_ID/content/blog_post?\\
select=title,slug&sort=-publishedAt&limit=5" \\
  -H "Authorization: Bearer wrk_live_xxx"`}
      />

      <P>Posts in a category:</P>
      <CodeBlock
        lang="bash"
        code={`curl "https://api.wriven.com/v1/projects/PROJECT_ID/content/blog_post?\\
filter[category]=news" \\
  -H "Authorization: Bearer wrk_live_xxx"`}
      />

      <H2>Expanding references</H2>
      <P>
        Fields of type <InlineCode>reference</InlineCode> store the id of another
        entry. By default the id is returned as-is. Pass{' '}
        <InlineCode>include</InlineCode> to replace it with the referenced entry
        inline:
      </P>
      <CodeBlock
        lang="bash"
        code={`curl "https://api.wriven.com/v1/projects/PROJECT_ID/content/blog_post/hello-world?\\
include=1" \\
  -H "Authorization: Bearer wrk_live_xxx"`}
      />
      <Callout type="info" title="// DEPTH LIMIT">
        <InlineCode>include</InlineCode> is capped at depth 3 to bound query cost.
        Only published references are expanded; unpublished ones stay as ids.
      </Callout>

      <NextLink href="/docs/entries" title="Content & Entries" />
    </article>
  );
}
