import { CodeBlock } from '../../../components/docs/code-block';
import { Callout, DocTitle, H2, InlineCode, Lead, NextLink, P } from '../../../components/docs/prose';

export const metadata = { title: 'Preview & Drafts · Wriven Docs' };

export default function PreviewPage() {
  return (
    <article>
      <DocTitle>Preview &amp; Drafts</DocTitle>
      <Lead>
        See content before it goes live. A preview key reads draft entries in
        addition to published ones, so a staging or preview build can render work
        in progress.
      </Lead>

      <H2>Preview keys</H2>
      <P>
        Create a key with the <InlineCode>preview</InlineCode> scope (
        <InlineCode>wrk_preview_…</InlineCode>). Use it against the exact same
        endpoints as the read key — it simply also returns{' '}
        <InlineCode>draft</InlineCode> entries.
      </P>
      <CodeBlock
        lang="bash"
        code={`curl "https://api.wriven.com/v1/projects/PROJECT_ID/content/blog_post" \\
  -H "Authorization: Bearer wrk_preview_xxx"`}
      />

      <Callout type="warning" title="// NEVER CACHED">
        Preview responses are returned with{' '}
        <InlineCode>Cache-Control: private, no-store</InlineCode>. Keep preview
        keys server-side — they expose unpublished content.
      </Callout>

      <H2>Wiring up preview mode</H2>
      <P>
        Point your framework&apos;s preview/draft mode at a route that fetches
        with the preview key. In Next.js, enable Draft Mode and read the preview
        token from a server-only env var so drafts never reach production
        visitors.
      </P>
      <CodeBlock
        lang="javascript"
        code={`// app/preview/route.ts — toggle Next.js Draft Mode
import { draftMode } from "next/headers";

export async function GET() {
  (await draftMode()).enable();
  return Response.redirect("/");
}`}
      />

      <NextLink href="/docs/nextjs" title="Next.js Guide" />
    </article>
  );
}
