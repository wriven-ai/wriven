# Spec: User Profile & Avatar

> Priority: P3 · Area: cross (auth + client, touches core) · Status: drafted

## Overview

The dashboard navbar's user menu is a stub: the avatar shows only initials (it ignores the
`user.avatar` key), and the dropdown's only entry is "Back to Website" — there is no way to
view or edit your own account. This spec adds a real **Profile page** (`/profile`) where a user
can change their display name and profile photo, and wires the navbar to it: render the actual
avatar image when present (initials fallback), keep name + email visible, and add a "Profile"
menu item.

The database already supports this — `users.avatar` (text) exists and `UserView.avatar` already
flows through `GET /auth/me`. What's missing is a **user-facing profile update path** (only
admin suspend/verify exists today) and an **avatar upload** path. This spec adds both, following
the R2-keys-only rule: store the object key on `users.avatar`, reconstruct the public URL at
runtime. Maps to account-UX polish in `doc/market-readiness.md` (P3, not in P0/P1 buckets).

## Depends on

- specs/03 (media) — establishes the R2 presign + `storage.service` pattern reused for avatar upload.
- specs/12/13 (RBAC) — `PermissionGuard` / auth store plumbing the navbar + new route sit on.
- Existing `GET /auth/me` (`AUTH_PATTERNS.GET_SESSION`) + `UserView` contract — unchanged, reused.

## Tooling context (skills / MCP / plugins)

No domain tools available / used. (No storage/email/auth-provider MCP servers relevant to a
self-hosted R2 + NestJS auth flow; R2/S3 details taken from `apps/core-service/src/storage/storage.service.ts`
and `media.service.ts` directly.)

## Scope

- In scope:
  - Navbar: render `user.avatar` as an `<img>` when present (initials fallback), keep name+email in the dropdown, add a **Profile** menu link → `/profile`.
  - New `/profile` page: change display name; upload / remove profile photo.
  - Backend: user-facing **profile update** (name + avatar key) + **avatar presign** (R2 direct upload, no `media_assets` row).
  - Server-side avatar URL reconstruction (R2 keys-only rule).
- Out of scope:
  - Email change (requires re-verification flow — separate spec).
  - Password change (separate spec; the reset flow is the current path).
  - Cropping / image transforms (spec P1 "on-the-fly image transforms" is its own track).
  - Admin-side user avatar editing.

## API / endpoints

- `POST /users/me/avatar-presign` — issue a presigned R2 PUT URL + object key for a new avatar
  (no `media_assets` row; key under `avatars/{userId}/…`). — **access-token**
- `PATCH /users/me` — update the current user's `name` and/or `avatar` (R2 key). Returns the
  updated `UserView`. — **access-token**

(Read path `GET /auth/me` already returns `UserView` incl. `avatar`; unchanged.)

## Shared contracts (@wriven/contracts)

- **New DTO** (`dto/auth.dto.ts`): `UpdateProfileDto { name?: string; avatar?: string | null }`
  — `name` optional, 1–80 trimmed; `avatar` optional R2 key (`@IsOptional @IsString @MaxLength(255)`) or `null` (clears photo). The handler additionally validates `avatar` is `null`, an `http(s)://` URL, or matches `^avatars/<userId>/` — rejects arbitrary/huge strings or keys pointing at other objects.
- **New patterns** (`messages.ts`) — user patterns live in **`AUTH_PATTERNS`**, core storage in **`CORE_PATTERNS`** (there is no `USER_PATTERNS` block):
  - `AUTH_PATTERNS.UPDATE_PROFILE = 'auth.user.updateProfile'` (auth-service).
  - `CORE_PATTERNS.AVATAR_PRESIGN = 'core.media.avatarPresign'` (core-service — R2 owner).
- **Reuse** `UserView` (already has `avatar: string | null`), `PresignUploadDto`, `PresignResult` — no new types.

## Database / schema

