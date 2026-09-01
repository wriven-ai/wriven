# Deployment Guide

How to run Wriven for development/testing: **backend on Render**, **frontend on
Vercel**, **database on Supabase**, behind your domain (`wriven.tech` +
`api.wriven.tech`).

This is a deployment runbook, not a feature doc. It is self-contained — follow it
top to bottom. The [`render.yaml`](../render.yaml) Blueprint at the repo root
implements everything in §4.

---

## 1. Topology

| Component | Host | Type | Port | Notes |
|-----------|------|------|------|-------|
| api-gateway | **Render** | Web Service (public) | Render `$PORT` | the only public HTTP entry → `api.wriven.tech` |
| auth-service | **Render** | Private Service (`pserv`) | 5001 (TCP) | NestJS microservice, internal only |
| core-service | **Render** | Private Service (`pserv`) | 5002 (TCP) | NestJS microservice, internal only |
| ai-service | **Render** | Private Service (`pserv`) | 8000 (HTTP) | FastAPI (Python); AI content generation. core-service → ai-service over HTTP (`AI_SERVICE_URL`), the only NestJS↔non-NestJS hop. Provider key (`AI_API_KEY`) lives here only. |
| client (Next.js) | **Vercel** | — | — | `apps/client`, → `wriven.tech` |
| Postgres | **Supabase** | managed | — | shared DB, schema-isolated (`auth_svc`, `core_svc`) |

**Why this shape (verified in code):**

- Services are **NestJS microservices over TCP, brokerless** (`Transport.TCP`, no
  Redis/RMQ — see each `main.ts` + `app.module.ts`). Render Private Services carry
  TCP internally, so auth/core are `pserv`; the gateway reaches them by internal
  hostname. **No Redis to deploy.**
- The gateway discovers peers via `AUTH_SERVICE_HOST/PORT` + `CORE_SERVICE_HOST/PORT`
  env ([app.module.ts](../apps/api-gateway/src/app/app.module.ts)).
- Each service has a Dockerfile that builds from **repo root** (`pnpm nx build <svc>`
  inside), so Render builds each with root context + `apps/<svc>/Dockerfile`.

---

## 2. Prerequisites

- A **domain** (`wriven.tech`).
- Accounts: **Render**, **Vercel**, **Supabase** (project already provisioned), plus
  your **Google OAuth** app and **Stripe** (sandbox) if testing billing.
- The repo on **GitHub**, connected to Render + Vercel.
- Local: Node 20+, pnpm, to run migrations.

---

## 3. Database (Supabase)

Get **two** connection strings from Supabase → Project Settings → Database:

| Env var | Supabase value | Used for |
|---------|----------------|----------|
| `DATABASE_URL` | **Transaction pooler** — port `6543`, append `?pgbouncer=true&connection_limit=1` | runtime queries (pooled) |
| `DIRECT_URL` | **Session/Direct** — port `5432` | Drizzle migrations |

Drizzle uses pooled for queries and direct for migrations — both are required.

### Migrations (run once, locally)

Each service migrates its **own** schema. The DB is external (Supabase), so run
migrations from your machine pointing at Supabase — no Render step needed:

```bash
# put the Supabase URLs in each service's .env (or export them), then:
pnpm nx run auth-service:db:migrate
pnpm nx run core-service:db:migrate
```

> Verify the exact migrate target name with `pnpm nx run auth-service:` (tab) — it is
> whatever Drizzle target that service defines. Run the same two after any future
> schema change. (Alternatively, ask the agent to apply them via the connected
> Supabase MCP.)

---

## 4. Deploy on Render (Blueprint)

The [`render.yaml`](../render.yaml) at the repo root defines all three services +
a shared env group. To use it:

1. Render Dashboard → **New → Blueprint** → select this repo. Render reads
   `render.yaml` and creates `wriven-gateway` (web), `wriven-auth` + `wriven-core`
   (pserv), and the `wriven-shared` env group.
2. **Fill the secrets.** Every `sync: false` key prompts you in the dashboard
   (Render marks them secret). These never touch the repo. Use Render's bulk paste
   (`KEY=value` per line) for speed. See §5 for the full list.
