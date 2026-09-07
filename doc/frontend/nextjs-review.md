# Next.js 16 Performance Review — `apps/client`

**Date:** 2026-09-06, re-verified 2026-09-07 · **Fixes applied:** 2026-09-07 (all HIGH/MEDIUM + LOW) · **Next.js:** 16.2.9 · **React:** 19 · **Bundler:** Turbopack (Next 16 default) · **Deploy:** Vercel

Review of how well the client app uses Next.js 16 App Router features: server/client component split, caching/render modes, images, and route-level resilience. All findings verified against the pinned Next.js 16.2.9 docs and production builds.

> **Status: all findings fixed** (commits `35c2c43`…`2e7cc31` on `bugfix`). F2 has one intentional exception — `BottomCta` stays a client component (its CTA reads auth state; the original review's zero-interactivity grep missed the `useAuth` call).

## 1. Route + bundle state (2026-09-07, after fixes)

| Area | Before | After |
|---|---|---|
| `/blog/[slug]` | ƒ dynamic, fake shared body, wrong-article bug | **● SSG ×4** (`generateStaticParams` + `dynamicParams = false`), distinct per-post bodies |
| `/pricing` | ○ static shell, plans client-fetched | ○ static + **1 h ISR** — plans server-rendered into HTML |
| `/` homepage JS | ~334 KB gz (motion on page) | **~287 KB gz** (motion removed from homepage) |
| Public-route JS baseline | ~273 KB gz | ~273 KB gz — unchanged, dominated by react-dom + TanStack Query + providers stack (see F10 note) |
| `/anowar-dp_compressed.jpg` | 328 KB raw `<img>` | **48 KB**, `next/image` everywhere on public pages (AVIF/WebP enabled) |
| Anonymous page load | `/auth/me` 401 → `/auth/refresh` 401 | **zero auth calls** (`proxy.ts` flag cookie gates the bootstrap) |

## 2. What's already right (kept)

- Root layout is a server component; `next/font` (Manrope, CSS variable); `metadataBase`, title template, OG/Twitter metadata — textbook. Now also `viewport.themeColor` (was F11).
- Server layouts supply metadata for client pages (`blog/layout`, `blog/[slug]/layout` `generateMetadata`, `pricing/layout`, `docs/*`, `(auth)`, `(dashboard)` noindex).
- Docs: 15 server-component static pages with per-page metadata + canonicals.
- `sitemap.ts`, `robots.ts`, `opengraph-image.tsx` conventions; sitemap honest about `lastmod`.
- `Providers` client wrapper receives server children — correct composition pattern.
- TanStack Query hygiene: per-query `staleTime`, `retry: 1`, `refetchOnWindowFocus: false`, `QueryClient` in `useState`.
- `lib/api.ts`: deduped refresh, in-memory CSRF, typed errors.
- `next/image` with scoped `remotePatterns` (r2.dev, googleusercontent, picsum.photos) — avatars, logo, blog covers.
- Homepage JSON-LD (`Organization` + `WebSite` + `SoftwareApplication`) server-rendered; offers now `AggregateOffer` from real plan prices with a free-tier fallback.

## 3. Findings — all fixed (2026-09-07)

### HIGH — fixed

- **F1 ✅ Blog SSG.** `blog/[slug]/page.tsx` rewritten as a server component: `generateStaticParams` over `mockPosts`, `dynamicParams = false` (unknown slug → 404 — kills the `|| mockPosts[0]` wrong-article bug), `BlogBlock` union + distinct 4-post bodies in `lib/blogData.ts`, dead Comment/Share buttons removed, `blog/[slug]/layout.tsx` `generateMetadata` kept (unknown slug → `notFound()`). Route table: **● SSG with 4 prerendered params**.
- **F2 ✅ Server components (10 of 11).** `'use client'` removed from `Testimonials`, `ProblemStatement`, `CoreCapabilities`, `CoreFeaturesWireframe`, `HowItWorks`, `WeaveRegistry`, `PricingBanner`, `Footer`, `about/page.tsx`, `blog/page.tsx`. `BottomCta` intentionally stays client (uses `useAuth` for its CTA — missed by the original grep).
- **F3 ✅ `WrivenLogo`** now server-rendered: two `<Image>`s toggled by `dark:hidden` / `hidden dark:block` (next-themes sets `class="dark"` on `<html>`). No `useTheme`, no mounted gate, no flash.
- **F4 ✅ Pricing server-rendered.** `lib/server/plans.ts` (`getPlans()`, `fetch` + `next: { revalidate: 3600 }`, try/catch → null); `pricing/page.tsx` is a server shell rendering `components/pricing/pricing-client.tsx` with `initialPlans`; `usePublicPlans` gained an `initialData` param and stays as the degraded-mode fallback when the server fetch failed. Plans now appear in the prerendered HTML.
- **F5 ✅ Images.** `next/image` on blog covers (`fill` + `sizes`), author avatars, about founder photo; `picsum.photos` added to `remotePatterns`; `images.formats: ['image/avif', 'image/webp']`; founder photo recompressed **328 KB → 48 KB** (512 px square, mozjpeg q78). Dashboard `<img>`s (authed R2 assets) intentionally left as-is.
- **F6 ✅ Route resilience.** `app/not-found.tsx` (branded 404, Header/Footer chrome), `app/error.tsx` (public), `(dashboard)/error.tsx`, `(auth)/error.tsx` — all with `reset()` retry.

### MEDIUM — fixed

- **F7 ✅ `staleTimes`.** `experimental: { staleTimes: { dynamic: 30, static: 180 } }` in `next.config.js` (key shape verified against 16.2.9's config schema).
- **F8 ✅ `src/proxy.ts`** (Next 16's middleware rename, confirmed in the build route table as "ƒ Proxy"). Cookie name verified at `api-gateway/src/auth/auth.controller.ts`: `refresh_token`. Unauthenticated hits on `/(dashboard|w|workspaces|profile|billing)` redirect to `/login?next=…` instantly; UX fast-path only, gateway stays the auth boundary. `RequireAuth.tsx` comment corrected.
  - **Post-fix gotcha (hit in dev):** cookie **path** scoping, not httpOnly, was the real constraint — the refresh cookie was originally `path: '/v1/auth'`, so it was never sent on client-origin requests and the proxy saw every visitor as anonymous (bounced authed users to /login). Fixed in `3ce750d`: refresh cookie now `path: '/'`; access/CSRF stay `/v1`-scoped. Lesson: "httpOnly cookies are server-readable" is only half the check — the path must cover the client origin too.
- **F9 ✅ Motion off the homepage.** Hero's two infinite `stroke-dashoffset` loops → `animate-dash-march(-rev)` keyframes; EdgeBento staggered bar grow → `animate-bar-grow` + per-bar `animationDelay`; OutputRegistry/CompilerLab `AnimatePresence` swaps → keyed remounts with `animate-panel-in` / `animate-stage-in` (enter-only fades — exit transitions dropped by design). All wrapped in `prefers-reduced-motion: none`. Homepage JS 332 → **287 KB gz**. `motion` remains only on route-split dashboard chunks (navbar, project pages).
- **F10 ◐ Baseline cost, partially addressed.** Public baseline stays ~273 KB gz — it is react-dom (~130 KB) + TanStack Query + zustand + sonner + next-themes + the legitimately-client `Header` island. F2/F3/F9 removed everything removable above that floor. Going lower means structural changes (loading TanStack Query only inside dashboard/auth layouts) — future work, not planned.
- **F11 ✅ `viewport.themeColor`** exported from the root layout (`#faf8f5` light / `#060417` dark).
- **F12 ✅ No more doomed auth calls on public pages.** `proxy.ts` mirrors the httpOnly `refresh_token` cookie into a readable `wriven_session=1` flag; `Providers` runs the silent `authApi.me()` bootstrap only when the flag is present, otherwise resolves to unauthenticated immediately (public pages also stop living in `loading` state). Logout/expiry clears the flag via the proxy.
- **F13 ✅ Blog data deduped.** `blog/page.tsx` now derives featured/remaining from `mockPosts` (`blogData.ts`) — single source of truth for the list, the post pages, and `sitemap.ts`.

### LOW — fixed

- **`/api/hello` removed.** `/api/health` kept (real uptime probe).
- `poweredByHeader: false`; `images.formats` AVIF+WebP (see F5).
- Homepage JSON-LD enriched: `SoftwareApplication.offers` → `AggregateOffer` with real low/high monthly prices (free-tier `Offer` fallback when the gateway is unreachable).
- Left as-is (accepted): in-memory contact rate limit (fine at current scale, Upstash if abused), contact form's manual `useState` (consistency optional).

## 4. Next.js 16 feature usage (after fixes)

| Feature | Status |
|---|---|
| Turbopack dev + build | Default — used |
| `generateStaticParams` + `dynamicParams = false` | **`/blog/[slug]` SSG ×4** |
| `fetch` + `revalidate` (ISR) | **`/pricing`, `/` (1 h, plans)** |
| Server components | Docs, root, marketing sections, blog list/post, about, pricing shell, logo, footer |
| `proxy.ts` | **Edge auth redirect + session flag** |
| `staleTimes` router cache | Enabled (30 s dynamic / 180 s static) |
| Route-level `not-found`/`error` | Root 404 + public/dashboard/auth error boundaries |
| `next/image` | All public-page imagery; AVIF/WebP |
| `cacheComponents` + `'use cache'` + PPR | Still off — opt-in future work if pages ever mix static + user data |

## 5. Remaining / future work

1. **F10 floor:** load TanStack Query (and friends) only in dashboard/auth layouts to cut the public baseline below ~200 KB gz — structural, needs its own pass.
2. `cacheComponents` + `'use cache'` + PPR — opt-in after traffic patterns justify it.
3. Dashboard `<img>` → `next/image` (media library, support attachments, editor previews).
4. Contact rate limit → Upstash if abuse appears.
5. `Hero`/`EdgeBento`/`OutputRegistry`/`CompilerLab`/`SandboxPlayground`/`BottomCta` remain client islands (genuine interactivity) — verify per-release that none regains a zero-interactivity `'use client'`.
