# 03 — Media (Storage, Upload & Delivery)

How files (images/video/docs) are uploaded, stored, and returned by the Delivery
API. Lives in **core-service** (owns the `media_assets` table). Storage is behind
an adapter so the backend (R2 now) is a config swap, never a code change.

## Decisions

1. **Storage: Cloudflare R2** — 10 GB free, **zero egress** (decisive for a CMS
   that serves media). S3-compatible.
2. **Direct, presigned upload** — the browser PUTs the file straight to R2 with a
   short-lived presigned URL; bytes never proxy through our API. Then the client
   posts metadata to create the `media_assets` row.
3. **Keys only in the DB** (existing rule) — store the object key, never a URL.
   The public URL is reconstructed at read time from config.
4. **No transforms yet.** The Delivery API returns the original object's public
   URL; the consumer's framework (`next/image`, etc.) optimizes. A transform
   adapter (Cloudflare Images / imgproxy) can be layered later without touching
   content or delivery code — that's the whole point of keys-only.
5. **No server-side image processing.** Dimensions (`width`/`height`) for images
   are read client-side from the `File` before upload and sent with the metadata
   — avoids a `sharp`/native dep in core-service.
6. **Storage adapter.** A `StorageService` exposes `presignUpload` + `publicUrl`.
   Swapping R2 → another S3-compatible store, or adding a transform layer, is a
   new adapter + env, nothing else.

## Data model

`media_assets` already exists ([core schema](../apps/core-service/src/db/schema/index.ts)): `id, workspaceId,
projectId, r2Key, kind (image|video|file), mime, sizeBytes, width, height, alt,
originalFilename, uploadedBy, createdAt, deletedAt`. No schema change needed.

`r2Key` shape: `projects/<projectId>/<uuid>.<ext>` — project-scoped, collision-free.

## Upload flow (presigned, direct-to-R2)

```
1. dashboard: user picks a file
2. client → POST /content/media/presign { filename, contentType, size }
       gateway → core MEDIA_PRESIGN → StorageService.presignUpload(key, type)
       ← { uploadUrl, key }            (presigned PUT, ~5 min TTL)
3. client: PUT file bytes → uploadUrl   (direct to R2, with Content-Type)
       (for images, read width/height from the File first)
4. client → POST /content/media { key, mime, size, width, height, kind, alt,
       originalFilename }
       gateway → core MEDIA_CREATE → insert media_assets row
       ← MediaView { id, url, kind, mime, width, height, alt, ... }
```

Why not proxy through the API: large files would tie up the gateway and double
bandwidth. Presigned PUT offloads the transfer to R2.

## API surface (gateway → core, session auth + workspace/project guards)

| Method | Route | Pattern | Purpose |
|--------|-------|---------|---------|
| POST | `/content/media/presign` | `MEDIA_PRESIGN` | get a presigned PUT URL + key |
| POST | `/content/media` | `MEDIA_CREATE` | persist metadata after upload |
| GET | `/content/media` | `MEDIA_LIST` | paginated library |
| GET | `/content/media/:id` | `MEDIA_GET` | single asset |
| DELETE | `/content/media/:id` | `MEDIA_DELETE` | soft-delete (+ best-effort R2 delete) |

New `CORE_PATTERNS.MEDIA_*`; DTOs `PresignUploadDto`, `CreateMediaDto`;
`MediaView` gains a resolved `url`.

## Delivery

`media` fields store a media asset **id**. The Delivery API resolves every
`media` field value to a public object — always (cheap, and the consumer needs
the URL):

```json
"cover": { "id": "…", "url": "https://cdn…/key", "alt": "…",
           "width": 1200, "height": 630, "mime": "image/jpeg" }
```

`multiple` media fields resolve to an array. Unresolvable ids (deleted asset)
drop to `null`. Independent of `include` depth — media always resolves.

## Authoring UI

- **Media Library page** — real: drag-drop/upload (presign→PUT→create), grid +
  list view, search, inspector pane, fullscreen lightbox, delete, copy-id.
- **Media field picker** — `media`-type fields open the library in a dialog, pick
  an asset (or upload new) → sets the field to the asset id, shows a thumbnail.
- **Inline body images** (rich text) — the editor toolbar's image button opens a
  shared `MediaPickerDialog` (images only); picking inserts a custom TipTap
  `image` node that stores **only `assetId`** (keys-only — never a URL). A React
  NodeView resolves the id → thumbnail for the editor. See "Body media" below.

## Body media (images inside rich text)

The scalable rule extends into the body: an inline image stores a **reference**,
not a baked URL — same as a `media` field.

