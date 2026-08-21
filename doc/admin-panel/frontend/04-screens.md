# Admin Panel — Screens (detailed spec)

Build order: Login → Overview → Users → Workspaces → Projects → Content → Support
(queue + ticket thread) → Media → API Keys → Webhooks → Plans → Admins → Audit Log
→ Settings.

---

## Shared conventions (all screens)

- **Tables**: server-paginated, sortable columns, filter chips, a `⋯` row-actions
  menu, loading skeletons, empty states. Build once in `components/data-table/`.
- **Status badges**: color-coded via status tokens — active=success,
  suspended/over-limit/failed=error, past-due/near-cap=warning.
- **Destructive actions** (suspend, delete, revoke, disable, takedown, purge):
  a confirm dialog that (a) states the blast radius, (b) for high-impact ops
  requires typing the target name/slug, (c) captures a **reason** sent to the API
  and stored in audit metadata. Gated by role
  ([../backend/03-auth.md](../backend/03-auth.md)).
- **Role gating**: `member` sees read-only everywhere (no action buttons);
  `moderator` sees moderation/support actions but not Plans/Admins/Settings;
  `admin` sees all.

---

## Screens

1. **Login** (`/login`) — email+password form (RHF+zod). No signup link.
   On success → Overview.

2. **Overview** (`/`) — KPI `StatCard`s (total users, workspaces, projects,
   content entries, storage used, active plans). `KpiLineChart` of signups/growth.
   `PlanBreakdownPie`. Widgets: recent audit events, failing webhooks. Source:
   `GET /admin/metrics/overview`.

3. **Users** (`/users`) — table: email, name, provider, verified badge,
   #workspaces, created, status. Filters: query, verified, suspended. Row → detail
   (`/users/:id`): profile, memberships (workspaces+roles), recent activity.
   Actions `[admin|moderator]`: suspend/reactivate, force-verify;
   `[admin]`: delete/GDPR-erase. All audited. (No reset-password or
   resend-verification actions — the backend has no such endpoints.)

4. **Workspaces** (`/workspaces`) — table: name, owner email, members, projects,
   plan badge, subscription status. Detail (`/workspaces/:id`) header shows total
   storage used; tabs: Members · Projects · Plan. Plan tab `[admin]`: change plan
   + set overrides. (No storage tab or suspend/rename — not implemented; the
   backend has no endpoints.)

5. **Projects** (`/projects`) — cross-workspace table: name, workspace, created-by,
   created. Detail (`/projects/:id`) pulls aggregated counts (content types,
   entries, media, keys, webhooks, AI usage) from `GET /admin/projects/:id/usage`
   and drills into the project's content/keys/webhooks (read-only oversight).
   `[admin]`: soft-delete.

6. **Content** (`/content`) — global entry browser for **moderation**, read-only by
   default. Filters: workspace, project, type, status. View one entry read-only;
   `[admin|moderator]` takedown = archive/unpublish (confirm + reason, audited).
   Not an editor.

7. **Support** (`/support`, `/support/:id`) — cross-tenant ticket queue: subject,
   number, workspace, author, scope, status, priority, assignee, last reply.
   Filters: query, status, priority, scope, workspace, assignee (incl.
   unassigned). Ticket thread (`/support/:id`): message history (user/admin),
   reply + internal notes, set status/priority/assignee. Reply/update gated to
   `[admin|moderator]`; `member` read-only. Shared model + lifecycle in
   [doc/support-ticket/](../../support-ticket/).

8. **Media** (`/media`) — storage usage per workspace (against the 100 MB cap),
   largest files, by kind (image/video/file). `[admin|moderator]` purge an
   abusive/oversized asset (confirm + reason). Show R2 totals.

9. **API Keys** (`/api-keys`) — all keys platform-wide: prefix, scope
   (read/preview/manage), project, last used, created. **Never raw tokens.**
   `[admin|moderator]` revoke (confirm).

10. **Webhooks** (`/webhooks`) — all subscriptions: url, events, last status code,
    last fired, active. Highlight failing endpoints. `[admin|moderator]` disable.

11. **Plans** (`/plans`) `[admin]` — list/define plans + their limit sets
    (projects, members, storageMb, entries, apiKeys, webhooks), price (display).
    Create/edit via RHF+zod. Assignment happens on the workspace detail screen.

12. **Admins** (`/admins`) `[admin]` — manage `admin_users`: invite/create, set
    role (admin/moderator/member), activate/deactivate, reset MFA. Every change
    audited. Cannot deactivate your own last admin (guard in UI + API).

13. **Audit Log** (`/audit`) — filterable feed (admin, action, target type/id,
    date range). Columns: when, admin, action, target, ip. Expand a row to see
    `metadata` (before/after, reason). Append-only, never editable.

14. **Settings** (`/settings`) `[admin]` — platform feature flags (signups open,
    default plan, maintenance mode) if the backend exposes `platform_settings`.
