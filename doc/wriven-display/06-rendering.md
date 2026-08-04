# 06 — Rendering content in React

How to turn Delivery API responses into React components: typed data, media,
rich text, references, dates, and loading/error/empty states.

## 1. Type your entry data

Define a TS interface per content type that mirrors its fields. Use it as the
generic on `getEntry` / `getEntries` (see [05-client-setup.md](./05-client-setup.md)).

```ts
import type { WrivenEntry } from '@/lib/wriven';
import type { WrivenMedia } from '@/lib/wriven';

export interface BlogPostData {
  title: string;
  excerpt: string;
  body: unknown;                 // richtext ProseMirror JSON → render with <WrivenRichText>
  coverImage: WrivenMedia | null;
  tags: string[];                // select multiple
  author: WrivenEntry<TeamMemberData> | string | null; // reference; object only if include>0
}
export type BlogPost = WrivenEntry<BlogPostData>;
```

Keep rich-text and reference fields loosely typed (`unknown` / union) until you
render them — their concrete shape depends on query options.

## 2. Render `media` fields

`media` fields arrive resolved. Render `url` directly.

```tsx
function Media({ media, className }: { media: WrivenMedia | null; className?: string }) {
  if (!media) return <div className={className} aria-hidden />; // placeholder
  return (
    <img
      src={media.url}
      alt={media.alt ?? ''}
      width={media.width ?? undefined}
      height={media.height ?? undefined}
      loading="lazy"
      className={className}
    />
  );
}

// gallery (multiple: true)
function Gallery({ items }: { items: WrivenMedia[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.filter(Boolean).map((m) => <Media key={m.id} media={m} />)}
    </div>
  );
}
```

Always fall back to `""` for `alt` (never `undefined`) so screen readers stay quiet.

## 3. Render `richtext` fields — the `<WrivenRichText>` component

Rich-text values are ProseMirror JSON. Vendor this renderer into your project as
**`src/components/WrivenRichText.tsx`**. It is the same component shipped by
`@wriven-ai/react` (dependency-free, safe-link-only, inline images supported).
When the official package is published you can delete this file and import from
`@wriven-ai/react` instead.

```tsx
// src/components/WrivenRichText.tsx
import { createElement, Fragment } from 'react';
import type { ComponentType, ReactNode } from 'react';

export interface ProseMark { type: string; attrs?: Record<string, unknown> }
export interface ProseNode {
  type?: string;
  text?: string;
  marks?: ProseMark[];
  attrs?: Record<string, unknown>;
  content?: ProseNode[];
}

/** Override the element rendered for a node type, e.g. { image: MyImage }. */
export type RichTextComponents = Partial<
  Record<string, ComponentType<{ node: ProseNode; children?: ReactNode }>>
>;

const MARK_TAG: Record<string, string> = {
  bold: 'strong',
  italic: 'em',
  strike: 's',
  code: 'code',
};

// Allow only safe link schemes — blocks javascript:/data: XSS from authored hrefs.
const SAFE_HREF = /^(https?:|mailto:|tel:|\/|#|\.|[\w-]+$)/i;
function safeHref(href: unknown): string {
  const value = String(href ?? '').trim();
  return SAFE_HREF.test(value) ? value : '#';
}

function renderText(node: ProseNode, key: number): ReactNode {
  let el: ReactNode = node.text ?? '';
  for (const mark of node.marks ?? []) {
    if (mark.type === 'link') {
      el = createElement('a',
        { key: `m${key}`, href: safeHref(mark.attrs?.href), rel: 'noreferrer noopener' }, el);
    } else {
      const tag = MARK_TAG[mark.type];
      if (tag) el = createElement(tag, { key: `m${key}` }, el);
    }
  }
  return el;
}

function renderChildren(node: ProseNode, components?: RichTextComponents): ReactNode[] {
  return (node.content ?? []).map((child, i) => renderNode(child, i, components));
}

function renderNode(node: ProseNode, key: number, components?: RichTextComponents): ReactNode {
  const Override = node.type ? components?.[node.type] : undefined;
  if (Override) return createElement(Override, { key, node }, ...renderChildren(node, components));

  switch (node.type) {
    case 'text': return renderText(node, key);
    case 'paragraph': return createElement('p', { key }, ...renderChildren(node, components));
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 2), 1), 6);
      return createElement(`h${level}`, { key }, ...renderChildren(node, components));
    }
    case 'bulletList': return createElement('ul', { key }, ...renderChildren(node, components));
    case 'orderedList': return createElement('ol', { key }, ...renderChildren(node, components));
    case 'listItem': return createElement('li', { key }, ...renderChildren(node, components));
    case 'blockquote': return createElement('blockquote', { key }, ...renderChildren(node, components));
    case 'codeBlock':
      return createElement('pre', { key },
        createElement('code', null, ...renderChildren(node, components)));
    case 'horizontalRule': return createElement('hr', { key });
    case 'hardBreak': return createElement('br', { key });
    case 'image':
      return createElement('img', {
        key,
        src: node.attrs?.src as string | undefined,
        alt: (node.attrs?.alt as string | undefined) ?? '',
        width: node.attrs?.width as number | undefined,
        height: node.attrs?.height as number | undefined,
      });
    case 'doc': return createElement(Fragment, { key }, ...renderChildren(node, components));
    default: return createElement(Fragment, { key }, ...renderChildren(node, components));
  }
}

/**
 * Render a Wriven rich-text value (ProseMirror JSON from a `richtext` field).
 * Inline images resolved by the Delivery API render as <img>.
 * Pass `components` to override any node type with your own component.
 */
export function WrivenRichText({
  value,
  components,
}: {
  value: unknown;
  components?: RichTextComponents;
}): ReactNode {
  if (!value || typeof value !== 'object') return null;
  return renderNode(value as ProseNode, 0, components);
}
```

