# 07 — Content type examples (products, blog, team)

Ready-to-use content types for the display app. For each: the **field definitions**
(to recreate in the Wriven dashboard), **sample published data** (what the Delivery
API returns), and a **React component sketch**.

Recreate these in the dashboard under **Content → Content Types → New**, using the
`apiId` and fields exactly as shown. The `apiId` is what goes in your API paths.

---

## A. `product` — catalog + detail

### Fields

| key | label | type | flags |
|-----|-------|------|-------|
| `name` | Name | `text` | required |
| `price` | Price | `number` | required |
| `description` | Description | `richtext` | |
| `image` | Main image | `media` | |
| `gallery` | Gallery | `media` | multiple |
| `category` | Category | `select` | options: `shoes`, `apparel`, `accessories` |
| `featured` | Featured | `boolean` | |
| `inStock` | In stock | `boolean` | |

`apiId`: **`product`** (system `slug` used for URLs, e.g. `running-shoe`).

### Sample delivery response (one entry)

```jsonc
{
  "id": "entry_prod_1",
  "type": "product",
  "slug": "running-shoe",
  "data": {
    "name": "Trail Runner",
    "price": 129.5,
    "description": { "type": "doc", "content": [ /* richtext */ ] },
    "image": { "id": "media_1", "url": "https://cdn…/runner.jpg",
               "alt": "Trail Runner shoe", "width": 1200, "height": 1200, "mime": "image/jpeg" },
    "gallery": [
      { "id": "media_2", "url": "https://cdn…/a.jpg", "alt": null, "width": 600, "height": 600, "mime": "image/jpeg" }
    ],
    "category": "shoes",
    "featured": true,
    "inStock": true
  },
  "publishedAt": "2026-07-20T09:00:00.000Z",
  "updatedAt":   "2026-07-21T12:00:00.000Z"
}
```

### TS type

```ts
import type { WrivenEntry, WrivenMedia } from '@/lib/wriven';

export interface ProductData {
  name: string;
  price: number;
  description: unknown;
  image: WrivenMedia | null;
  gallery: WrivenMedia[];
  category: string;
  featured: boolean;
  inStock: boolean;
}
export type Product = WrivenEntry<ProductData>;
```

### Component sketch

```tsx
// ProductCard.tsx — grid item
export function ProductCard({ p }: { p: Product }) {
  return (
    <a href={`/products/${p.slug}`} className="card">
      <img src={p.data.image?.url} alt={p.data.image?.alt ?? ''} loading="lazy" />
      <h3>{p.data.name}</h3>
      <p>${p.data.price.toFixed(2)}</p>
      {p.data.featured && <span className="badge">Featured</span>}
    </a>
  );
}
```

```tsx
// ProductPage.tsx — detail (route: /products/:slug)
import { WrivenRichText } from '@/components/WrivenRichText';
import { getEntry } from '@/lib/wriven';

export async function loader(slug: string) {
  return getEntry<ProductData>('product', slug);
}

export function ProductDetail({ p }: { p: Product }) {
  return (
    <article>
      <h1>{p.data.name}</h1>
      <p className="price">${p.data.price.toFixed(2)}</p>
      {p.data.image && <img src={p.data.image.url} alt={p.data.image.alt ?? ''} />}
      <WrivenRichText value={p.data.description} />
      {p.data.gallery.length > 0 && (
        <div className="gallery">
          {p.data.gallery.filter(Boolean).map((g) => (
            <img key={g.id} src={g.url} alt={g.alt ?? ''} />
          ))}
        </div>
      )}
    </article>
  );
}
```

### Useful queries

```ts
// Featured shoes, page 1
getEntries<ProductData>('product', {
  filter: { category: 'shoes', featured: 'true' }, sort: '-publishedAt', limit: 12,
});
```

---

## B. `blog_post` — articles

### Fields

| key | label | type | flags |
|-----|-------|------|-------|
| `title` | Title | `text` | required |
| `excerpt` | Excerpt | `text` | |
| `body` | Body | `richtext` | required |
| `coverImage` | Cover image | `media` | |
| `category` | Category | `select` | options: `news`, `engineering`, `tutorials` |
| `tags` | Tags | `select` | multiple; options: `react`, `cms`, `ai` |
| `author` | Author | `reference` | refTypeId → `team_member` |

`apiId`: **`blog_post`**.

### Sample delivery response (with `include=1`)

