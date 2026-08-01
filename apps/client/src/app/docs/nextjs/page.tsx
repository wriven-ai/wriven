import { CodeBlock } from '../../../components/docs/code-block';
import { Callout, DocTitle, H2, InlineCode, Lead, P } from '../../../components/docs/prose';

export const metadata = { title: 'Next.js Guide · Wriven Docs' };

export default function NextjsGuidePage() {
  return (
    <article>
      <DocTitle>Next.js Guide</DocTitle>
      <Lead>
        Fetch Wriven content from a Next.js App Router server component. No SDK —
        the platform fetch works directly, with full control over caching.
      </Lead>

      <H2>1. Add your token</H2>
      <P>
        Put a <InlineCode>read</InlineCode> key and your project id in{' '}
        <InlineCode>.env.local</InlineCode> (server-only — no{' '}
        <InlineCode>NEXT_PUBLIC_</InlineCode> prefix):
      </P>
      <CodeBlock
        lang="bash"
        code={`WRIVEN_TOKEN=wrk_live_xxx
WRIVEN_PROJECT_ID=PROJECT_ID`}
      />

      <H2>2. A small fetch helper</H2>
      <CodeBlock
        lang="typescript"
        code={`// lib/wriven.ts
const BASE = "https://api.wriven.com/v1";

export async function getEntries(type: string, params = "") {
  const res = await fetch(
    \`\${BASE}/projects/\${process.env.WRIVEN_PROJECT_ID}/content/\${type}\${params}\`,
    {
      headers: { Authorization: \`Bearer \${process.env.WRIVEN_TOKEN}\` },
      next: { revalidate: 60 }, // ISR: re-fetch at most every 60s
    }
  );
  if (!res.ok) throw new Error("Wriven fetch failed");
  const { data } = await res.json();
  return data.items;
}`}
      />

      <H2>3. Render in a server component</H2>
      <CodeBlock
        lang="tsx"
        code={`// app/blog/page.tsx
import { getEntries } from "@/lib/wriven";

export default async function BlogPage() {
  const posts = await getEntries("blog_post", "?sort=-publishedAt&limit=10");

  return (
    <main className="mx-auto max-w-3xl py-12">
      {posts.map((p) => (
        <article key={p.id} className="mb-8">
          <h2 className="text-2xl font-bold">{p.data.title}</h2>
          <p>{p.data.excerpt}</p>
        </article>
      ))}
    </main>
  );
}`}
      />

      <Callout type="info" title="// REVALIDATION">
        Use <InlineCode>next: {'{ revalidate }'}</InlineCode> for time-based ISR.
        For instant updates on publish, wire a webhook to{' '}
        <InlineCode>revalidatePath()</InlineCode> — webhooks are on the roadmap.
      </Callout>
    </article>
  );
}