### Using it

```tsx
import { WrivenRichText } from '@/components/WrivenRichText';

<article>
  <h1>{post.data.title}</h1>
  <WrivenRichText value={post.data.body} />
</article>
```

### Overriding nodes (e.g. custom code blocks / images)

```tsx
<WrivenRichText
  value={post.data.body}
  components={{
    image: ({ node }) => (
      <figure className="my-figure">
        <img src={node.attrs?.src as string} alt={(node.attrs?.alt as string) ?? ''} />
        {node.attrs?.alt ? <figcaption>{String(node.attrs.alt)}</figcaption> : null}
      </figure>
    ),
    codeBlock: ({ node }) => <CodeBlock code={(node.content ?? []).map(c => c.text ?? '').join('')} />,
  }}
/>
```

## 4. Render `reference` fields

With `include=0` (default) a reference is an id `string`. With `include>0` it is a
nested `WrivenEntry`. Handle both:

```tsx
function Author({ author }: { author: WrivenEntry<TeamMemberData> | string | null }) {
  if (!author) return null;
  if (typeof author === 'string') return <span>Author id: {author}</span>; // not expanded
  return (
    <div className="author">
      <Media media={author.data.photo ?? null} />
      <span>{author.data.name}</span>
    </div>
  );
}

// fetch with include=1 so the author object is already there:
const post = await wriven.getEntry<BlogPostData>('blog_post', slug, { include: 1 });
```

Prefer `include` over follow-up requests — one round trip.

## 5. Dates

`publishedAt` / `updatedAt` are ISO strings (or `null`).

```tsx
function Date({ iso }: { iso: string | null }) {
  if (!iso) return null;
  return <time dateTime={iso}>{new Date(iso).toLocaleDateString(undefined,
    { year: 'numeric', month: 'short', day: 'numeric' })}</time>;
}
```

## 6. Data-fetching hook (loading / error / empty)

A small reusable hook. No state library required; or drop in TanStack Query / SWR
if you want caching.

```tsx
// src/hooks/useAsync.ts
import { useEffect, useState } from 'react';

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setError(null);
    fn().then((d) => setData(d)).catch((e) => setError(e)).finally(() => setLoading(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading };
}
```

### Standard page states

```tsx
function Page() {
  const { data, error, loading } = useAsync(
    () => wriven.getEntries('blog_post', { sort: '-publishedAt', limit: 10 }),
    [],
  );

  if (loading) return <Skeleton />;
  if (error)   return <ErrorState error={error} />;
  if (!data || data.items.length === 0) return <Empty />;

  return data.items.map((p) => <PostCard key={p.id} post={p} />);
}
```

Distinguish a **`WrivenError`** from network/code errors if you want to show
specific messages (e.g. 401 → "content source misconfigured"):

```tsx
import { WrivenError } from '@/lib/wriven';
if (error instanceof WrivenError && error.status === 401) { /* bad/expired key */ }
```

## 7. Cheatsheet

| Field type | Render as |
|------------|-----------|
| `text` / `select` / `date` | `{entry.data.field}` (string) |
| `number` | `{entry.data.price}` (number) |
| `boolean` | `entry.data.featurely && <Badge/>` |
| `media` | `<img src={entry.data.image.url} alt={entry.data.image.alt ?? ''}/>` |
| `media` (multiple) | `entry.data.gallery.filter(Boolean).map(...)` |
| `richtext` | `<WrivenRichText value={entry.data.body}/>` |
| `reference` (include>0) | nested `entry.data.author.data.name` |
| `reference` (include=0) | id string `entry.data.author` |

Next: [07-content-type-examples.md](./07-content-type-examples.md).
