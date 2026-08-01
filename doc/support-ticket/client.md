# Support Tickets — Client (Tenant Dashboard) Plan

Plan for the **tenant-facing** support UI in this monorepo's Next.js app
(`apps/client`). A workspace member opens tickets, watches the thread, and replies.
Shared model + lifecycle in [README.md](./README.md); the API it calls is in
[backend.md §5](./backend.md). **Plan only — build later.**

> Reuses the app's existing conventions: cookie/session auth via
> [lib/api.ts](../../apps/client/src/lib/api.ts) (sends `X-Workspace-Id`), shared
> types in [lib/types.ts](../../apps/client/src/lib/types.ts), shadcn-style
> primitives in `components/ui/*`, and the Wriven brand tokens already in
> `global.css`. Support is **workspace-level** → lives under the workspace route,
> not the project route.

---

## 1. Routes

Workspace-scoped, under the URL-driven workspace tree
(`apps/client/src/app/(dashboard)/w/[wsSlug]/`):

```
w/[wsSlug]/support/
  page.tsx                 # my/workspace tickets list  (/w/[ws]/support)
  new/page.tsx             # create-ticket form          (/w/[ws]/support/new)
  [ticketId]/page.tsx      # ticket detail + thread      (/w/[ws]/support/<id>)
```

Add a **Support** item to the workspace sidebar group (`components/sidebar/builders/
build-workspace-nav.ts` per the nav refactor — Overview · Projects · Members ·
Settings · Billing · Usage · **Support**). `LifeBuoy` lucide icon.

---

## 2. Data layer

Add support calls to `lib/api.ts` (or a `features/support/` module) — all hit the
gateway `/support/*` ([backend.md §5](./backend.md)) with the workspace header the
client already attaches:

```
presignAttachment(file)            POST /support/tickets/attachments/presign  → { uploadUrl, key }
createTicket(dto)                  POST /support/tickets
listTickets({page,status})         GET  /support/tickets
getTicket(id)                      GET  /support/tickets/:id
replyTicket(id, dto)               POST /support/tickets/:id/messages
closeTicket(id)                    PATCH /support/tickets/:id { status:'closed' }
```

Add the `SupportTicketRow` / `SupportTicketDetail` / `SupportMessageView` /
`SupportAttachmentView` shapes to `lib/types.ts` (mirror
[backend.md §3](./backend.md)). If the app uses TanStack Query, key on
`['support', wsId, ...]` and invalidate on reply/close.

---

## 3. Screens

### 3.1 List — `support/page.tsx`
- Table/cards: `#number`, subject, scope badge, **status badge** (open=warning,
  pending=muted, resolved/closed=success/neutral), last activity (relative,
  `date-fns`), an **unread dot** when `lastReplyBy === 'admin'`.
- Filter chips: status (All / Open / Pending / Resolved / Closed), scope.
- Empty state + **"New ticket"** primary button → `support/new`.
- Visibility: plain members see their own; workspace owner/admins see all
  (server-enforced; UI just renders what it gets).

### 3.2 Create — `support/new/page.tsx`
Form (react-hook-form + zod, matching existing forms):
- **Subject** (text, 3–160).
- **Description** (textarea, 1–5000) — `components/ui/textarea.tsx`.
- **Scope** (select / `components/ui/popover` dropdown): General · Project · Billing
  · Account · Technical. Choosing **Project** reveals a **project picker** (the
  workspace's projects) → `scopeProjectId`.
- **Attachments** — up to **3 images**. Dropzone/file input → for each: client-side
  validate `image/*` + size, `presignAttachment`, PUT to R2, collect `key`. Show
  thumbnail previews + remove. Block the 4th. Submit sends `attachmentKeys[]`.
- Submit → `createTicket` → toast + redirect to the new ticket detail.

### 3.3 Detail + thread — `support/[ticketId]/page.tsx`
- Header: `#number` subject, status + scope badges, created date; if `scopeProjectId`
  show the project name/link.
- **Conversation:** ordered messages (opening description first, then replies).
  Bubbles aligned by `authorType` — **user** (right/brand) vs **Wriven Support**
  (left/muted) with author label + relative time. Render attachment thumbnails
  (lightbox on click). *(Internal notes never arrive — backend strips them.)*
- **Reply box** at the bottom: textarea + up to 3 image attachments (same upload
  flow) + Send. Disabled when `status === 'closed'` with a "closed — replying
  reopens / start a new ticket" hint (server decides reopen vs block).
- **Close ticket** action (author) — confirm dialog; sets `closed`.
- After reply/close → invalidate + refetch the thread.

---

## 4. Components to reuse / add
- Reuse `ui/{button,input,textarea,dialog,popover,sheet,skeleton,tooltip}`.
- New small pieces: `StatusBadge` (status→token color, [README §4](./README.md)),
  `ScopeBadge`, `AttachmentUploader` (presign→PUT→key, max 3, image-only,
  previews), `MessageBubble`, `TicketListItem`.
- **Design:** Manrope + brand tokens already global; status colors map to
  `--status-success|warning|error`. Keep it consistent with the rest of the
  dashboard (cards, `rounded-lg`, hairline borders).

---

## 5. Definition of done
- Member can create a ticket (subject + description + ≤3 images + scope, project
  picker when scope=project), see it in the list, open the thread, reply with
  attachments, and close it.
- Status/scope badges + unread indicator correct; `closed` disables the reply box.
- Attachments upload via presign→R2 (never proxied through the API); 4th blocked;
  non-images rejected client-side.
- Support nav item appears in the workspace sidebar group; all calls carry the
  workspace context; respects server visibility (no cross-workspace leakage).

**Out of scope (v1):** email notifications, CSAT rating, live updates (poll/refetch
on focus is enough).
