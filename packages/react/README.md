# @wriven-ai/react

React renderer for [Wriven](https://wriven.com) rich-text. Turns a `richtext`
field's ProseMirror JSON — including inline images resolved by the Delivery API —
into React elements.

```bash
npm i @wriven-ai/client @wriven-ai/react
```

> `@wriven-ai/react` only **renders** content. You fetch it with
> [`@wriven-ai/client`](https://www.npmjs.com/package/@wriven-ai/client), so install both.
> On Next.js, add [`@wriven-ai/next`](https://www.npmjs.com/package/@wriven-ai/next)
> for webhook → ISR revalidation.

```tsx
import { WrivenRichText } from '@wriven-ai/react';

export function Article({ post }) {
  return (
    <article>
      <h1>{post.data.title}</h1>
      <WrivenRichText value={post.data.body} />
    </article>
  );
}
```

## Overriding node types

Pass `components` to render any node with your own component — e.g. use
`next/image` for inline images:

```tsx
import Image from 'next/image';
import { WrivenRichText, type ProseNode } from '@wriven-ai/react';

const components = {
  image: ({ node }: { node: ProseNode }) => (
    <Image
      src={String(node.attrs?.src)}
      alt={String(node.attrs?.alt ?? '')}
      width={Number(node.attrs?.width ?? 1200)}
      height={Number(node.attrs?.height ?? 630)}
    />
  ),
};

<WrivenRichText value={post.data.body} components={components} />;
```

Supported nodes: paragraphs, headings, bold/italic/strike/code/link marks,
bullet & ordered lists, blockquote, code block, horizontal rule, hard break, and
`image`. Unknown nodes render their children, so content is never dropped.

MIT
