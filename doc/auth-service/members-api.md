# Members API

Detailed reference for **workspace member** and **project member** management. Owned by `auth-service` (`MembersService` for workspaces, `ProjectsService` for projects); exposed by the gateway. All routes are JWT-protected and use the standard envelope (`{ success, data }` / `{ success, error }`).

- **Base URL:** `http://localhost:5000/v1`
- **Auth:** httpOnly `access_token` cookie on every route (+ `X-CSRF-Token` on mutations — see [Conventions](../conventions.md)).
- **No `X-Workspace-Id` / `X-Project-Id` header needed** for member management routes — the id comes from the path; the caller's permission is derived from their membership row.
- Identity model: members reference `auth_svc.users`. Adding a member **links an existing user by email**; for users who don't exist yet there is a full **invitation flow** (specs/05) — `/workspaces/:id/invitations` + `/projects/:id/invitations` + `POST /invitations/token/:token/accept`.

## Roles

| Scope | Roles | Who can manage members |
|-------|-------|------------------------|
| Workspace | `owner`, `admin`, `member`, `guest` | `owner` / `admin` |
| Project | `admin`, `editor`, `viewer` | project `admin`, or workspace `owner` / `admin` (implicit) |

`guest` = a user invited to a project only — auto-seated into the workspace with the baseline role so they hold a membership row and consume a seat; sees only their assigned projects.

**Invariants:** a workspace must always keep **≥1 `owner`**; a project must always keep **≥1 `admin`**. Only a workspace **owner** may grant, change, or remove the workspace `owner` role. Workspace owners/admins get implicit access to all projects in their workspace via the RBAC **cascade**, resolved auth-service-side in `validateProjectMember` (the gateway has no bypass).

## Common errors

| Code | Status | When |
|------|--------|------|
| `UNAUTHORIZED` | 401 | Missing/invalid access token |
| `FORBIDDEN` | 403 | Caller lacks the required role (or isn't a member) |
| `NOT_FOUND` | 404 | Workspace/project/member not found, or no user with that email |
| `CONFLICT` | 409 | Already a member, or would break the last-owner/last-admin invariant |
| `PLAN_LIMIT_REACHED` | 403 | Seat quota full — add-member (workspace and project) enforces the plan's `members` limit in-transaction |
| `VALIDATION_ERROR` | 422 | Bad body (invalid email/role) |

---

## Workspace members

### GET `/workspaces/:workspaceId/members`
List workspace members. **Caller:** any member (`owner`/`admin`/`member`).

**Response** — `WorkspaceMemberView[]`:
```json
{
  "success": true,
  "data": [
    {
      "id": "0f1c…",
      "workspaceId": "ed61…",
      "userId": "a940…",
      "role": "owner",
      "createdAt": "2026-06-13T07:53:59.746Z",
      "user": { "id": "a940…", "email": "owner@acme.dev", "name": "Owner", "avatar": null }
    }
  ]
}
```

### POST `/workspaces/:workspaceId/members`
Add an existing user (by email) to the workspace. **Caller:** `owner`/`admin`.

**Body:**
| Field | Type | Rules |
|-------|------|-------|
| `email` | string | valid email; lowercased |
| `role` | string | `admin` \| `member` (owner is **not** assignable on add) |

```bash
curl -X POST $API/workspaces/$WS/members \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"email":"jane@acme.dev","role":"member"}'
```
→ `201`, the created `WorkspaceMemberView`.
**Errors:** `NOT_FOUND` (no user with that email), `CONFLICT` (already a member), `FORBIDDEN`, `PLAN_LIMIT_REACHED` (seat quota full).

### PATCH `/workspaces/:workspaceId/members/:userId`
Change a member's role. **Caller:** `owner`/`admin`.

**Body:** `{ "role": "owner" | "admin" | "member" | "guest" }`

Rules:
- Granting or changing the `owner` role requires the caller to be an **owner** → else `FORBIDDEN`.
- Demoting the **last owner** → `CONFLICT`.

→ `200`, updated `WorkspaceMemberView`.

### DELETE `/workspaces/:workspaceId/members/:userId`
Remove a member. **Caller:** `owner`/`admin`.

Rules:
- Removing an `owner` requires the caller to be an **owner** → else `FORBIDDEN`.
- Removing the **last owner** → `CONFLICT`.

→ `200`, `{ "success": true }`.

---

## Project members

### GET `/projects/:projectId/members`
List project members. **Caller:** needs `PROJECT_MEMBERS_VIEW` — project `admin`, or workspace `owner`/`admin` via the cascade. Plain `editor`/`viewer` get `FORBIDDEN`.
→ `ProjectMemberView[]`.

### POST `/projects/:projectId/members`
Add an existing user by email. **Caller:** project `admin`.

**Body:**
| Field | Type | Rules |
|-------|------|-------|
| `email` | string | valid email; lowercased |
| `role` | string | `admin` \| `editor` \| `viewer` |

If the invitee has no workspace membership yet, they are **auto-seated as a workspace `guest`** first (baseline membership + seat quota), then added to the project.

→ `201`, created `ProjectMemberView`. **Errors:** `NOT_FOUND`, `CONFLICT` (already a member), `FORBIDDEN`, `PLAN_LIMIT_REACHED`.

### PATCH `/projects/:projectId/members/:userId`
Change role. **Caller:** project `admin`. Body `{ "role": "admin" | "editor" | "viewer" }`.
- Demoting the **last admin** → `CONFLICT`.
→ `200`, updated `ProjectMemberView`.

### DELETE `/projects/:projectId/members/:userId`
Remove a member. **Caller:** project `admin`. Removing the **last admin** → `CONFLICT`.
→ `200`, `{ "success": true }`.

---

## Types

```ts
interface MemberUser { id: string; email: string; name: string; avatar: string | null; }

interface WorkspaceMemberView {
  id: string; workspaceId: string; userId: string;
  role: string;            // owner | admin | member
  createdAt: string;       // ISO
  user: MemberUser;
}

interface ProjectMemberView {
  id: string; projectId: string; userId: string;
  role: string;            // admin | editor | viewer
  createdAt: string;
  user: MemberUser;
}
```
(Defined in `@wriven/contracts`: `member.types.ts`, `member.dto.ts`.)

## Internals

- **TCP patterns** (gateway → auth-service): `auth.workspace.{listMembers,addMember,updateMember,removeMember}` (`WORKSPACE_PATTERNS`), `auth.project.{listMembers,addMember,updateMember,removeMember}` (`PROJECT_PATTERNS`).
- The gateway injects `callerUserId` (from the JWT) plus the path ids into each TCP payload; `MembersService` / `ProjectsService` check **permissions** via `AuthorizationService.authorize` (`WORKSPACE_MEMBERS_VIEW`/`WORKSPACE_MEMBERS_MANAGE`, `WORKSPACE_ROLE_ASSIGN`, `PROJECT_MEMBERS_MANAGE`) — not role-string checks.
- Last-owner/last-admin checks use `db.$count`; member lists use Drizzle relational queries (`db.query.*.findMany({ with: { user: true } })`).

## Not yet implemented

- **Leave** endpoint (self-removal) and ownership **transfer** as a distinct action.

(Invitations shipped — see specs/05 and the routes above.)
