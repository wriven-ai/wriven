import { CodeBlock } from '../../../components/docs/code-block';
import { Callout, DocTitle, H2, InlineCode, Lead, NextLink, P } from '../../../components/docs/prose';

export const metadata = { title: 'Quickstart · Wriven Docs' };

export default function QuickstartPage() {
  return (
    <article>
      <DocTitle>Quickstart</DocTitle>
      <Lead>
        Go from an empty project to live content on your site in a few minutes.
      </Lead>

      <H2>1. Define a content type</H2>
      <P>
        In the dashboard, open your project and go to{' '}
        <InlineCode>Content Types</InlineCode>. Create one — for example{' '}
        <InlineCode>blog_post</InlineCode> with a <InlineCode>title</InlineCode>{' '}
        (text) and <InlineCode>body</InlineCode> (rich text) field. The machine
        name (<InlineCode>apiId</InlineCode>) is what you query.
      </P>

      <H2>2. Create and publish an entry</H2>
      <P>
        Go to <InlineCode>Content</InlineCode>, add an entry of your type, fill in
        the fields, and hit <strong>Publish</strong>. Only published entries are
        returned to live sites.
      </P>

      <H2>3. Create an API key</H2>
      <P>
        Open <InlineCode>API Keys</InlineCode>, create a <strong>Read</strong> key,
        and copy the token. It is shown only once.
      </P>
      <Callout type="warning" title="// COPY IT NOW">
        Wriven stores only a hash of your token — it cannot be shown again. If you
        lose it, revoke the key and create a new one.
      </Callout>

      <H2>4. Fetch your content</H2>
      <P>Call the Delivery API with the key as a Bearer token:</P>
      <CodeBlock
        lang="bash"
        code={`curl "https://api.wriven.com/v1/projects/PROJECT_ID/content/blog_post" \\
  -H "Authorization: Bearer wrk_live_xxx"`}
      />
      <P>The same call in JavaScript:</P>
      <CodeBlock
        lang="javascript"
        code={`const res = await fetch(
  "https://api.wriven.com/v1/projects/PROJECT_ID/content/blog_post",
  { headers: { Authorization: "Bearer wrk_live_xxx" } }
);
const { items } = await res.json();
console.log(items[0].data.title);`}
      />

      <Callout type="info" title="// PROJECT_ID">
        Find your project id under <InlineCode>Project Settings</InlineCode>, or
        copy it from the dashboard URL.
      </Callout>

      <NextLink href="/docs/authentication" title="Authentication" />
    </article>
  );
}
