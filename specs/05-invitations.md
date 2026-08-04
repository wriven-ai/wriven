# 05 — Invitations & Membership Onboarding

How users are invited to a workspace or project, how brand-new (account-less)
people join, and the rule that project membership implies baseline workspace
membership. Lives in **auth-service** (owns identity + tenancy).

## Problem with what exists today

`addWorkspaceMember` / `addProjectMember` both do `findUserByEmail` and **throw
`NO user exists with that email`** for anyone without an account ([members.service.ts](../apps/auth-service/src/auth/members.service.ts),
[projects.service.ts](../apps/auth-service/src/auth/projects.service.ts)). So you can only add people who already signed up — no real
onboarding. Two more gaps:

- **No workspace link for project members.** A project member who isn't a
  workspace member can't even load `/w/[wsSlug]/p/[projSlug]` (workspace-gated).
- **Project-list leak.** `ProjectsService.list` returns *all* projects in the
  workspace to *any* workspace member — so a low-privilege member sees every
  project's existence.

## Decisions

1. **Pending-invitation + token flow** (industry standard — Clerk/Linear/Vercel).
   Inviting never requires an existing account.
2. **Token**: ≥32 random bytes, URL-safe; store **only `sha256(token)`**; raw
   token only in the email link. Single-use, **7-day expiry**, resendable.
3. **One `invitations` table** covering both scopes (workspace + project), with a
   `scope` discriminator — not two tables.
4. **Project membership implies workspace membership — as a `guest`.** Adding/
   accepting a project member auto-adds a workspace **`guest`** row if absent
   (transactional, idempotent, **never downgrades** a higher existing role,
   **never auto-removed** on project removal). A `guest` sees only the projects
   they belong to; real workspace members (`owner`/`admin`/`member`) see all.
   This separates "invited to the workspace" from "invited to one project"
   (GitHub member vs outside-collaborator). Guests can be promoted to `member`.
5. **Accept-on-signup**: registering (password or Google) auto-claims all pending
   invitations matching the new user's email.

## Data model — `invitations` (auth_svc)

```ts
export const invitations = authSchema.table('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),                 // invitee, lowercased
  scope: text('scope').notNull(),                 // 'workspace' | 'project'
  workspaceId: uuid('workspace_id').notNull(),    // always set (project's workspace)
  projectId: uuid('project_id'),                  // set when scope = 'project'
  role: text('role').notNull(),                   // ws: admin|member · proj: admin|editor|viewer
  tokenHash: text('token_hash').notNull(),        // sha-256 of the raw token
  status: text('status').notNull().default('pending'), // pending|accepted|revoked|expired
  invitedBy: uuid('invited_by').notNull(),
  expiresAt: timestamp(...).notNull(),            // now + 7 days
  acceptedAt: timestamp(...),
  acceptedBy: uuid('accepted_by'),                // the user who redeemed it
  createdAt: timestamp(...).notNull().defaultNow(),
});
// indexes: uniq(tokenHash), idx(email), idx(workspaceId), idx(projectId)
```

Notes: `workspaceId` is always present (a project invite carries its workspace so
accept can do the auto-add). No DB enum for role across scopes — validate in the
service against the scope's allowed set.

## Lifecycle (state machine)

```
            create
   (none) ─────────▶ pending ──accept──▶ accepted   (terminal, token dead)
                       │  │
                 revoke│  └─past expiresAt (lazily marked) ─▶ expired
                       ▼
                    revoked   (terminal)
```

- **resend** = revoke old + create new (fresh token + expiry, same email/role).
- Expiry is enforced at read/accept time; a cron may lazily flip `pending→expired`.

## Accept flow (the full scenario)

`GET /invitations/:token` (public) validates the hash → returns a safe preview
(inviter name, scope, target name, role, `requiresSignup` = email has no account).

- **Has account** → log in (email pre-filled) → `POST /invitations/:token/accept`
  (authed) → create membership(s) → mark `accepted`.
- **No account** → sign up with email pre-filled → on register, **auto-claim**
  pending invites for that email (same membership-creation path).

Both funnel through one `acceptInvitation(token, userId)` that re-validates
expiry/revoked/single-use every time.

