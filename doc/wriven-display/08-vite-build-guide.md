# 08 — Vite build guide (end to end)

A complete, opinionated scaffold for a **React + Vite + TypeScript** display app
that reads published content from Wriven. Copy these files; adjust content types to
match what you created in the dashboard ([07-content-type-examples.md](./07-content-type-examples.md)).

## 0. Prerequisites

- Node 18+ and npm.
- A running Wriven gateway you can reach, a **project**, a published entry or two,
  and a **`read` (`wrk_live_…`) API key** (see [02-getting-credentials.md](./02-getting-credentials.md)).
- Verify with `curl` before coding.

## 1. Scaffold

```bash
npm create vite@latest wriven-display -- --template react-ts
cd wriven-display
npm install
npm install react-router-dom
# optional, recommended for caching/refetch:
npm install @tanstack/react-query
```

No other runtime deps required — the Wriven client is vendored and uses only `fetch`.

## 2. Environment

Create **`.env.local`** (git-ignored):

```bash
VITE_WRIVEN_BASE_URL=http://localhost:5000
VITE_WRIVEN_PROJECT_ID=<project id>
VITE_WRIVEN_TOKEN=wrk_live_…
```

> Read [02-getting-credentials.md](./02-getting-credentials.md) for the security
> model and the self-hosted **prefix caveat** (`/v1/…` vs `/api/v1/v1/…`).

## 3. Project structure

```
wriven-display/
├─ .env.local
├─ index.html
├─ vite.config.ts
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx
│  ├─ lib/
│  │  └─ wriven.ts                 # ← from 05-client-setup.md
│  ├─ types/
│  │  └─ content.ts                # BlogPost, Product, TeamMember interfaces
│  ├─ components/
│  │  ├─ WrivenRichText.tsx        # ← from 06-rendering.md
│  │  ├─ Media.tsx
│  │  ├─ States.tsx                # Loading / Error / Empty
│  │  └─ layout/
│  │     ├─ Navbar.tsx
│  │     └─ Layout.tsx
│  ├─ hooks/
│  │  └─ useAsync.ts               # ← from 06-rendering.md (or use react-query)
│  └─ pages/
│     ├─ HomePage.tsx
│     ├─ ProductListPage.tsx
│     ├─ ProductDetailPage.tsx
│     ├─ BlogListPage.tsx
│     ├─ BlogDetailPage.tsx
│     └─ TeamPage.tsx
```

## 4. The Wriven client & types

- Paste the client from [05-client-setup.md](./05-client-setup.md) into `src/lib/wriven.ts`.
- Paste `WrivenRichText` from [06-rendering.md](./06-rendering.md) into `src/components/WrivenRichText.tsx`.
- Put the `Product`/`BlogPost`/`TeamMember` interfaces from
  [07-content-type-examples.md](./07-content-type-examples.md) into `src/types/content.ts`.

