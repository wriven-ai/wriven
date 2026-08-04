# 01 — What is Wriven (and why your display app needs no auth)

## Wriven in one paragraph

**Wriven** is an AI-native **headless CMS**. "Headless" means the place where
content is **authored** (the Wriven dashboard) is completely decoupled from the
place where content is **displayed** (your website/app). The two communicate over
HTTP through a **read-only Content Delivery API**. Your display app never runs any
Wriven server code — it just makes HTTP requests and renders JSON.

## The separation of concerns

```
┌───────────────────────┐        ┌──────────────────────┐        ┌─────────────────────┐
│  Wriven Dashboard     │        │  Wriven Gateway      │        │  Your Display App   │
│  (authors edit here)  │ ──▶    │  (Delivery API)      │ ◀──    │  (React + Vite)     │
│  app.wriven.com       │ writes │  GET /v1/projects/…  │ reads  │  public site        │
└───────────────────────┘        └──────────────────────┘        └─────────────────────┘
                                          │
                                          ▼
                                 ┌──────────────────────┐
                                 │  Wriven core service │
                                 │  (Postgres + R2 media)│
                                 └──────────────────────┘
```

- **Authors** log into the dashboard, define **content types** (e.g. "Product",
  "Blog Post"), create **entries**, and **publish** them.
- Your **display app** reads **published** entries over HTTPS with a **read API key**.
- You never write to Wriven from the display app. It is strictly read-only.

## Three API surfaces (you only use one)

Wriven splits its HTTP surface into three. For a public display site you use **only
the first one**:

| API | Auth | Returns | Use it? |
|-----|------|---------|---------|
| **Content Delivery API (CDA)** | `wrk_live_…` read key | **published** entries only | ✅ **Yes — this is all you need** |
| Preview API (CPA) | `wrk_preview_…` preview key | drafts + published | ❌ Only for internal preview/staging builds |
| Management API (CMA) | session cookie / manage key | all statuses, can write | ❌ Only the dashboard uses this |

**The Delivery API only ever returns `published` entries.** That is what makes it
safe to cache aggressively and safe to expose the key publicly.

## Why your display app needs no authentication UI

A Wriven **read key** (`wrk_live_…`) is a **public, project-scoped credential** —
exactly analogous to Contentful's CDA token or Sanity's read token. Its only power
is to read **published** content from **one project**. It cannot write, cannot read
drafts, cannot access other projects, and can be revoked instantly from the
dashboard.

Therefore:

- Your display app has **no login screen, no signup, no sessions, no cookies**.
- The key is placed in the client bundle as an environment variable.
- This is the standard, intended model for every headless CMS public site.

> ⚠️ **Only `read` (`wrk_live_…`) keys are public-safe.** A `preview`
> (`wrk_preview_…`) or `manage` key can read drafts / mutate content and must
> **never** be put in a browser bundle. See [02-getting-credentials.md](./02-getting-credentials.md).

## What "content" looks like

Content in Wriven is organized as:

- **Content types** — schemas (like database tables). Each has an `apiId`
  (e.g. `blog_post`) and a list of **fields** (e.g. `title`, `body`, `coverImage`).
- **Entries** — actual records (like rows). Each entry belongs to a content type,
  has a unique `slug`, a `status` (`draft` / `published`), and a `data` object
  holding the field values.

The Delivery API returns entries in this shape (see [03-delivery-api.md](./03-delivery-api.md)):

```jsonc
{
  "id": "entry_…",
  "type": "blog_post",          // the content type apiId
  "slug": "launching-wriven",
  "data": {                      // the field values
    "title": "Launching Wriven",
    "body": { /* ProseMirror rich-text JSON */ },
    "coverImage": { "url": "https://…", "alt": "…", "width": 1600, "height": 900 }
  },
  "publishedAt": "2026-08-01T10:00:00.000Z",
  "updatedAt":   "2026-08-02T14:30:00.000Z"
}
```

Notable things Wriven resolves **for you automatically** in delivery responses:

- **`media` fields** are replaced with a public object `{ url, alt, width, height, mime }`
  — you render the `url` directly, no extra lookup.
- **`richtext` fields** are ProseMirror JSON documents; inline images inside them are
  also hydrated with `src`/dimensions. You render them with a renderer component
  (provided in [06-rendering.md](./06-rendering.md)).
- **`reference` fields** can optionally be expanded inline (nested entries) using the
  `include` query param.

## What you will NOT do in this project

- No user accounts / auth UI.
- No content authoring / admin UI (that is the Wriven dashboard's job).
- No direct database access (you only use the HTTP API).
- No writes to Wriven.

Everything is read + render. Next: [02-getting-credentials.md](./02-getting-credentials.md).
