# Members API

Detailed reference for **organization member** and **workspace member** management. Owned by `auth-service` (`MembersService`); exposed by the gateway. All routes are JWT-protected and use the standard envelope (`{ success, data }` / `{ success, error }`).

- **Base URL:** `http://localhost:5000/api/v1`
- **Auth:** `Authorization: Bearer <accessToken>` on every route.
- **No `X-Workspace-Id` header needed** — the org/workspace id comes from the path; the caller's permission is derived from their membership row.
- Identity model: members reference `auth_svc.users`. Adding a member **links an existing user by email** — there is no invitation flow yet.

## Roles

| Scope | Roles | Who can manage members |
|-------|-------|------------------------|
| Organization | `owner`, `admin`, `member` | `owner` / `admin` |
| Workspace | `admin`, `editor`, `viewer` | `admin` |

**Invariants:** an org must always keep **≥1 `owner`**; a workspace must always keep **≥1 `admin`**. Only an org **owner** may grant, change, or remove the `owner` role.

## Common errors

| Code | Status | When |
|------|--------|------|
| `UNAUTHORIZED` | 401 | Missing/invalid access token |
| `FORBIDDEN` | 403 | Caller lacks the required role (or isn't a member) |
| `NOT_FOUND` | 404 | Org/workspace/member not found, or no user with that email |
| `CONFLICT` | 409 | Already a member, or would break the last-owner/last-admin invariant |
| `VALIDATION_ERROR` | 422 | Bad body (invalid email/role) |

---

## Organization members

### GET `/orgs/:orgId/members`
List all members of the org. **Caller:** any member (`owner`/`admin`/`member`).

**Response** — `OrgMemberView[]`:
```json
{
  "success": true,
  "data": [
    {
      "id": "0f1c…",
      "orgId": "ed61…",
      "userId": "a940…",
      "role": "owner",
      "createdAt": "2026-06-13T07:53:59.746Z",
      "user": { "id": "a940…", "email": "owner@acme.dev", "name": "Owner", "avatar": null }
    }
  ]
}
```

### POST `/orgs/:orgId/members`
Add an existing user (by email) to the org. **Caller:** `owner`/`admin`.

**Body:**
| Field | Type | Rules |
|-------|------|-------|
| `email` | string | valid email; lowercased |
| `role` | string | `admin` \| `member` (owner is **not** assignable on add) |

```bash
curl -X POST $API/orgs/$ORG/members \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"email":"jane@acme.dev","role":"member"}'
```
→ `201`, the created `OrgMemberView`.
**Errors:** `NOT_FOUND` (no user with that email), `CONFLICT` (already a member), `FORBIDDEN`.

### PATCH `/orgs/:orgId/members/:userId`
Change a member's role. **Caller:** `owner`/`admin`.

**Body:** `{ "role": "owner" | "admin" | "member" }`

Rules:
- Granting or changing the `owner` role requires the caller to be an **owner** → else `FORBIDDEN`.
- Demoting the **last owner** → `CONFLICT`.

→ `200`, updated `OrgMemberView`.

### DELETE `/orgs/:orgId/members/:userId`
Remove a member. **Caller:** `owner`/`admin`.

Rules:
- Removing an `owner` requires the caller to be an **owner** → else `FORBIDDEN`.
- Removing the **last owner** → `CONFLICT`.

→ `200`, `{ "success": true }`.

---

## Workspace members

### GET `/workspaces/:workspaceId/members`
List workspace members. **Caller:** any member (`admin`/`editor`/`viewer`).
→ `WorkspaceMemberView[]` (same shape as org, with `workspaceId`).

### POST `/workspaces/:workspaceId/members`
Add an existing user by email. **Caller:** `admin`.

**Body:**
| Field | Type | Rules |
|-------|------|-------|
| `email` | string | valid email; lowercased |
| `role` | string | `admin` \| `editor` \| `viewer` |

→ `201`, created `WorkspaceMemberView`. **Errors:** `NOT_FOUND`, `CONFLICT` (already a member), `FORBIDDEN`.

### PATCH `/workspaces/:workspaceId/members/:userId`
Change role. **Caller:** `admin`. Body `{ "role": "admin" | "editor" | "viewer" }`.
- Demoting the **last admin** → `CONFLICT`.
→ `200`, updated `WorkspaceMemberView`.

### DELETE `/workspaces/:workspaceId/members/:userId`
Remove a member. **Caller:** `admin`. Removing the **last admin** → `CONFLICT`.
→ `200`, `{ "success": true }`.

---

## Types

```ts
interface MemberUser { id: string; email: string; name: string; avatar: string | null; }

interface OrgMemberView {
  id: string; orgId: string; userId: string;
  role: string;            // owner | admin | member
  createdAt: string;       // ISO
  user: MemberUser;
}

interface WorkspaceMemberView {
  id: string; workspaceId: string; userId: string;
  role: string;            // admin | editor | viewer
  createdAt: string;
  user: MemberUser;
}
```
(Defined in `@wriven/contracts`: `member.types.ts`, `member.dto.ts`.)

## Internals

- **TCP patterns** (gateway → auth-service): `auth.org.{listMembers,addMember,updateMember,removeMember}`, `auth.workspace.{listMembers,addMember,updateMember,removeMember}` (`ORG_PATTERNS` / `WORKSPACE_PATTERNS`).
- The gateway injects `callerUserId` (from the JWT) plus the path ids into each TCP payload; `MembersService` performs the role check (`requireOrgRole` / `requireWorkspaceRole`) before mutating.
- Last-owner/last-admin checks use `db.$count`; member lists use Drizzle relational queries (`db.query.*.findMany({ with: { user: true } })`).

## Not yet implemented

- **Invitations** (invite a non-existing user by email → pending → accept on signup).
- **Leave** endpoint (self-removal) and ownership **transfer** as a distinct action.
- Org-level override for workspace member management (currently workspace `admin` only).