3. Pick a **plan** (`render.yaml` uses `starter`). Avoid Render's free web tier — it
   **sleeps after 15 min of inactivity** (cold starts + dropped webhooks). `starter`
   (~$7/mo each) stays warm.
4. Pick a **region** (`oreregon`/`frankfurt`/…) closest to your users; keep all three
   in the same region.
5. Render builds each service from its Dockerfile and starts them. The gateway's
   `healthCheckPath: /v1/health` gates go-live.

### Internal service discovery

Render routes traffic to a `pserv` by its **service name**. `render.yaml` sets
`AUTH_SERVICE_HOST=wriven-auth` and `CORE_SERVICE_HOST=wriven-core` by default. If a
hostname doesn't resolve, open each `pserv`'s **Connect** tab, copy the exact internal
hostname, and paste it into the gateway's `AUTH_SERVICE_HOST` / `CORE_SERVICE_HOST`.

---

## 5. Environment variables

### Shared group `wriven-shared` (set once, attached to all 3)

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Supabase pooled URL |
| `DIRECT_URL` | Supabase direct URL |
| `JWT_SECRET` | (generate: `openssl rand -hex 32`) |
| `REFRESH_SECRET` | (generate: `openssl rand -hex 32`) |
| `GOOGLE_CLIENT_ID` | from Google OAuth console |
| `NODE_ENV` | `production` |

### Per service

| Service | Extra keys |
|---------|------------|
| **wriven-auth** | `GOOGLE_CLIENT_SECRET`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` |
| **wriven-core** | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_PUBLIC_URL` |
| **wriven-gateway** | `ADMIN_JWT_SECRET`, `AUTH_SERVICE_HOST`, `AUTH_SERVICE_PORT=5001`, `CORE_SERVICE_HOST`, `CORE_SERVICE_PORT=5002`, `FRONTEND_URL=https://wriven.tech`, `USAGE_ENFORCE=false` |

> All of these are already declared in `render.yaml` (`sync: false` for secrets).
> You only paste the values once in the dashboard.

---

## 6. Custom domain — `api.wriven.tech`

1. Render → `wriven-gateway` → **Settings → Custom Domains** → add `api.wriven.tech`.
2. Render gives you a **CNAME target** (e.g. `wriven-gateway.onrender.com`).
3. In your DNS, add: `api` CNAME → that target.
4. Render issues a TLS cert automatically once DNS resolves. The gateway is now
   reachable at `https://api.wriven.tech`.

---

## 7. Frontend on Vercel

1. Vercel → **Add New Project** → import the monorepo.
2. **Root Directory** = `apps/client`. Framework preset = **Next.js** (auto-detected).
3. Build from repo root so pnpm + `libs/` resolve (Vercel handles the workspace).
4. Environment variables:
   - `NEXT_PUBLIC_API_URL` = `https://api.wriven.tech/v1`
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID` = (same as gateway's `GOOGLE_CLIENT_ID`)
5. **Domains** → add `wriven.tech` (and `www` if used). Vercel gives DNS records;
   set them. Vercel issues TLS.
6. The client already sends `credentials: 'include'` and reads `NEXT_PUBLIC_API_URL`
   ([api.ts](../apps/client/src/lib/api.ts)) — no code change needed.

---

## 8. Google OAuth console

In your Google OAuth app (Cloud Console → APIs & Services → Credentials):

- **Authorized redirect URI:** `https://api.wriven.tech/v1/auth/google/callback`
- **Authorized JavaScript origin:** `https://wriven.tech`

`GOOGLE_CLIENT_ID` (shared) + `GOOGLE_CLIENT_SECRET` (on `wriven-auth`) come from
this app.

---

## 9. CORS

CORS is split: the public Delivery API (`/v1/projects/:projectId/content|media/*`) reflects any origin without credentials (Bearer API keys — customer browser apps work from any domain); everything else — including project-scoped management routes under the same prefix — uses the exact-origin allowlist `CORS_ORIGINS` with credentials (render.yaml sets wriven.tech + www + admin.wriven.tech + www.admin.wriven.tech).
It works as-is, but for production **tighten it** to your origin in
[main.ts](../apps/api-gateway/src/main.ts):