No schema changes. `users.avatar` (text, `auth_svc`) already exists. Profile photo uploads store
the **R2 object key** in this column (R2-keys-only rule); the display URL is reconstructed at
runtime (see Backend changes).

## Backend changes

### core-service (owns R2 / `storage.service`)
- **Modify:** `media.service.ts` — `export` the module-local helpers `isAllowedType` / `maxBytesForContentType` (currently not exported) so the avatar presign can reuse them.
- **Create:** avatar presign handler (thin, mirrors `media.service.presign` row-free half): **image-only** (`isAllowedType` allows non-image media — additionally constrain to `image/*`) + 5 MB cap, signs a PUT for `avatars/{userId}/{uuid}.{ext}`, returns `{ uploadUrl, key }`. **No** `media_assets` insert (an avatar is not project media). Pattern `CORE_PATTERNS.AVATAR_PRESIGN`.
- **Modify:** `storage.service` is reused as-is (`presignUpload(key, contentType)` already generic).

### auth-service (owns `users`)
- **Create:** `updateProfile(payload: { userId; dto: UpdateProfileDto })` → updates `users.name`
  and/or `users.avatar` (key or null), returns `UserView` via existing `toUserView()`. Pattern
  `AUTH_PATTERNS.UPDATE_PROFILE`.
- **Modify:** avatar **URL reconstruction** — extract a shared `resolveAvatarUrl(raw)` helper and
  call it from `toUserView()`: if `avatar` is set and not already an `http(s)` URL (i.e. an R2
  key), prepend the R2 public base env (`R2_PUBLIC_URL`, same var core media uses). Google-OAuth
  avatars (already full URLs) pass through unchanged. **Also route the inline user mappers in
  `members.service.ts` + `projects.service.ts`** (which build `{id,email,name,avatar}` directly,
  bypassing `toUserView`) through the same helper — otherwise member lists show raw keys while
  `/auth/me` shows URLs. Keeps the DB keys-only while every `UserView.avatar` is renderable.

### api-gateway (HTTP edge)
- **Create:**
  - `POST /users/me/avatar-presign` → forwards to core `CORE_PATTERNS.AVATAR_PRESIGN` (injects
    `userId` from the JWT). **access-token** (JwtAuthGuard).
  - `PATCH /users/me` → forwards to auth `AUTH_PATTERNS.UPDATE_PROFILE` with the validated
    `UpdateProfileDto`. **access-token**.
- **Modify:** `auth.controller.ts` (or a new `users.controller.ts`) — add the two routes. They are
  user-scoped (no workspace/project header).

## Frontend changes (apps/client)

- **Create:** `app/profile/page.tsx` — Profile page:
  - Name field (prefilled from `user.name`) + Save → `PATCH /users/me { name }`.
  - Avatar: current photo (or initials fallback), **Change photo** (file pick → presign → PUT to
    R2 → `PATCH /users/me { avatar: key }` → refresh session) and **Remove** (`avatar: null`).
  - Read-only email display.
- **Create:** `authApi.updateProfile(dto)` + `authApi.avatarPresign({ filename, contentType })` in
  `lib/api.ts`; a `useUpdateProfile` mutation + `uploadAvatar()` helper (mirrors `uploadMedia()`
  at `lib/api.ts:452` but skips the `media.create` step).
- **Modify:** `stores/auth.ts` — add an `updateUser(user: UserView)` action (mirrors the existing
  `updateWorkspace`). The session `user` lives in **zustand, not react-query** — invalidating a
  query cache won't refresh the navbar. Name-save + avatar-upload success must call `updateUser`
  (the PATCH returns the updated `UserView`) so the navbar + store update without a reload.
- **Modify:** `components/topbar/dashboard-navbar.tsx`:
  - Avatar: render `<img src={user.avatar}>` when present; initials fallback when null/missing.
  - Dropdown: keep name + email; add a **Profile** `<Link href="/profile">` above "Back to Website".
