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

export const metadata = { title: 'Caching · Wriven Docs' };

export default function CachingPage() {
  return (
    <article>
      <DocTitle>Caching</DocTitle>
      <Lead>
        Published Delivery responses are immutable until content changes, so they
        are safe to cache hard. Wriven sets cache headers and surrogate tags, then
        purges exactly the affected responses when you publish, unpublish, or
        delete.
      </Lead>

      <H2>Response headers</H2>
      <ParamTable
        rows={[
          { name: 'Cache-Control', type: 'header', desc: 'Published reads: public, s-maxage=60, stale-while-revalidate=300. Preview reads: private, no-store.' },
          { name: 'Surrogate-Key', type: 'header', desc: 'Space-separated cache tags for Fastly: proj_{id} type_{apiId} entry_{id}.' },
          { name: 'Cache-Tag', type: 'header', desc: 'Same tags for Cloudflare. Both headers are always sent.' },
        ]}
      />
      <CodeBlock
        lang="http"
        code={`# a published list response
Cache-Control: public, s-maxage=60, stale-while-revalidate=300
Surrogate-Key: proj_abc type_blog_post entry_1 entry_2
Cache-Tag:     proj_abc type_blog_post entry_1 entry_2`}
      />

      <H2>Cache tags</H2>
      <P>
        Each response is tagged with its project, its content type, and every
        entry it contains. When an entry is published, unpublished, or deleted,
        Wriven purges the tags it touches — so a CDN can drop precisely the
        stale responses without invalidating anything else.
      </P>

      <H2>Putting a CDN in front</H2>
      <P>
        Point Fastly or Cloudflare at the Delivery API and let the headers do the
        work: serve cached copies for up to 60 seconds, refresh in the background
        for 300 more, and rely on tag-based purge to stay fresh on publish. This
        is the cheapest way to scale and to keep usage under your plan’s request
        allowance.
      </P>

      <H2>Next.js ISR</H2>
      <P>
        In a Next.js app, pass the cache directives straight through to the
        framework fetch so pages regenerate on a schedule and on-demand:
      </P>
      <CodeBlock
        lang="ts"
        code={`// revalidate this page at most every 60 seconds
const res = await fetch(url, {
  headers: { Authorization: 'Bearer ' + token },
  next: { revalidate: 60, tags: ['blog_post'] },
});`}
      />
      <Callout type="warning" title="// PREVIEW IS NEVER CACHED">
        Requests made with a preview key return drafts and always carry{' '}
        <InlineCode>private, no-store</InlineCode>. Never put a preview response
        behind a shared cache.
      </Callout>

      <NextLink href="/docs/sdk" title="SDK & Client Libraries" />
    </article>
  );
}
