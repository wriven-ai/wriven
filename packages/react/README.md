# @wriven-ai/react

[![npm](https://img.shields.io/npm/v/@wriven-ai/react)](https://www.npmjs.com/package/@wriven-ai/react)
[![license](https://img.shields.io/npm/l/@wriven-ai/react)](./LICENSE)

React renderer for [Wriven](https://wriven.com) rich-text. Turns a `richtext`
field's ProseMirror JSON — including inline images hydrated by the Delivery
API — into React elements.

- **Server-component safe** — pure function, no hooks, no client JS
- **Never drops content** — unknown nodes render their children
- **Override anything** — swap any node type for your own component
- **Hardened by default** — authored `href`s are scheme-checked

```bash
npm i @wriven-ai/client @wriven-ai/react
```

> This package only **renders**. Fetch the content with
> [`@wriven-ai/client`](https://www.npmjs.com/package/@wriven-ai/client).
> On Next.js, [`@wriven-ai/next`](https://www.npmjs.com/package/@wriven-ai/next)
> adds webhook → ISR revalidation.

Peer dependency: `react >= 18` (works in RSC, client components, and plain React).

## Table of contents

- [Quickstart](#quickstart)
- [Supported nodes and marks](#supported-nodes-and-marks)
- [Overriding node types](#overriding-node-types)
- [Inline images](#inline-images)
- [Security](#security)
- [Types](#types)
- [FAQ](#faq)

## Quickstart

```tsx
import { createClient } from '@wriven-ai/client';
import { WrivenRichText } from '@wriven-ai/react';

const wriven = createClient({ projectId: '…', token: '…' });

export async function Article({ slug }: { slug: string }) {
  const post = await wriven.getEntry<{ title: string; body: unknown }>(
    'blog_post',
    slug,
  );
  return (
    <article>
      <h1>{post.data.title}</h1>
      <WrivenRichText value={post.data.body} />
    </article>
  );
}
```

`value` is whatever the Delivery API returned for a `richtext` field — pass it
through as-is. Anything that isn't a ProseMirror node renders `null`.

## Supported nodes and marks

| Node | Renders as |
|------|------------|
| `doc` (root) | fragment |
| `paragraph` | `<p>` |
| `heading` | `<h1>`–`<h6>` (level clamped to 1–6) |
| `bulletList` / `orderedList` | `<ul>` / `<ol>` |
| `listItem` | `<li>` |
| `blockquote` | `<blockquote>` |
| `codeBlock` | `<pre><code>` |
| `horizontalRule` | `<hr>` |
| `hardBreak` | `<br>` |
| `image` | `<img src alt width height>` (see [below](#inline-images)) |

| Mark | Wraps in |
|------|----------|
| `bold` | `<strong>` |
| `italic` | `<em>` |
| `strike` | `<s>` |
| `code` | `<code>` |
| `link` | `<a href rel="noreferrer noopener">` (see [security](#security)) |

**Unknown nodes render their children** — if Wriven's editor gains a node type
this version predates, its text still appears instead of silently vanishing.

## Overriding node types

Pass `components` — a map of node type → component. Your component receives
the raw `node` plus its rendered `children`:

```tsx
import Image from 'next/image';
import type { ProseNode, RichTextComponents } from '@wriven-ai/react';

const components: RichTextComponents = {
  // Use next/image for inline media
  image: ({ node }) => (
    <Image
      src={String(node.attrs?.src)}
      alt={String(node.attrs?.alt ?? '')}
      width={Number(node.attrs?.width ?? 1200)}
      height={Number(node.attrs?.height ?? 630)}
    />
  ),
  // Custom code blocks with syntax highlighting
  codeBlock: ({ node, children }) => (
    <pre data-language={String(node.attrs?.language ?? '')}>
      <code>{children}</code>
    </pre>
  ),
};

<WrivenRichText value={post.data.body} components={components} />;
```

An override wins for the whole subtree only where you return it — children you
don't render yourself still route back through the default renderer via the
`children` prop.

## Inline images

The Wriven editor stores only an `assetId` for inline images; the Delivery API
hydrates each `image` node before you see it:

```ts
{ type: 'image', attrs: { src: 'https://cdn…/x.png', alt: '…', width: 1200, height: 630 } }
```

So the default renderer can output a plain `<img>` with real dimensions. If
the underlying asset was deleted, `src` comes back `null` and the node renders
nothing rather than a broken image.

## Security

Rich-text JSON is authored content — treat it like user input. Defaults:

- Link `href`s are restricted to `https:`, `http:`, `mailto:`, `tel:`, and
  same-site paths (`/…`, `./…`, `../…`, `#…`). Anything else (`javascript:`,
  `data:`, …) renders as `href="#"`.
- Links always get `rel="noreferrer noopener"`.
- Text is rendered as React children — never `dangerouslySetInnerHTML`.

If you override a node type, **you** receive the raw `attrs` — sanitize
anything you feed to a URL or HTML attribute yourself.

## Types

```ts
import type { ProseNode, ProseMark, RichTextComponents } from '@wriven-ai/react';

interface ProseMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface ProseNode {
  type?: string;                 // 'paragraph' | 'text' | …
  text?: string;                 // for text nodes
  marks?: ProseMark[];           // bold/link/… on text nodes
  attrs?: Record<string, unknown>; // level/href/src/…
  content?: ProseNode[];         // children
}

type RichTextComponents = Partial<
  Record<string, ComponentType<{ node: ProseNode; children?: ReactNode }>>
>;
```

## FAQ

**Server components?** Yes — `WrivenRichText` is a plain function component
with no hooks or effects; render it in RSC, SSR, or the client.

**Does it fetch or parse Markdown?** No. It renders ProseMirror JSON only, and
never touches the network.

**A mark/node renders unstyled — why?** Only the marks and nodes listed above
are mapped; everything else falls through (children still render). Add a
`components` override for full control.

**Styling?** None is included — the output is semantic HTML. Style it with
your own CSS (e.g. `article :where(h2, p, pre) { … }`).

MIT
