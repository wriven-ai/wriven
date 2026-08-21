# 09 — Troubleshooting & FAQ

Symptoms → cause → fix. Always start by reproducing with `curl` (it removes the
browser from the equation).

## First diagnostic: hit the API directly

```bash
curl "http://localhost:5000/v1/projects/$PROJECT_ID/content/post?limit=3" \
  -H "Authorization: Bearer $TOKEN"
```

Expected: `{ "success": true, "data": { "items": [...], "page": 1, "limit": 3, "total": N } }`.

If `curl` works but the app doesn't → browser/CORS/env issue.
If `curl` also fails → see the table below.

---

## Errors by code / status

### `401 UNAUTHORIZED`
- **Cause:** missing, malformed, wrong, expired, or revoked token.
- **Fix:** check `VITE_WRIVEN_TOKEN` is set and starts with `wrk_live_`. Restart the
  dev server (Vite only reads env at start). If the key was revoked, create a new one.

### `403 FORBIDDEN` — "This API key cannot access the requested project."
- **Cause:** the `projectId` in the URL (from `VITE_WRIVEN_PROJECT_ID`) doesn't
  match the key's project. Keys are scoped to one project.
- **Fix:** confirm the Project ID on the API Keys page matches your env var.

### `404 NOT_FOUND`
- **Cause (A):** wrong content-type `apiId`. It's the machine id (`blog_post`), not
  the display name ("Blog Post"). Check spelling/casing.
- **Cause (B):** wrong `slug`, or **no published entry** has that slug (drafts don't
  count).
- **Cause (C):** **old gateway build** — Wriven gateways before the global-prefix
  fix mistakenly served delivery at `/api/v1/v1/projects/…` instead of
  `/v1/projects/…`. **This makes *every* request 404.**
  - Verify: `curl http://localhost:5000/v1/health` works but
    `…/v1/projects/…` 404s → you're on an old build.
  - Fix: update Wriven (preferred). Or, in `src/lib/wriven.ts`, change `CONTENT_BASE`
    to `${BASE_URL}/api/v1/v1/projects/${PROJECT_ID}/content` to match the old build.

### `422 VALIDATION_ERROR`
- **Cause:** malformed query params — bad `select` keys, non-numeric `page`/`limit`,
  `limit > 100`, unknown `sort` key, etc.
- **Fix:** re-read the query-param rules in [03-delivery-api.md](./03-delivery-api.md).

### `429 RATE_LIMITED`
- **Cause:** the workspace's monthly Delivery request quota is exhausted *and*
  usage enforcement is on. (Default enforcement is off → this rarely triggers.)
- **Fix:** upgrade the plan, or cache client-side (TanStack Query / SWR) to cut
  requests.

### `500 INTERNAL_ERROR`
- **Cause:** server-side failure.
- **Fix:** retry (transient). If persistent, check the gateway `/health`.

### Network error (`WrivenError` with `status: 0`, code `NETWORK_ERROR`)
- **Cause:** the gateway isn't reachable (wrong base URL, CORS blocked, dev server
  down).
- **Fix:** confirm `VITE_WRIVEN_BASE_URL` is just the origin (no trailing path),
  the gateway is running, and (browser) the network tab shows the request reaching it.

---

## "Items array is empty" (`items: []`, `total: 0`)

Almost always one of:
1. **Entries are drafts, not published.** The Delivery API returns published only.
   Publish at least one entry in the dashboard.
2. **Wrong content-type `apiId`** → you queried a type with no entries.
3. **A `filter` doesn't match.** Filters are exact, case-sensitive text equality.
   `filter[category]=Shoes` won't match `shoes`.
4. **You're querying a different project than the one you published into.**

---

## Media field shows the raw id instead of an object

You shouldn't ever see a raw media id in a Delivery response — `media` fields are
always auto-resolved to `{ url, alt, … }`. If you see a string:
- You're looking at a **`reference`** field (entry ids), not a `media` field. Use
  `include=1..3` to expand references, or fetch the referenced entry separately.
- Or the field was created as `text` instead of `media`. Fix the content type.

---

## Rich text renders blank

- `<WrivenRichText value={undefined} />` → renders `null`. Pass the actual field:
  `value={entry.data.body}`.
- The field is empty in the entry → the doc has no `content`. Expected.
- You passed a `string` — rich-text is a JSON **object** (ProseMirror doc), not a
  string. If a field holds plain text, it's a `text` field; render `{entry.data.x}`
  directly.

---

## Image broken (`<img src={undefined}>`)

- A `media` field that's empty comes back as `null` (single) or `null` inside the
  array (multiple). Guard before reading `.url`:
  `entry.data.image?.url`. Filter `multiple` arrays: `.filter(Boolean)`.
- For inline images in rich text, the API hydrates `node.attrs.src`. If `src` is
  `null`, the referenced media was deleted/unpublished — the current
  `@wriven-ai/react` renderer (and the vendored version in
  [06-rendering.md](./06-rendering.md)) **skips the node entirely** (returns
  `null`), so a deleted image simply doesn't render. Older renderer versions
  emitted a srcless `<img>` — if you see that, override the `image` node or bump
  the package.

---

## CORS / preflight errors in the browser

The gateway enables reflected-origin CORS and handles preflight. If you still see
CORS errors:
- You're hitting a **different origin** than your gateway (typo in base URL).
- You put a path in `VITE_WRIVEN_BASE_URL` (it must be origin only — the client
  appends `/v1/…`).
- During dev you can sidestep entirely with the Vite proxy
  ([05-client-setup.md](./05-client-setup.md)) — set `VITE_WRIVEN_BASE_URL=/wriven-api`.

---

## Env vars are `undefined` in the app

- Vite only exposes vars prefixed with `VITE_`. Confirm the names.
- You **must restart `npm run dev`** after editing `.env.local`.
- `.env.local` must be at the project root.
- In the built bundle the values are inlined — for production builds, set them in
  your hosting provider's build environment.

---

## TypeScript: `data` is `Record<string, unknown>`

That's the safe default. Narrow it by passing your interface as the generic:
`wriven.getEntries<ProductData>('product', …)`. See the typed examples in
[07-content-type-examples.md](./07-content-type-examples.md).

---

## "Do I ever need the Preview API for a public site?"

No. The public site uses a `read` (`wrk_live_…`) key and shows published content
only. The Preview API (`wrk_preview_…`) is for an internal preview/staging build
that shows drafts — and that key must never be in a public bundle. Keep it simple:
one `read` key, published content only.

---

## Still stuck?

Re-read in order: [02](./02-getting-credentials.md) → verify creds, [03](./03-delivery-api.md)
→ request shape, [05](./05-client-setup.md) → client wiring, [06](./06-rendering.md)
→ rendering. The overwhelming majority of issues are credentials, unpublished
entries, or the self-hosted path prefix.