```jsonc
{
  "id": "entry_post_1",
  "type": "blog_post",
  "slug": "launching-wriven",
  "data": {
    "title": "Launching Wriven",
    "excerpt": "Why we built another headless CMS.",
    "body": { "type": "doc", "content": [ /* richtext with inline images */ ] },
    "coverImage": { "id": "media_3", "url": "https://cdn…/cover.jpg",
                    "alt": "Wriven launch", "width": 1600, "height": 900, "mime": "image/jpeg" },
    "category": "news",
    "tags": ["cms", "ai"],
    "author": {
      "id": "entry_member_1", "type": "team_member", "slug": "jane-doe",
      "data": { "name": "Jane Doe", "role": "Founder",
                "photo": { "url": "https://cdn…/jane.jpg", "alt": "Jane", "width": 400, "height": 400, "mime": "image/jpeg", "id": "media_4" },
                "bio": { /* richtext */ } },
      "publishedAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-06-01T00:00:00.000Z"
    }
  },
  "publishedAt": "2026-08-01T10:00:00.000Z",
  "updatedAt":   "2026-08-01T10:00:00.000Z"
}
```

### TS type

```ts
export interface BlogPostData {
  title: string;
  excerpt: string;
  body: unknown;
  coverImage: WrivenMedia | null;
  category: string;
  tags: string[];
  author: WrivenEntry<TeamMemberData> | string | null; // expanded only with include>0
}
export type BlogPost = WrivenEntry<BlogPostData>;
```

### Component sketch

```tsx
import { WrivenRichText } from '@/components/WrivenRichText';

export function BlogDetail({ post }: { post: BlogPost }) {
  const author = post.data.author;
  return (
    <article className="prose">
      <h1>{post.data.title}</h1>
      <p className="excerpt">{post.data.excerpt}</p>
      {post.data.coverImage && <img src={post.data.coverImage.url} alt={post.data.coverImage.alt ?? ''} />}
      {typeof author === 'object' && author && <AuthorByline name={author.data.name} />}
      <WrivenRichText value={post.data.body} />
      <div className="tags">{post.data.tags.map((t) => <span key={t}>#{t}</span>)}</div>
    </article>
  );
}
```

### Useful queries

```ts
// Latest tutorials, with author expanded
getEntries<BlogPostData>('blog_post',
  { filter: { category: 'tutorials' }, sort: '-publishedAt', limit: 6, include: 1 });

// Single post with author
getEntry<BlogPostData>('blog_post', slug, { include: 1 });
```

---

## C. `team_member` — staff / author profiles

### Fields

| key | label | type | flags |
|-----|-------|------|-------|
| `name` | Name | `text` | required |
| `role` | Role | `text` | |
| `bio` | Bio | `richtext` | |
| `photo` | Photo | `media` | |
| `email` | Email | `text` | |
| `order` | Display order | `number` | |

`apiId`: **`team_member`**.

### TS type

```ts
export interface TeamMemberData {
  name: string;
  role: string;
  bio: unknown;
  photo: WrivenMedia | null;
  email: string;
  order: number;
}
export type TeamMember = WrivenEntry<TeamMemberData>;
```

### Component sketch

```tsx
export function TeamGrid({ members }: { members: TeamMember[] }) {
  return (
    <section className="team-grid">
      {members.map((m) => (
        <div key={m.id} className="member">
          {m.data.photo && <img src={m.data.photo.url} alt={m.data.photo.alt ?? ''} />}
          <h3>{m.data.name}</h3>
          <p>{m.data.role}</p>
          <a href={`mailto:${m.data.email}`}>{m.data.email}</a>
        </div>
      ))}
    </section>
  );
}
```

### Useful query

```ts
// Team sorted by manual order
getEntries<TeamMemberData>('team_member', { sort: 'order', limit: 50 });
```

---

## Mapping it together

The display app's pages map almost 1:1 to content types:

| Page | Content type | Endpoint |
|------|--------------|----------|
| `/products` | `product` | `getEntries('product', { limit: 12 })` |
| `/products/:slug` | `product` | `getEntry('product', slug, { include: 1 })` |
| `/blog` | `blog_post` | `getEntries('blog_post', { sort: '-publishedAt', include: 1 })` |
| `/blog/:slug` | `blog_post` | `getEntry('blog_post', slug, { include: 1 })` |
| `/team` | `team_member` | `getEntries('team_member', { sort: 'order' })` |

The full Vite scaffold (router, hooks, all pages) is in
[08-vite-build-guide.md](./08-vite-build-guide.md).