### Membership creation on accept

```
if scope == 'workspace':
    upsert workspace_member(role)          # the invited role
if scope == 'project':
    ensure workspace_member exists          # auto-add as 'member' if absent
                                            #   (idempotent, never downgrade)
    insert project_member(role)
mark invitation accepted (acceptedAt, acceptedBy)
```

All in **one transaction**.

## Project → workspace auto-add (also for direct adds)

Applies to **both** `addProjectMember` (direct, existing user) and project-invite
accept. Helper `ensureWorkspaceMember(tx, workspaceId, userId, 'member')`:

- `INSERT … ON CONFLICT (workspace_id, user_id) DO NOTHING` — idempotent, and the
  unique index guarantees we never create a second row or downgrade an
  owner/admin.
- Project removal does **not** touch workspace membership.

## Project-list leak fix (prerequisite)

`ProjectsService.list`: real workspace members (`owner`/`admin`/`member`) see all
projects; a **`guest`** sees **only projects they belong to** (`canSeeAll =
callerRole !== 'guest'`). This is what makes the project→workspace auto-add safe:
the guest gets the workspace shell to reach their project, without every other
project's existence leaking.

## API surface (gateway → auth-service)

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/workspaces/:id/invitations` | session, ws owner/admin | invite to workspace |
| POST | `/projects/:id/invitations` | session, project admin | invite to project |
| GET | `/workspaces/:id/invitations` · `/projects/:id/invitations` | session | list pending |
| DELETE | `/invitations/:id` | session, inviter scope admin | revoke |
| POST | `/invitations/:id/resend` | session | resend (new token) |
| GET | `/invitations/token/:token` | **public** | accept-page preview |
| POST | `/invitations/token/:token/accept` | **session** | redeem |

New `INVITATION_PATTERNS` in `@wriven/contracts` + DTOs (`CreateInvitationDto`,
`InvitationView`, `InvitationPreview`). Existing member "add by email" endpoints
stay for the **already-a-member** path; the dashboard routes new emails through
invitations.

## Email

Reuse the Nodemailer `MailService` (already sends reset/verification). Add
`sendInvitation(to, link, { inviterName, targetName, role })`. Link =
`${CLIENT_ORIGIN}/invite/${rawToken}`.

## Frontend

- Members "New email" mode → creates an invitation (not a direct add).
- **Pending invitations** list on each members page (status, resend, revoke).
- `app/invite/[token]/page.tsx` — public preview; CTA branches on auth + account
  existence; calls accept; redirects into scope.
- Register page: pre-fill + lock email when arriving from an invite.

## Edge cases

- Already a member → accept is a no-op redirect.
- Email mismatch (logged in as a different address) → block with a clear message
  (simplest); revisit "accept as <other>" later.
- Multiple pending invites → list all on first login.
- Revoked/expired link → friendly dead-end + "ask for a new one".
- Role-aware landing (a viewer sees no create CTAs).

## Build order

1. **Project-list leak fix** (independent). ✅ ship first.
2. **`ensureWorkspaceMember` + wire into `addProjectMember`** (direct path).
3. **`invitations` table + migration + contracts**.
4. **Invitations service** (create/preview/accept/list/revoke/resend) + mail +
   gateway routes.
5. **Accept-on-signup hook** in `register` (+ Google signup).
6. **Frontend**: pending list, invite-creates-invitation, `/invite/[token]` page.

## Security

- Hash-only token storage; raw token only in the email; single-use; 7-day expiry.
- Authorize invite creation by scope role (ws owner/admin · project admin).
- Accept is idempotent and transactional; re-validate every redemption.
- Never leak whether an email has an account beyond the boolean the accept page
  needs.

## Sources

- [Clerk — Organization invitations](https://clerk.com/docs/guides/organizations/add-members/invitations)
- [Multi-tenant invite design (token/hash/expiry)](https://tomaszs2.medium.com/stop-rebuilding-user-invites-meet-invite-api-multi-tenant-onboarding-done-right-d4ea4b35e593)
- [Xata — org invites](https://xata.io/blog/how-we-improved-organization-invites-to-keycloak)