```ts
app.enableCors({ origin: ['https://wriven.tech'], credentials: true });
```

(Optional for dev; recommended before you share the URL.)

---

## 10. Cookies — why your domain needs **no** code change

`wriven.tech` (Vercel) and `api.wriven.tech` (Render) are **different origins** but
the **same site** (shared registrable domain). This matters for cookies:

- Tenant auth cookies are `sameSite: 'lax'`
  ([auth.controller.ts](../apps/api-gateway/src/auth/auth.controller.ts)). Lax cookies
  **are sent on same-site credentialed requests of any method**, so login/refresh/
  content all work across the subdomains. **No need to flip to `SameSite=None`.**
- The CSRF token is returned **in the response body** (not read from
  `document.cookie`), so the double-submit pattern works cross-subdomain unchanged.
- Cookies stay host-only on `api.wriven.tech` (no `domain` attribute needed) — the
  most secure option, and every auth request goes there anyway.

> Same-site requires the **same scheme**. Keep both `https` (they will be). Don't
> point the client at an `http` API in production or secure cookies won't attach.

(This is why the earlier "flip SameSite to None" advice does **not** apply to the
same-domain setup — that was only for a `vercel.app` + `onrender.com` split, which is
genuinely cross-site.)

---

## 11. Post-deploy smoke test

```bash
# 1. Gateway health (confirms TCP wiring to auth + core)
curl https://api.wriven.tech/v1/health
# → { "success": true, "data": { "gateway": "ok", "auth": "ok", "core": "ok" } }

# 2. Public plan catalog (no auth)
curl https://api.wriven.tech/v1/plans

# 3. Delivery API read (needs a project + read key + published entry)
curl "https://api.wriven.tech/v1/projects/$PROJECT_ID/content/post?limit=3" \
  -H "Authorization: Bearer $WRIVEN_TOKEN"
```

Then in the browser on `https://wriven.tech`: register → login → create a content
type → publish an entry → confirm the dashboard works end to end.

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `/health` returns `auth`/`core` ≠ `ok` | gateway can't reach a pserv | check `AUTH_SERVICE_HOST`/`CORE_SERVICE_HOST` = pserv internal hostname (Connect tab); same region; pserv is up |
| Login "works" but instantly logged out / 401 on refresh | cookie not attaching | confirm both sites `https`; `credentials: 'include'`; same-site (shared domain) — see §10 |
| `401` on every delivery request | bad/expired/revoked key | recreate the read key; check `Authorization: Bearer wrk_live_…` |
| Google OAuth `redirect_uri_mismatch` | console URIs wrong | exact match `https://api.wriven.tech/v1/auth/google/callback` (§8) |
| Gateway 502 / unhealthy on Render | service crashed on boot | check `NODE_ENV=production` + all `sync:false` vars filled; read Render logs |
| Cold starts / dropped webhooks (Stripe) | free plan sleeping | upgrade gateway to `starter`+ |
| Migration errors | wrong URL mode | `DATABASE_URL` = pooled (6543), `DIRECT_URL` = direct (5432); rerun `db:migrate` |

---

## 13. Cost / plan notes

- **Render:** 4 × `starter` (~$7/mo each) ≈ $28/mo (gateway + auth + core + ai-service).
  Avoid the free web tier for the gateway (it sleeps → cold starts + missed Stripe
  webhooks). pserv has no free tier.
- **Vercel:** hobby (free) is fine for dev.
- **Supabase:** free tier is fine to start; watch DB size + egress.
- **Cloudflare R2:** free tier covers storage + generous egress.

---

## Sources

- [Render Blueprint YAML Reference](https://render.com/docs/blueprint-spec)
- [Render Private Services](https://render.com/docs/private-services)
- [Render Deploy from Docker](https://render.com/docs/docker)
- [Vercel — monorepo / Root Directory](https://vercel.com/docs/projects/project-configuration#root-directory)
- [Supabase — connection pooling](https://supabase.com/docs/guides/database/connecting-to-postgres)