## 5. Routing (`src/App.tsx`)

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { HomePage } from '@/pages/HomePage';
import { ProductListPage } from '@/pages/ProductListPage';
import { ProductDetailPage } from '@/pages/ProductDetailPage';
import { BlogListPage } from '@/pages/BlogListPage';
import { BlogDetailPage } from '@/pages/BlogDetailPage';
import { TeamPage } from '@/pages/TeamPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/products" element={<ProductListPage />} />
          <Route path="/products/:slug" element={<ProductDetailPage />} />
          <Route path="/blog" element={<BlogListPage />} />
          <Route path="/blog/:slug" element={<BlogDetailPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
```

(If you'd rather not configure the `@/` alias, use relative imports — or add it in
`vite.config.ts` and `tsconfig.json` via Vite's `resolve.alias` + TS `paths`.)

## 6. Data fetching pattern (plain hook)

`src/hooks/useAsync.ts` is in [06-rendering.md](./06-rendering.md). Use it, or use
TanStack Query:

```tsx
// with react-query (preferred for lists — gives caching + refetch)
import { useQuery } from '@tanstack/react-query';
import { wriven } from '@/lib/wriven';

export function useProducts(category?: string) {
  return useQuery({
    queryKey: ['products', category],
    queryFn: () =>
      wriven.getEntries('product',
        category ? { filter: { category }, sort: '-publishedAt', limit: 24 } : { limit: 24 }),
  });
}
```

## 7. Example pages

### Home page (mix of content types)

```tsx
import { wriven } from '@/lib/wriven';
import { useAsync } from '@/hooks/useAsync';
import { Loading, ErrorState, Empty } from '@/components/States';
import { ProductCard } from '@/components/ProductCard';
import type { BlogPostData, ProductData } from '@/types/content';

export function HomePage() {
  const products = useAsync(
    () => wriven.getEntries<ProductData>('product', { filter: { featured: 'true' }, limit: 4 }),
    []);
  const posts = useAsync(
    () => wriven.getEntries<BlogPostData>('blog_post', { sort: '-publishedAt', limit: 3, include: 1 }),
    []);

  return (
    <>
      <section className="hero"><h1>Our store</h1></section>

      <section>
        <h2>Featured products</h2>
        {products.loading ? <Loading/> :
         products.error  ? <ErrorState error={products.error}/> :
         !products.data?.items.length ? <Empty/> :
         <div className="grid">{products.data.items.map((p) => <ProductCard key={p.id} p={p} />)}</div>}
      </section>

      <section>
        <h2>From the blog</h2>
        {/* render posts.data.items ... */}
      </section>
    </>
  );
}
```

### List page (products)

```tsx
export function ProductListPage() {
  const { data, error, loading } = useAsync(
    () => wriven.getEntries<ProductData>('product', { sort: '-publishedAt', limit: 24 }),
    []);
  if (loading) return <Loading/>;
  if (error)   return <ErrorState error={error}/>;
  if (!data?.items.length) return <Empty/>;
  return <div className="grid">{data.items.map((p) => <ProductCard key={p.id} p={p} />)}</div>;
}
```

### Detail page (product, by slug)

```tsx
import { useParams } from 'react-router-dom';
import { WrivenRichText } from '@/components/WrivenRichText';

export function ProductDetailPage() {
  const { slug = '' } = useParams();
  const { data: p, error, loading } = useAsync(
    () => wriven.getEntry<ProductData>('product', slug), [slug]);

  if (loading) return <Loading/>;
  if (error || !p) return <ErrorState error={error ?? new Error('Not found')} />;

  return (
    <article>
      <h1>{p.data.name}</h1>
      <p className="price">${p.data.price.toFixed(2)}</p>
      {p.data.image && <img src={p.data.image.url} alt={p.data.image.alt ?? ''} />}
      <WrivenRichText value={p.data.description} />
    </article>
  );
}
```

### States components

```tsx
// src/components/States.tsx
import { WrivenError } from '@/lib/wriven';

export function Loading() { return <p aria-busy>Loading…</p>; }
export function Empty()   { return <p>No content yet.</p>; }
export function ErrorState({ error }: { error: Error }) {
  const isWriven = error instanceof WrivenError;
  return (
    <p role="alert">
      {isWriven ? `Couldn't load content (${error.code}).` : 'Something went wrong.'}
    </p>
  );
}
```

## 8. Run

```bash
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
npm run preview  # serve the production build locally
```

If nothing loads, jump to [09-troubleshooting.md](./09-troubleshooting.md) — most
issues are: wrong env var, unpublished entries, or the prefix caveat.

## 9. Deploy notes

- **Vercel / Netlify:** add `VITE_WRIVEN_BASE_URL`, `VITE_WRIVEN_PROJECT_ID`,
  `VITE_WRIVEN_TOKEN` as build env vars. They're inlined at build time. A `read` key
  is safe to ship (published content only). Build output is a static SPA — set SPA
  fallback (`redirects` / `_redirects`: `/* /index.html 200`) so client routes like
  `/blog/:slug` work on refresh.
- **Self-host (nginx):** `npm run build`, copy `dist/`, add a `try_files` fallback
  to `index.html`.
- **CDN in front of the API:** the Delivery API sets `s-maxage=60,
  stale-while-revalidate=300` + cache tags; a CDN will speed up reads and Wriven
  purges on publish.
- The `Authorization: Bearer` header means the browser will send a CORS preflight —
  the gateway handles it. If you front the API with your own proxy, forward
  `Authorization` and `OPTIONS`.

Next: [09-troubleshooting.md](./09-troubleshooting.md).
