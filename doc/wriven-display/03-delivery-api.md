# 03 — Delivery API reference

The only API your display app uses. Authenticated by a `read` key, returns
**published** entries only.

## Base

```
{BASE_URL}/v1/projects/{projectId}/content/…
Authorization: Bearer wrk_live_…
```

## Endpoints

### List entries of a content type

```
GET /v1/projects/{projectId}/content/{apiId}
```

Returns a **paginated** envelope:

```jsonc
{
  "success": true,
  "data": {
    "items": [ /* DeliveryEntry[] */ ],
    "page": 1,
    "limit": 20,
    "total": 47
  }
}
```

### Get a single entry by slug

```
GET /v1/projects/{projectId}/content/{apiId}/{slug}
```

Returns one `DeliveryEntry`:

```jsonc
{
  "success": true,
  "data": { "id": "…", "type": "blog_post", "slug": "…", "data": { /*…*/ },
            "publishedAt": "…", "updatedAt": "…" }
}
```

If no published entry has that slug → `404 NOT_FOUND` (`Content not found.`).

## The `DeliveryEntry` shape

```ts
interface DeliveryEntry {
  id: string;                 // stable entry id
  type: string;               // content type apiId, e.g. "blog_post"
  slug: string;               // unique within the content type / project
  data: Record<string, unknown>; // the field values (see 04-content-model.md)
  publishedAt: string | null; // ISO timestamp, null if never published
  updatedAt: string;          // ISO timestamp of last change
}
```

`data` holds the entry's field values, keyed by each field's `key`. The shape of
each value depends on the field type (text, number, media, richtext, reference…).
See [04-content-model.md](./04-content-model.md).

## Query parameters (list endpoint only)

All optional. Mirrors standard headless-CMS conventions.

| Param | Example | Effect |
|-------|---------|--------|
| `select` | `select=title,slug` | **Project** the `data` object to only these field keys (cheaper payloads). |
| `filter[key]` | `filter[category]=news` | **Equality** filter on a `data` field (JSONB text match). Repeatable for multiple fields. |
| `sort` | `sort=-publishedAt` | Sort key. Prefix `-` = descending. Sortable: `publishedAt` (default, desc), `createdAt`, `updatedAt`, `slug`. |
| `page` | `page=2` | 1-based page number. Default `1`. |
| `limit` | `limit=10` | Page size. Default `20`, max `100`. |
| `include` | `include=2` | **Expand `reference` fields** inline, N levels deep (`0`–`3`). `0` = leave references as raw entry ids. |

### Examples

```
# Latest 10 published blog posts, newest first, only title + slug
GET …/content/blog_post?sort=-publishedAt&limit=10&select=title,slug

# Products in the "shoes" category, page 2, 12 per page
GET …/content/product?filter[category]=shoes&page=2&limit=12

# One product by slug, expanding its references 1 level deep
GET …/content/product/running-shoe?include=1
```

### Notes on `filter`

- Filters are **exact, case-sensitive equality** on the field's text value
  (backed by a JSONB GIN index). There are no `$gt`/`$in`/full-text operators on
  the public Delivery API today.
- For numbers/booleans stored in `data`, equality still works because values are
  compared as text (`filter[featured]=true`).
- For "list of things by tag", model tags as a `select` (single) or a `text` field
  and filter on exact value; or create a category content type and reference it.

### Notes on `include` (references)

A `reference` field stores the referenced entry's **id**. With `include=0` (default)
the value is just an id string. With `include=N`, the API replaces it with the full
nested `DeliveryEntry` (resolved recursively to depth N). Unresolved / unpublished
references are left as the raw id. Example:

```jsonc
// include=1
"data": {
  "author": {
    "id": "entry_…", "type": "team_member", "slug": "jane-doe",
    "data": { "name": "Jane Doe", "photo": { "url": "…" } },
    "publishedAt": "…", "updatedAt": "…"
  }
}
```

## Response envelope (success + error)

Every response is wrapped:

```jsonc
// success
{ "success": true, "data": <payload> }

// error
{ "success": false, "error": { "code": "NOT_FOUND", "message": "…", "statusCode": 404 } }
```

**Always check `success`** (or just the HTTP status). The typed client in
[05-client-setup.md](./05-client-setup.md) unwraps `data` for you and throws a
typed error otherwise.

### Error codes you may see

| Code | Status | Meaning / fix |
|------|--------|---------------|
| `UNAUTHORIZED` | 401 | Missing/invalid/expired/revoked token. Check `VITE_WRIVEN_TOKEN`. |
| `FORBIDDEN` | 403 | The path's `projectId` ≠ the key's project, or the key scope can't do this. |
| `NOT_FOUND` | 404 | Wrong `apiId` or `slug`, or no published entry matches. |
| `VALIDATION_ERROR` | 422 | Malformed query params. |
| `RATE_LIMITED` | 429 | Monthly Delivery request quota exceeded (only when usage enforcement is on). |
| `INTERNAL_ERROR` | 500 | Server error — retry. |

The stack trace / internal service names are **never** leaked — only `code` + `message`.

## Caching headers (good to know)

Published responses carry cache hints you can take advantage of:

```
Cache-Control: public, s-maxage=60, stale-while-revalidate=300
Surrogate-Key: proj_{projectId} type_{apiId} entry_{id} …
Cache-Tag:     proj_{projectId} type_{apiId} entry_{id} …
```

- `s-maxage=60` — a CDN may serve a cached copy for 60s, then refresh in the
  background for up to 300s.
- Wriven purges these tags on publish/unpublish/delete, so content stays fresh.
- For a **Vite SPA** (client-side fetch) this mostly matters if you put a CDN in
  front of the API; the browser will still revalidate. For list-heavy pages,
  consider a small client-side cache (e.g. SWR/TanStack Query).

## Pagination recap

```ts
interface Paginated<T> {
  items: T[];
  page: number;   // current page (1-based)
  limit: number;  // page size used
  total: number;  // total matching entries
}
```

Compute "has next page" with `page * limit < total`.

Next: [04-content-model.md](./04-content-model.md) — how fields resolve inside `data`.