- **Node shape** (stored in the ProseMirror JSON): `{ type: 'image', attrs: {
  assetId, alt } }`. No `src`. Portable across CDN/transform/host changes.
- **Editor**: `MediaImage` extension + `MediaImageView` NodeView resolves
  `assetId` via `mediaApi.get` for the thumbnail.
- **Delivery**: `DeliveryService.resolveRichTextMedia` walks every `richtext`
  field's JSON, collects image `assetId`s, `resolveMany`, and **hydrates each
  node** in place with `src`/`width`/`height`/`mime`/`alt`. Consumers get a
  ready-to-render `src`. Unresolvable (deleted) → `src: null`. Runs always,
  alongside `resolveMediaFields`, independent of `include` depth.

## Editor layout (Phase 1)

Content editor is now the standard headless layout: a **main writing surface**
(first `text` field as a large title + all `richtext` bodies, with inline images)
and a **right sidebar** (slug, structured fields — media/select/number/etc. —
entry list, publish box, meta). A type with no title/body field falls back to a
plain form in the main column.

## Config (env, added later)

core-service `.env`:
```
R2_ACCOUNT_ID=            # endpoint derived from this
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=https://pub-<hash>.r2.dev   # or a custom domain
# R2_ENDPOINT=            # optional override (e.g. http://localhost:9000 for MinIO)
```
`StorageService` is lazy: it builds the S3 client on first use and throws a clear
`Media storage is not configured` error if env is missing — so the service boots
and the rest of the app works without R2 set up.

**R2 bucket CORS (required for browser uploads).** The presigned PUT happens
cross-origin from the dashboard, so the bucket must allow it — otherwise uploads
fail in the browser with a CORS error. Set on the R2 bucket:
```json
[{ "AllowedOrigins": ["https://app.wriven.com", "http://localhost:3000"],
   "AllowedMethods": ["PUT"],
   "AllowedHeaders": ["Content-Type"],
   "MaxAgeSeconds": 3600 }]
```
And enable **public read** (r2.dev or a custom domain bound to the bucket).

## Security

- Presigned PUT is short-lived (~5 min), scoped to one key + content-type.
- Validate `contentType` (allow-list image/video/file) + a max size before
  presigning. **Size limits** (`MEDIA_MAX_BYTES` in contracts): **5 MB images,
  25 MB other** (video/docs). Enforced server-side in `presign` (authoritative,
  reject before signing) + a client-side guard in `uploadMedia` for instant
  feedback. Note: the client sends `size`; a determined client could presign a
  small size then PUT more — to harden later, sign `Content-Length` in the
  presigned PUT. Fine for the authed dashboard now.
- **Per-workspace storage quota** (`WORKSPACE_MEDIA_QUOTA_BYTES`, **100 MB** — R2
  free-tier budget, ~100 workspaces in 10 GB). Checked in `presign`: sum the
  workspace's live (non-deleted) `sizeBytes`; reject if `used + incoming` exceeds
  the quota, before signing. Soft-deletes free quota (best-effort R2 delete).
- Bucket is private for writes; public **read** only (or signed reads later).
- Soft-delete the row; best-effort delete the R2 object.

## Build order

1. Contracts: `MEDIA_*` patterns, DTOs, `MediaView.url`.
2. core: `StorageService` (R2 adapter) + `MediaService` + controller + module.
3. Gateway: media controller + routes.
4. Delivery: resolve `media` fields to URL objects.
5. Client: `mediaApi` + upload helper (presign→PUT→create).
6. Client: real Media Library page.
7. Client: media field picker in the editor.

## Known follow-ups

- **Delivery media resolution is one query per entry** (N+1) — fine at current
  scale; batch across a list page later if it shows up in profiling.
- **alt editing** in the library needs a `MEDIA_UPDATE` endpoint (not built —
  alt is captured at create / via the field).
- Optional: verify the object exists (HEAD) on `create` to avoid dangling rows.
- **Library quota bar is approximate** — it sums the loaded page of the *current
  project*, but the quota is *workspace-wide*. Add a `MEDIA_USAGE` endpoint
  (returns `workspaceUsage`) and show the real number. Quota itself is enforced
  correctly server-side regardless.

## Later (not now)

- Transform adapter (Cloudflare Images / imgproxy) — variants, `?w=…&format=auto`.
- Signed/private delivery URLs.
- Video posters, multipart upload for large files.

## Sources

- [Cloudflare R2 — zero egress, free tier](https://leanopstech.com/blog/media-storage-serverless-cost-comparison-2026/)
- [Image CDNs 2026 (transform layer, for later)](https://theimagecdn.com/docs/best-image-cdns)
