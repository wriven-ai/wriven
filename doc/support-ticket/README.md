# Support Tickets — Module Plan

Workspace-level support ticketing for Wriven. A tenant user opens a ticket (title +
description + up to 3 images + optional scope), Wriven staff handle it from the
**admin panel**, and both sides converse in a threaded reply log.

This folder is **plan only** — implementation comes later. Three layer plans plus
this shared context:

| Doc | Layer | Repo |
|-----|-------|------|
| **README.md** (this) | Architecture decision, shared data model, status lifecycle, open decisions | — |
| [backend.md](./backend.md) | Schema, contracts, core-service module, gateway routes, RPC, R2 attachments | this monorepo |
| [client.md](./client.md) | Tenant dashboard UI (create + my-tickets + thread) | this monorepo (`apps/client`) |
| [admin-panel.md](./admin-panel.md) | Staff oversight UI (queue, reply, assign, status/priority) | **separate repo** (admin SPA) |

---

## 1. Requirements (from product)

- **Scope:** ticket belongs to a **workspace** (the billing/account unit).
- **Fields:** `title`, `description`, optional **up to 3 images**, optional **scope
  dropdown** (a specific project, billing, account, technical, general).
- **Industry-standard** support flow: a threaded conversation (user ↔ staff),
  status lifecycle, priority, staff assignment, human-friendly ticket number, full
  audit on the staff side.

---

## 2. Architecture decision — where tickets live

**Decision: core-service (`core_svc` schema).** Rationale:

- **Attachments need R2.** The 3 images reuse the existing
  [media presign + StorageService](../../apps/core-service/src/media/media.service.ts)
  flow (`core.media.presign`) — already in core. No second storage integration.
- **No-FK uuid convention.** core already stores `workspaceId` / `authorId` /
  `projectId` as plain uuids with no cross-service FK (see `media_assets`,
  `webhooks`). Tickets follow the same pattern — `workspaceId`, `authorId`,
  `scopeProjectId`, `assignedAdminId` are bare uuids.
- **Admin oversight mirror.** Admin moderation already lives in
  `apps/core-service/src/admin/*` ([admin backend/08](../admin-panel/backend/08-moderation.md)).
  Support staff oversight slots in as another `admin.support.*` area there.

> **Alternative considered (auth_svc):** tickets sit next to `users`/`workspaces`/
> `subscriptions`/`projects`. Rejected — would need a second R2 integration in
> auth-service for the images, and duplicate the admin-oversight wiring core
> already has. Scope=`billing`/`account` is just an enum, not a row, so proximity
> to billing tables buys nothing.

Cross-tenant staff access goes through new **`admin.support.*`** RPC (never loosen
tenant handlers) — same rule as the rest of the admin panel.

---

## 3. Shared data model (summary)

Full DDL in [backend.md §1](./backend.md). Three tables in `core_svc`:

- **`support_tickets`** — one row per ticket: `number` (human ref `#1042`),
  `workspaceId`, `authorId`, `subject`, `description`, `scopeType`,
  `scopeProjectId?`, `status`, `priority`, `assignedAdminId?`, reply/SLA timestamps,
  soft-delete.
- **`support_ticket_messages`** — the conversation thread: `ticketId`, `authorType`
  (`user`|`admin`), `authorId`, `body`, `isInternalNote` (admin-only private note),
  `createdAt`. The ticket's own `description` is the opening post; replies are rows
  here.
- **`support_ticket_attachments`** — image attachments: `ticketId`, `messageId?`
  (null = attached to the opening description), `r2Key`, `mime`, `sizeBytes`,
  `originalFilename`, `uploadedBy`. **≤ 3 per ticket/message**, enforced in service.

---

## 4. Status lifecycle (shared — all three layers agree on this)

```
            create
              │
              ▼
           ┌──────┐  customer reply        ┌─────────┐
           │ open │◀───────────────────────│ pending │
           └──────┘                        └─────────┘
            │  ▲   staff public reply  ───────▶  ▲
            │  └──────────────────────────────────┘
   staff "resolve"                       customer reply (reopen)
            │                                   │
            ▼                                   │
        ┌──────────┐  reply within grace  ──────┘
        │ resolved │
        └──────────┘
            │ close (manual or auto after N days idle)
            ▼
        ┌────────┐
        │ closed │  (terminal; reply within grace → open, else new ticket)
        └────────┘
```

| Status | Meaning | Set by |
|--------|---------|--------|
| `open` | Needs staff attention (new, or customer just replied) | create / customer reply |
| `pending` | Staff replied, awaiting customer | staff **public** reply |
| `resolved` | Staff marked solved | staff |
| `closed` | Terminal | staff/customer, or auto-close job (later) |

Transition rules:
- Staff **internal note** → **no** status change.
- Customer reply on `pending`/`resolved`/recently-`closed` → back to `open` (reopen).
- **Priority** (`low`/`normal`/`urgent` etc.) is **staff-only**, default `normal`;
  the client never sets it.

---

## 5. Scope dropdown

`scopeType` enum: `general` (default) · `project` · `billing` · `account` ·
`technical`. When `project` is chosen the client also sends `scopeProjectId` (one of
the workspace's projects). All other scopes carry no id. Stored as plain columns.

---

## 6. Open decisions (confirm before build)

- **Ticket visibility within a workspace:** every member sees all workspace tickets,
  or only the author (+ workspace owner/admins see all)? Plan assumes **author + workspace
  owner/admin see all; plain members see their own** (RBAC, finalize in client.md).
- **Email notifications** (new reply / status change) → **deferred**: depends on the
  transactional-email infra (market-readiness P0, [doc/17](../17-market-readiness.md)).
  Plan leaves hooks but builds in-app only for v1.
- **Anti-spam:** soft cap on open tickets per workspace (e.g. 20) + gateway throttle,
  rather than a plan entitlement. Not in `plans.limits`.
- **Attachment types:** v1 **images only** (matches the requirement); schema/flow
  are type-agnostic so logs/PDFs can be allowed later.
- **Auto-close:** a `resolved → closed` cleanup job after N idle days — deferred to a
  follow-up (note in backend.md).