- **Note:** `/profile` is user-scoped, not workspace-scoped. `(dashboard)/layout.tsx` enforces no
  workspace (scoping is per-page under `w/[wsSlug]`), so `(dashboard)/profile/page.tsx` renders
  the dashboard chrome with no `X-Workspace-Id` — straightforward, not blocked.

## Files to create
- `apps/client/src/app/profile/page.tsx`
- (Backend new handler files depend on chosen module split — see Backend changes)

## Files to modify
- `libs/shared/contracts/src/lib/dto/auth.dto.ts` — add `UpdateProfileDto`.
- `libs/shared/contracts/src/lib/messages.ts` — add `AUTH_PATTERNS.UPDATE_PROFILE` + `CORE_PATTERNS.AVATAR_PRESIGN`.
- `apps/auth-service/src/auth/auth.controller.ts` + `auth.service.ts` — `updateProfile` + `toUserView` URL reconstruction.
- `apps/core-service/src/media/` (or a small avatar controller) — avatar presign handler.
- `apps/api-gateway/src/auth/auth.controller.ts` (or new `users.controller.ts`) — two routes.
- `apps/client/src/lib/api.ts`, `apps/client/src/components/topbar/dashboard-navbar.tsx`, `apps/client/src/stores/auth.ts` (refresh user on update).

## New dependencies
None. Reuses `@aws-sdk` presign (core) + existing client fetch + TanStack Query.

## Rules for implementation

Base:
- Define shared DTOs/types/patterns/errors in `libs/shared/contracts` (`@wriven/contracts`) — check it before creating new ones.
- Store only R2 object **keys** in the DB; reconstruct URLs at runtime (`toUserView` does this for avatar).
- Respect microservice boundaries — R2 upload signing in core; `users` write in auth; HTTP edge in gateway.
- Endpoints return the response envelope; use error codes from `@wriven/contracts/errors.ts`; never leak stack traces or DB errors.
- Use dot-namespaced patterns from `@wriven/contracts/messages.ts`, never hardcoded strings.
- Frontend (`apps/client`) and backend changes go in **separate commits**; stage selectively, never `git add -A` across both.
- Run tasks through `pnpm nx <target> <project>`. Commits are one-line Conventional Commits with no body.

Feature-specific:
- Avatar column stores an R2 **key** for uploads (never a Wriven URL); Google-OAuth URLs are the only external URLs kept verbatim.
- Avatar presign must **not** create a `media_assets` row — it is not project media.
- Enforce an avatar upload size cap (reuse the 5 MB image limit from `uploadMedia`).
- After a successful profile update, refresh `/auth/me` so the navbar avatar/name updates without a reload.

## Definition of done
- [ ] `pnpm nx typecheck @wriven/contracts` clean; `UpdateProfileDto` + 2 new patterns exported.
- [ ] `pnpm nx typecheck api-gateway` + `auth-service` + `core-service` clean (ignoring known branch-wide TS1272 breakage).
- [ ] `PATCH /users/me { name }` updates the name and the new value returns from `GET /auth/me`.
- [ ] `POST /users/me/avatar-presign` → PUT file to R2 → `PATCH /users/me { avatar: key }` results in a renderable avatar URL in `GET /auth/me`.
- [ ] `PATCH /users/me { avatar: null }` clears the photo; an `avatar` not under `avatars/<userId>/` (and not an `http(s)` URL / null) is rejected.
- [ ] Workspace/project **member lists** return reconstructed avatar URLs too (shared `resolveAvatarUrl`) — no raw keys leak to the client.
- [ ] `core-service` `isAllowedType`/`maxBytesForContentType` are exported; avatar presign is image-only, ≤5 MB.
- [ ] Navbar renders the avatar image when present, initials otherwise; "Profile" link opens `/profile`.
- [ ] `/profile` page changes name + photo and the navbar reflects it without a manual reload.
- [ ] Client typecheck (`tsc --noEmit` in `apps/client`) clean for all new/modified files.
