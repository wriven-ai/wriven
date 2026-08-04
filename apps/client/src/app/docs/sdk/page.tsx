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

export const metadata = { title: 'SDK & Client Libraries · Wriven Docs' };

export default function SdkPage() {
  return (
    <article>
      <DocTitle>SDK &amp; Client Libraries</DocTitle>
      <Lead>
        No SDK is required — any HTTP client works. For convenience, Wriven ships
        optional, isomorphic packages: a typed delivery client, a React rich-text
        renderer, and Next.js webhook helpers.
      </Lead>

      <H2>The packages</H2>
      <ParamTable
        rows={[
          { name: '@wriven-ai/client', type: 'core', desc: 'createClient, getEntry, getEntries. Typed, zero-dependency, runs in Node, browsers, and edge.' },
          { name: '@wriven-ai/react', type: 'react', desc: '<WrivenRichText> renderer for richtext fields, with per-node component overrides.' },
          { name: '@wriven-ai/next', type: 'next', desc: 'createWebhookRoute (verify + revalidate) and verifyWrivenSignature for Next.js.' },
        ]}
      />
      <Callout type="info" title="// VERSION 0.1.0 — ON NPM">
        All three packages are published on npm (currently <InlineCode>0.1.0</InlineCode>).
        They are optional — the Delivery API is plain HTTP, so a raw{' '}
        <InlineCode>fetch</InlineCode> works too — but the SDK adds typed
        responses, automatic retries on 5xx, a request timeout, and a typed{' '}
        <InlineCode>WrivenError</InlineCode>.
      </Callout>

      <H2>Install</H2>
      <CodeBlock
        lang="bash"
        code={`npm install @wriven-ai/client
# optional:
npm install @wriven-ai/react   # richtext renderer (React peer)
npm install @wriven-ai/next    # webhook + signature helpers (Next peer)`}
      />

      <H2>Usage</H2>
      <P>Create a client with your project id and a delivery token, then read entries:</P>
      <CodeBlock
        lang="ts"
        code={`import { createClient } from '@wriven-ai/client';

const wriven = createClient({
  projectId: process.env.WRIVEN_PROJECT_ID,
  token: process.env.WRIVEN_TOKEN,        // wrk_live_… (published) or wrk_preview_… (drafts)
  // baseUrl: 'https://api.wriven.com',   // default
  // retries: 2, timeoutMs: 10000,
});

// list
const { items, total } = await wriven.getEntries('blog_post', {
  sort: '-publishedAt', limit: 10,
});

// one by slug
const post = await wriven.getEntry('blog_post', 'hello-world', { include: 1 });`}
      />
      <P>
        A preview token (<InlineCode>wrk_preview_…</InlineCode>) automatically
        returns drafts, so the same client powers both production and preview.
        Failed requests throw a typed <InlineCode>WrivenError</InlineCode> with{' '}
        <InlineCode>status</InlineCode> and <InlineCode>code</InlineCode> matching
        the response envelope.
      </P>

      <H2>Other frameworks</H2>
      <P>
        Because the core client uses only the global{' '}
        <InlineCode>fetch</InlineCode>, it runs anywhere — Astro, Vite, Remix,
        mobile, servers, edge workers. Render <InlineCode>richtext</InlineCode>{' '}
        fields with <InlineCode>&lt;WrivenRichText&gt;</InlineCode> in any React
        app; in non-React stacks, walk the ProseMirror JSON directly as shown in
        the Rich Text guide. See the Next.js guide for the full SSR + webhook
        loop.
      </P>

      <NextLink href="/docs/nextjs" title="Next.js Guide" />
    </article>
  );
}
