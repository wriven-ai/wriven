# 02 — Getting your credentials & connecting

Your display app needs **three values** to talk to Wriven:

| Value | Example | Where it comes from |
|-------|---------|---------------------|
| **Base URL** | `http://localhost:5000` (dev) / `https://api.yourdomain.com` (deployed) | The Wriven gateway origin |
| **Project ID** | `proj_abc123…` (a UUID) | Dashboard → your Project → API Keys page |
| **API token** | `wrk_live_<32 hex chars>` | Dashboard → Project → API Keys → **Create key** |

## 1. Create a read API key in the dashboard

1. Open the Wriven dashboard, open your **workspace**, open the **project** whose
   content you want to display.
2. Go to **API Keys** (sidebar).
3. **Create key**:
   - **Name**: `Public website` (any label you like)
   - **Scope**: **`read`** ← this is the only scope that is public-safe
4. The dashboard shows the **full token exactly once**:
   `wrk_live_a1b2c3…`. **Copy it now** — it can never be retrieved again. Only a
   display prefix (e.g. `wrk_live_a1b2`) is stored and shown afterwards.
5. Note the **Project ID** shown on the same page.

> If you lose the token, use **Regenerate** on the key's row in the dashboard: it issues a new token (shown once) and the old one stops working immediately.

### Token scopes

| Scope | Prefix | Can read | Public-safe? |
|-------|--------|----------|--------------|
| `read` | `wrk_live_…` | **published** only | ✅ **Yes — use this in your display app** |
| `preview` | `wrk_preview_…` | drafts + published | ❌ Never put in a browser bundle |
| `manage` | `wrk_manage_…` | everything + writes | ❌ Dashboard only |

A `read` key is bound to **one project**. It physically cannot read another project's
content, even within the same workspace — the path's `{projectId}` must match the
key's project or the API returns `403 FORBIDDEN`.

## 2. The base URL & delivery path

The Delivery API lives at:

```
GET  {BASE_URL}/v1/projects/{projectId}/content/{apiId}        # list entries
GET  {BASE_URL}/v1/projects/{projectId}/content/{apiId}/{slug} # one entry
```

- `BASE_URL` = the **gateway origin only** (no path). The client helper appends
  `/v1/projects/…` for you.
- Local development: `http://localhost:5000`
- Production: whatever origin your Wriven gateway is deployed at
  (e.g. `https://api.wriven.com`).

> **Prefix note:** The public path is `/v1/projects/{projectId}/content/…`
> (the dashboard's management API now shares the same `/v1` root). Older gateway
> builds (before the
> global-prefix fix) mistakenly doubled this to `/api/v1/v1/projects/…`, so if
> **every** request `404`s, your Wriven build predates the fix — either update
> Wriven, or temporarily point your base at `/api/v1/v1/…`. The typed client in
> [05-client-setup.md](./05-client-setup.md) defaults to the correct `/v1/…` path.

## 3. Verify the connection (before you write any React)

Run this from a terminal. Replace the three values:

```bash
# Health check (no auth) — confirms the gateway is up
curl http://localhost:5000/v1/health
# -> { "success": true, "data": { "gateway": "ok", "auth": "ok", "core": "ok" } }

# List published entries of the "post" content type (auto-seeded on project creation)
curl "http://localhost:5000/v1/projects/$PROJECT_ID/content/post?limit=3" \
  -H "Authorization: Bearer $TOKEN"
```

You should get:

```jsonc
{
  "success": true,
  "data": {
    "items": [ /* …published entries… */ ],
    "page": 1, "limit": 3, "total": 1
  }
}
```

- If the **health** check works but the content request **404s**, see the prefix
  caveat above.
- If you get `401 UNAUTHORIZED`, the token is wrong/expired/revoked.
- If you get `403 FORBIDDEN`, the `projectId` in the URL doesn't match the key's
  project.
- If `items` is `[]`, there are no **published** entries of that type yet (drafts
  don't count) — publish one in the dashboard first.

## 4. CORS

The Wriven gateway enables CORS with **reflected origins** (`Access-Control-Allow-Origin`
mirrors the requester) and supports credentialed requests. Because the Delivery API
uses a `Bearer` token (not cookies), a browser `fetch` with an `Authorization` header
is a "non-simple" request and triggers a CORS **preflight** (`OPTIONS`) — the gateway
handles it automatically. **So a Vite app running on `localhost:5173` can call the
gateway directly.** No proxy required for development (though one is optional — see
[05-client-setup.md](./05-client-setup.md)).

## 5. Put the values in Vite env vars

Vite exposes env vars to the client only if they are prefixed with `VITE_`. Create
`.env.local` (git-ignored by default):

```bash
# .env.local  (NEVER commit this)
VITE_WRIVEN_BASE_URL=http://localhost:5000
VITE_WRIVEN_PROJECT_ID=11111111-2222-3333-4444-555555555555
VITE_WRIVEN_TOKEN=wrk_live_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

Read them in code via `import.meta.env.VITE_WRIVEN_*`.

> **Is it OK to ship `wrk_live_…` in the browser bundle?** **Yes.** A `read` key
> only reads published content for one project — that is its entire purpose, and it
> is exactly how Contentful/Sanity delivery tokens work. It is **not** a secret in
> the "anyone who has it can do damage" sense. (Do **not** ship a `preview` or
> `manage` key, which can read drafts / mutate.)

Next: [03-delivery-api.md](./03-delivery-api.md) — the full API reference.
