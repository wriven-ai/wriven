# Support Tickets — Admin Panel Plan

Plan for the **staff-facing** support UI in the **separate-repo admin SPA**
(React + React Router + Vite). Staff triage the cross-tenant ticket queue, reply,
add internal notes, set priority/status, and assign. Shared model + lifecycle in
[README.md](./README.md); the API in [backend.md §5](./backend.md). **Plan only —
build later.**

> Follows the existing admin-SPA conventions exactly: `lib/api.ts` envelope unwrap +
> `credentials:'include'` + 401→`/login`, hand-maintained `lib/types.ts` (no
> `@wriven/contracts`), TanStack Query + Table, role gating, the Wriven design
> tokens. See [admin-panel/frontend/](../admin-panel/frontend/). This is **one more
> feature module** alongside the existing screens.

---

## 1. Where it slots in

- New sidebar item **Support** (between Content and Media, `LifeBuoy` icon). Visible
  to all roles (`member` read-only); reply/update gated to `admin`/`moderator`
  ([admin frontend/04 conventions](../admin-panel/frontend/04-screens.md)).
- New feature folder `src/features/support/` (queries + components + pages), mirroring
  `features/content/` etc.
- Overview screen gains a **"Open tickets"** StatCard + "oldest unassigned" widget
  from `GET /admin/support/metrics`.

```
features/support/
  queries.ts                # TanStack Query hooks → /admin/support/*
  support-queue-page.tsx    # list
  support-ticket-page.tsx   # detail + thread + actions
  components/               # PriorityBadge, AssigneeSelect, InternalNoteToggle, ...
```

---

## 2. Data layer

Hand-add to `lib/types.ts` (mirror [backend.md §3](./backend.md)) — note the admin
shapes **include** `isInternalNote`, `workspace`, `author`, `assignedAdminId`,
`priority`:

```ts
export interface AdminTicketRow {
  id: string; number: number; subject: string;
  workspaceName: string; authorEmail: string;
  scopeType: 'general'|'project'|'billing'|'account'|'technical';
  status: 'open'|'pending'|'resolved'|'closed';
  priority: 'low'|'normal'|'high'|'urgent';
  assignedAdminId: string | null; assignedAdminName: string | null;
  lastReplyAt: string | null; lastReplyBy: 'user'|'admin'|null; createdAt: string;
}
export interface AdminTicketMessage { id: string; authorType: 'user'|'admin'; authorName: string; body: string; isInternalNote: boolean; createdAt: string; attachments: { id:string; url:string; mime:string|null }[]; }
export interface AdminTicketDetail extends AdminTicketRow { description: string; attachments: {...}[]; messages: AdminTicketMessage[]; }
```

Endpoints (all `/v1` prefixed, cross-origin cookies):
```
listTickets(query)     GET   /admin/support/tickets        # page,status,priority,scope,workspaceId,assignee,q
getTicket(id)          GET   /admin/support/tickets/:id
reply(id, dto)         POST  /admin/support/tickets/:id/messages   [admin|moderator]
update(id, dto)        PATCH /admin/support/tickets/:id            [admin|moderator]
metrics()              GET   /admin/support/metrics
```
Query keys `['admin','support',...]`; invalidate ticket + list on reply/update.
URL-sync filters via `useSearchParams` (same as other admin lists).

---

## 3. Screens

### 3.1 Queue — `support-queue-page.tsx`
- TanStack Table (server-paginated): `#number`, subject, workspace, author,
  **status**, **priority**, **assignee**, scope, last activity. Unread highlight when
  `lastReplyBy === 'user'` (customer waiting).
- `FilterBar`: status, priority, scope, **assignee** (me / unassigned / any),
  workspace, free-text `q` (subject / `#number` / email).
- Quick sort presets: "Oldest open", "Unassigned", "Urgent". Row → detail.
- Header stats from `metrics()`: open / unassigned / awaiting-customer counts.

### 3.2 Detail + thread — `support-ticket-page.tsx`
- **Header:** `#number` subject, workspace (link to its admin detail), author (link
  to user detail), status + priority + scope badges, created/SLA times.
- **Action bar** `[admin|moderator]`:
  - **Status** select → `open/pending/resolved/closed` (`update`). Resolving stamps
    `resolvedAt`; closing `closedAt`.
  - **Priority** select → `low/normal/high/urgent`.
  - **Assignee** select (admin_users) → `assignedAdminId` (or "Assign to me").
  - Each change = `@Audit`'d server-side; show a result toast.
- **Conversation:** full thread **including internal notes** (visually distinct —
  amber/`secondary` background, lock icon, "internal — not visible to customer").
  Customer vs staff bubbles; attachment thumbnails + lightbox.
- **Reply composer:** textarea + attachments (reuse the presign→R2 flow via
  `/support/tickets/attachments/presign`? — **no**: staff upload through an admin
  presign or the same core presign with admin auth; confirm in backend) +
  **"Internal note" toggle**. Public reply → ticket goes `pending`; internal note →
  status unchanged. Send = `reply({ body, internalNote, attachmentKeys })`.
- `member` role: read-only — no action bar, no composer.

---

## 4. Components
- `PriorityBadge`, `StatusBadge` (reuse the admin status-token mapping),
  `ScopeBadge`, `AssigneeSelect` (admin_users dropdown), `InternalNoteComposer`,
  `MessageBubble` (variant: customer / staff / internal-note), `AttachmentThumb`.
- Design: Manrope + admin brand tokens ([admin frontend/05](../admin-panel/frontend/05-design-system.md));
  internal notes use the `secondary`/amber accent so they're unmistakable.

---

## 5. RBAC + audit (recap)
- **member** — read queue + threads (incl. internal notes? → **decision**: internal
  notes visible to all staff roles incl. member; member just can't write). No writes.
- **moderator** / **admin** — reply, internal note, set status/priority, assign.
- Every staff write is audited server-side (`support.reply`, `support.update`) — the
  Audit Log screen surfaces it automatically.

---

## 6. Definition of done
- Cross-tenant queue is filterable/paginated with URL-synced params; header metrics
  render from `/admin/support/metrics` and feed the Overview StatCard.
- Staff can reply (public + internal note), attach images, set status/priority,
  assign — all reflected in the thread and audited.
- `member` sees everything read-only; forbidden writes rejected server-side.
- Internal notes are clearly distinguished and never leak to the tenant client
  (enforced backend-side; UI just styles them).

**Out of scope (v1):** email notifications, canned responses/macros, SLA timers,
CSAT, bulk actions.
