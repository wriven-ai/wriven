# Admin Panel — Moderation (content / media / api-keys / webhooks)

Cross-tenant moderation over **core-service** data. Lives in core-service
`admin/` module (`admin-content`, `admin-media`, `admin-keys`,
`admin-webhooks`), exposed via `admin.*` RPC ([05-rpc.md](./05-rpc.md)) and the
`/admin/content|media|api-keys|webhooks` endpoints ([06-endpoints.md](./06-endpoints.md)).
Status: **Phase C (done)**.

---

## Content

- **list** — global entry browser, read-only by default. Filter ws/project/type/
  status; excludes `deletedAt`. Server-paginated, `orderBy desc(updatedAt)`.
- **get** — single entry incl. `data` payload.
- **takedown** `[admin|moderator]` — set `status` to `draft` (unpublish) or
  `archived` (hide) **and clear `publishedAt`** so it's not reported as published.
  Then **purge the CDN** for that entry (`CachePurgeService.purgeEntry(apiId, id)`)
  so the taken-down entry stops being served from cache, and — when the entry was
  previously `published` — **fire `entry.unpublished`** to the project's webhook
  subscribers (best-effort, like every entries emit) so webhook-driven display
  sites revalidate. The moderation trail lives
  in `admin_audit_log` (not the tenant's revision history).

---

## Media

- **usageByWorkspace** — storage usage per workspace (against the plan cap).
- **list** — largest/abusive files, by kind.
- **purge** `[admin|moderator]` — delete an abusive/oversized asset (confirm +
  reason, audited).

---

## API keys

- **list** — all keys platform-wide: prefix, scope, project, last used, created.
  **Never raw tokens** — admin sees prefixes/metadata only.
- **revoke** `[admin|moderator]`.

---

## Webhooks

- **list** — all subscriptions: url, events, last status, last fired, active.
- **disable** `[admin|moderator]`.

> Note: webhook **quota** counts only `active=true` rows — a disabled webhook is
> free to keep (see [09-plans.md](./09-plans.md)).

---

## Invariants

- No raw secrets returned (api-key tokens / webhook secrets are hash/once-only).
- Every destructive op is `@Audit`-wrapped with a captured reason.
- All lists paginate + filter + sort.
