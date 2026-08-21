# 04 — The content model & how fields resolve

This explains how to think about Wriven content types, what each field type looks
like **inside a Delivery API response**, and how to model the data your display app
needs.

## Content types & entries

- A **content type** is a schema (like a table). It has:
  - `name` — human label ("Blog Post")
  - `apiId` — machine id used in API paths (`blog_post`) — **this is what you put in
    the URL**
  - `fields: FieldDef[]` — the fields
- An **entry** is a record of that type (like a row). Its `data` object holds the
  field values.

> Projects start **empty** — create your content types in the dashboard's content
> builder first (e.g. one with `apiId: "post"`), then `GET …/content/post` serves
> its published entries.

## Field types

Each field has a `key` (used in `data`), a `label`, a `type`, and optional flags:
`required`, `unique`, `multiple`, `options` (for `select`), `refTypeId` (for
`reference`).

| `type` | Stored value | **In a delivery response** | Notes |
|--------|--------------|----------------------------|-------|
| `text` | string | `string` | Single-line / plain text. |
| `richtext` | ProseMirror JSON | **ProseMirror JSON doc** (see below) | Rendered with the rich-text component. |
| `number` | number | `number` | |
| `boolean` | boolean | `boolean` | Great for `featured`, `inStock`. |
| `date` | ISO string | `string` | |
| `select` | one of `options` | `string` (or `string[]` if `multiple`) | Use for categories/status. |
| `media` | media asset **id** | **`DeliveryMedia` object** (auto-resolved) | See below. `multiple` → array. |
| `reference` | entry **id** | entry id `string` (or `string[]`), **or nested `DeliveryEntry`** if `include>0` | See [03-delivery-api.md](./03-delivery-api.md). |

### `media` fields → auto-resolved `DeliveryMedia`

You never deal with raw asset ids. The Delivery API replaces a `media` field value
with:

```ts
interface DeliveryMedia {
  id: string;
  url: string;        // public CDN URL — render this directly in <img src>
  alt: string | null;
  width: number | null;
  height: number | null;
  mime: string | null;
}
```

- Single media (`multiple` false) → the object above (or `null`).
- Multiple media (`multiple: true`) → `DeliveryMedia[]` (empty slots `null`).

```jsx
<img src={entry.data.coverImage.url} alt={entry.data.coverImage.alt ?? ''}
     width={entry.data.coverImage.width ?? undefined} />
```

### `richtext` fields → ProseMirror JSON

Rich-text bodies are stored as a **ProseMirror document** (nested JSON nodes), and
the Delivery API **hydrates inline `image` nodes** inside them with resolved
`src`/`alt`/dimensions automatically. You render the doc with a renderer component
that walks the node tree — see [06-rendering.md](./06-rendering.md) for a complete,
copy-pasteable React component. Example node shapes:

```jsonc
// a paragraph with bold text
{ "type": "paragraph", "content": [
  { "type": "text", "text": "Hello " },
  { "type": "text", "text": "world", "marks": [ { "type": "bold" } ] }
]}

// an inline image (already resolved by the API)
{ "type": "image", "attrs": { "src": "https://…", "alt": "…", "width": 800, "height": 600 } }
```

Supported node types: `doc`, `paragraph`, `heading` (`attrs.level` 1–6), `text`
(with marks `bold`, `italic`, `strike`, `code`, `link`), `bulletList`, `orderedList`,
`listItem`, `blockquote`, `codeBlock`, `horizontalRule`, `hardBreak`, `image`.

### `reference` fields

A reference points to another entry (of the target content type `refTypeId`). By
default (`include=0`) the value is the referenced entry's **id string**. With
`include=1..3` it is expanded inline to a nested `DeliveryEntry`. Use this to avoid
waterfall requests (e.g. fetch a blog post and its author in one call).

### `select` fields

Constrained to the type's `options` list. Use for taxonomy-ish values
(`category`, `status`, `tier`). Filter with `filter[category]=…`.

## Modeling guidance for a display site

Aim for **flat, render-friendly** types. Put everything the page needs into fields
so one fetch is enough.

- **Slugs** — every entry already has a system `slug`; prefer it over a custom field
  for routing. Keep slugs URL-safe.
- **Images** — use `media` fields (resolved to URLs for you). Use `multiple: true`
  for galleries.
- **Bodies / descriptions** — use `richtext` for long-form (blog posts, product
  descriptions with formatting); `text` for short blurbs.
- **Taxonomy** — `select` for fixed categories; or a dedicated content type +
  `reference` for rich categories (name + image + description).
- **Relations** — `reference` for author→member, product→category. Fetch with
  `include=1` to pull them in one go.
- **Booleans** — `featured`, `inStock`, `publishedOnHomepage` for simple flags.

Ready-made type definitions (with exact field JSON) are in
[07-content-type-examples.md](./07-content-type-examples.md): `product`,
`blog_post`, `team_member`.

## How to create content types

For a display-only project, the easiest path is to **create the types and entries in
the Wriven dashboard** (Content → Content Types → New). You do not need the
Management API. Once a type exists and has published entries, your display app can
read it immediately.

Next: [05-client-setup.md](./05-client-setup.md) — the typed client code.
