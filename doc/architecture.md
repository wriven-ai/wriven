Architecture

## Topology

```
                         ┌────────────────────────┐
   Browser / Next.js ───▶│  api-gateway (HTTP)     │  :5000  ← only public service
                         │  - JWT validation       │
                         │  - workspace membership │
                         │  - rate limiting        │
                         │  - response envelope    │
                         └───────┬──────────┬──────┘
                          TCP    │          │   TCP
                                 ▼          ▼
                  ┌──────────────────┐  ┌──────────────────┐
                  │ auth-service     │  │ core-service     │
                  │ TCP :5001        │  │ TCP :5002        │
                  │ identity/tenancy │  │ CMS content      │
                  └────────┬─────────┘  └────────┬─────────┘
                           │                     │
                           └────────┬────────────┘
                                    ▼
                       PostgreSQL (Supabase, single DB)
                       schemas: auth_svc · core_svc
                                    │
                  ai-service (FastAPI, HTTP :8000) — AI content generation.
                  core-service → ai-service over HTTP (the only HTTP hop);
                  prompt build + select retry live in Python, quota/audit in core.
```

Only `api-gateway` is exposed to the internet. `auth-service` and `core-service` are **pure TCP microservices** (no HTTP server) reachable only on the internal network.

## Ports

| Service | Port | Transport | Exposure |
|---------|------|-----------|----------|
| api-gateway | 5000 | HTTP | public |
| auth-service | 5001 | TCP | internal |
| core-service | 5002 | TCP | internal |
| ai-service | 8000 | HTTP | internal |

## Inter-service communication

- **NestJS ↔ NestJS = TCP** via `@nestjs/microservices` (`ClientProxy` on the gateway, `@MessagePattern` handlers on services). No HTTP/Axios between NestJS services.
- **AI generation runs in `ai-service`** (Python/FastAPI, HTTP :8000) — **the only HTTP exception** (Python/FastAPI; TCP not applicable), called from core-service over HTTP behind an `AiClient` seam. Prompt building, temperature, and `select` validation/retry live in Python; core-service keeps the DB-bound work (quota reserve, audit row, field validation). The provider key (`AI_API_KEY`) lives only in ai-service env; core holds `AI_SERVICE_URL` + `INTERNAL_SECRET`. The `core.ai.*` message patterns + gateway callers are unchanged.
- Message patterns are dot-namespaced constants in `@wriven/contracts` (`messages.ts`): `auth.login`, `core.entry.create`, `core.ai.generate`, etc. Never hardcode pattern strings.

### Gateway client registration

```ts
ClientsModule.registerAsync([
  { name: SERVICE_TOKENS.AUTH_SERVICE, useFactory: cfg => ({ transport: TCP, options: { host, port: 5001 } }) },
  { name: SERVICE_TOKENS.CORE_SERVICE, useFactory: cfg => ({ transport: TCP, options: { host, port: 5002 } }) },
])
```

### Passing identity over TCP

TCP has no HTTP headers, so identity travels **inside the message payload**. The gateway injects `userId` (from the validated JWT) and `workspaceId` (from the validated `X-Workspace-Id` header) into every downstream payload. Services trust these — the gateway already validated them.

```ts
this.core.send(CORE_PATTERNS.ENTRY_CREATE, { workspaceId, userId, dto });
```

## Request lifecycle (workspace-scoped route)

```
1. Client → POST /v1/content/entries
     headers: Authorization: Bearer <access>, X-Workspace-Id: <ws>
2. ThrottlerGuard      — per-IP rate limit
3. JwtAuthGuard        — verify access token locally (gateway holds JWT_SECRET), set req.user
4. WorkspaceGuard      — TCP auth.validateWorkspaceMember(userId, workspaceId)
                          → 403 if not a member; sets req.workspaceId/workspaceRole
5. ValidationPipe      — validate body DTO (class-validator)
6. Controller          — core.send(ENTRY_CREATE, { workspaceId, userId, dto })  [TCP]
7. core-service        — @MessagePattern handler → service → Drizzle → Postgres
8. ResponseInterceptor — wrap result as { success: true, data }
   AllExceptionsFilter — on error, map to { success: false, error: { code, message, statusCode } }
```

## Gateway responsibilities

- **JWT validation** is local (gateway holds `JWT_SECRET`, no remote `/verify` call). Access tokens are short-lived (15m) so the revocation window is acceptable.
- **Workspace membership** validated via TCP `auth.validateWorkspaceMember` before forwarding workspace-scoped requests.
- **Rate limiting** (`@nestjs/throttler`) — global default + tighter per-route limits.
- **Response envelope** — `ResponseInterceptor` (success) + `AllExceptionsFilter` (errors). See [Conventions](./conventions.md).
- **CORS** — split policy: the public Delivery API (`/v1/projects/*`) reflects any origin, credentials **off** (Bearer API keys, never cookies — customer browser apps); all other routes use the exact-origin allowlist `CORS_ORIGINS` with credentials (dev `localhost:3000,3001`; prod wriven.tech/www + admin.wriven.tech/www). `CLIENT_ORIGIN` is used for the Google-OAuth callback redirect.
- Owns **no database tables and no business logic** — it routes and guards.

## Service boundaries

| Owns | auth-service | core-service |
|------|-------------|--------------|
| Schema | `auth_svc` | `core_svc` |
| Data | users, sessions, workspaces, projects, members, invitations, tokens (refresh/reset/verification), **plans, subscriptions, stripe_events**, admin identity (admin_users, admin_refresh_tokens, admin_audit_log) | content types, entries, revisions, media assets, api_keys, webhooks, usage_buckets, ai_generations, ai_profiles, support tickets (+ messages/attachments) |
| Never owns | content, media | identity, auth tokens, workspace/project records, billing |

A service never reads another service's tables. Cross-service data (e.g. resolving a content author's name) goes over TCP message patterns, not SQL joins. See [Database](./database.md) for why there are no cross-service foreign keys.
