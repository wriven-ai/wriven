# Plan: User Profile & Avatar

> Status: drafted · Executes: spec 18 (`specs/18-user-profile.md`) · Supersedes: -

## Goal
Let a user change their display name + profile photo from a new `/profile` page, and surface the
photo + a Profile link in the navbar avatar menu.

## Current state
- `users.avatar` column exists (`auth_svc`); written only by Google OAuth (a full URL), else null.
- `UserView.avatar` + `SessionView` already flow through `GET /auth/me` — contract unchanged.
- `GET /auth/me` (`AUTH_PATTERNS.GET_SESSION`) works; **no** profile-update endpoint exists (only admin suspend/verify).
- R2 + `storage.service.presignUpload(key, contentType)` / `publicUrl(key)` (env `R2_PUBLIC_URL`) live in **core-service**; `media.service.presign` (returns `{uploadUrl, key}`, no row) is the row-free signing pattern to mirror.
- Navbar `apps/client/src/components/topbar/dashboard-navbar.tsx`: avatar = initials only (ignores `user.avatar`); dropdown shows name+email + "Back to Website"; **no** Profile link.
- Client `UserView.avatar` + `authApi.me()` exist; no update method. `uploadMedia()` (`lib/api.ts:452`) is the presign→PUT→create flow to mirror (avatar skips the create step).

## Naming note (corrects the spec)
There is no `USER_PATTERNS` block. User patterns live in **`AUTH_PATTERNS`**; core storage/media in **`CORE_PATTERNS`**. This plan uses the real blocks:
- `AUTH_PATTERNS.UPDATE_PROFILE = 'auth.user.updateProfile'`
- `CORE_PATTERNS.AVATAR_PRESIGN = 'core.media.avatarPresign'`

## Phases

### Phase 1 — Shared contracts
- **Why here:** first — every service + the client import from `@wriven/contracts`.
- **Files — modify:**
  - `libs/shared/contracts/src/lib/dto/auth.dto.ts` — add `UpdateProfileDto`:
    `name?: string` (`@IsOptional @IsString @MinLength(1) @MaxLength(80) @Transform trim`, mirrors `RegisterDto.name`), `avatar?: string | null` (`@IsOptional @IsString @MaxLength(255)` — an R2 key to set, or `null` to clear). The **auth-service handler** additionally validates the resolved value is `null`, an `http(s)://` URL (Google), or matches `^avatars/<userId>/` (the prefix this plan's presign mints) — rejects arbitrary/huge strings or keys pointing at other objects.
  - `libs/shared/contracts/src/lib/messages.ts` — add `AUTH_PATTERNS.UPDATE_PROFILE` + `CORE_PATTERNS.AVATAR_PRESIGN` (strings above).
- **Shared contracts:** the two patterns + `UpdateProfileDto`. Reuse `UserView`, `PresignUploadDto` (`{filename, contentType, size?}`), `PresignResult` (`{uploadUrl, key}`) — no new types.
- **Verify:** `pnpm nx typecheck contracts` clean.

### Phase 2 — Backend: avatar presign (core-service)
- **Why here:** after contracts; the upload path the profile page calls. Independent of the auth write.
- **Files — modify:**
  - `apps/core-service/src/media/media.service.ts` — **first `export` the module-local helpers** `isAllowedType` / `maxBytesForContentType` (currently not exported, so not importable), then add `presignAvatar(p: { userId; dto: PresignUploadDto }): Promise<PresignResult>`: **image-only** (`isAllowedType` allows non-image media types — additionally constrain `contentType` to `image/*` here) + 5 MB cap (`maxBytesForContentType`), key `avatars/${userId}/${randomUUID()}${ext}` (NOT `projects/…`), `this.storage.presignUpload(key, dto.contentType)`. **No** `media_assets` insert, **no** storage-quota check (avatar is not workspace media).
  - `apps/core-service/src/media/media.controller.ts` — add `@MessagePattern(CORE_PATTERNS.AVATAR_PRESIGN)` → `presignAvatar({ userId, dto })`.
- **Shared contracts:** none new (Phase 1).
- **Verify:** `pnpm nx typecheck core-service` clean (ignore known branch TS1272 noise).

### Phase 3 — Backend: profile update + avatar URL reconstruction (auth-service)
- **Why here:** after contracts; the `PATCH /users/me` target + the URL fix that makes the stored key renderable.
- **Files — modify:**
  - `apps/auth-service/src/auth/auth.service.ts`:
    - **Extract a shared `resolveAvatarUrl(raw): string | null` helper** (module-level fn or a tiny util): returns `null` when empty; the value as-is if it matches `^https?:\/\/` (Google/OAuth URL); else `${R2_PUBLIC_URL}/${raw}` (an R2 key). Read base via `this.config.get('R2_PUBLIC_URL')` (ConfigService is already injected, line 61).
    - `toUserView(u)` — return `avatar: resolveAvatarUrl(u.avatar)`.
    - Add `updateProfile(payload: { userId; dto: UpdateProfileDto }): Promise<UserView>` — load user (404 if missing); build the patch (`name` and/or `avatar` only when present; `avatar: null` clears). **Validate `avatar`** server-side: must be `null`, an `http(s)://` URL, or match `^avatars/${userId}/` (rejects arbitrary strings / keys pointing at other objects). `.update(users).set(patch).where(eq(users.id, userId))`, return `toUserView(updated)`.
  - `apps/auth-service/src/auth/members.service.ts` (+ re-scan `projects.service.ts`) — these build user objects **inline** (`avatar: r.user.avatar`) and bypass `toUserView`. Route their `avatar` field through the **same** `resolveAvatarUrl` helper so workspace/project member lists show reconstructed URLs consistently with `/auth/me` (otherwise member `<img>`s break).
  - `apps/auth-service/src/auth/auth.controller.ts` — add `@MessagePattern(AUTH_PATTERNS.UPDATE_PROFILE)` → `auth.updateProfile({ userId, dto })`.
  - `apps/auth-service/.env` (+ `.env.example`) — add `R2_PUBLIC_URL` (same value core uses).
- **Shared contracts:** none new.
- **Verify:** `pnpm nx typecheck auth-service` clean. Smoke: `curl -X PATCH $API/users/me -H 'Authorization: Bearer <access>' -d '{"name":"New"}'` returns `UserView` with the new name; `GET /auth/me` agrees.

### Phase 4 — Backend: gateway edge
- **Why here:** after both services expose their patterns — the HTTP routes the client calls.
- **Files — create:**
  - `apps/api-gateway/src/users/users.controller.ts` — `@Controller('users')`, `@UseGuards(JwtAuthGuard)`:
    - `PATCH /users/me` (`@Body() dto: UpdateProfileDto`) → `firstValueFrom(auth.send(AUTH_PATTERNS.UPDATE_PROFILE, { userId, dto }))`.
    - `POST /users/me/avatar-presign` (`@Body() dto: PresignUploadDto`) → `firstValueFrom(core.send(CORE_PATTERNS.AVATAR_PRESIGN, { userId, dto }))`.
    - Inject both `SERVICE_TOKENS.AUTH_SERVICE` + `SERVICE_TOKENS.CORE_SERVICE`. Use `@CurrentUser() user: AuthUser` for `userId`. User-scoped — **no** `WorkspaceGuard`/`X-Workspace-Id`.
    - **CSRF is auto-applied** — `CsrfGuard` is a global guard (`main.ts:35`), and `CSRF_EXEMPT` exempts only `/auth/(login|register|…)`, so `PATCH /users/me` is protected with no per-controller wiring. The client already sends `X-CSRF-Token` on mutating requests.
- **Files — modify:**
  - `apps/api-gateway/src/app/app.module.ts` — register `UsersController` in `controllers`.
- **Shared contracts:** none new.
- **Verify:** `pnpm nx typecheck api-gateway` clean (ignore known TS1272). Smoke: `POST /users/me/avatar-presign -d '{"filename":"a.png","contentType":"image/png","size":1234}'` → `{uploadUrl, key}`; PUT a byte to `uploadUrl` succeeds; then `PATCH /users/me -d '{"avatar":"<key>"}'` → `UserView.avatar` is a full `R2_PUBLIC_URL/avatars/…` URL.

### Phase 5 — Frontend (apps/client) — separate commit
- **Why here:** last — backend must exist first; split per the frontend/backend commit rule.
- **Files — create:**
  - `apps/client/src/app/profile/page.tsx` — Profile page: name field (prefill `user.name`, Save → `PATCH /users/me {name}`); avatar block (img or initials, **Change photo** = file pick → `avatarPresign` → PUT to R2 → `PATCH /users/me {avatar:key}` → refresh me; **Remove** → `PATCH /users/me {avatar:null}`); read-only email.
  - (Helper, if cleaner as its own file) `apps/client/src/lib/upload-avatar.ts` — `uploadAvatar(file)`: presign → `fetch(uploadUrl, {method:'PUT', body:file, headers:{'Content-Type'}})` → return `key` (mirror `uploadMedia` at `lib/api.ts:452`, skip `media.create`).
- **Files — modify:**
  - `apps/client/src/lib/api.ts` — add `authApi.updateProfile(dto)` (`PATCH /users/me`) + `authApi.avatarPresign({filename, contentType, size})` (`POST /users/me/avatar-presign`).
  - `apps/client/src/stores/auth.ts` — add an `updateUser(user: UserView)` action (mirror the existing `updateWorkspace`, line 105). The session `user` lives in **zustand, not react-query** — invalidating a query cache won't refresh the navbar. Both name-save and avatar-upload success paths must call `updateUser` (the PATCH returns the updated `UserView`), so the navbar + store update without a reload.
  - `apps/client/src/components/topbar/dashboard-navbar.tsx` — avatar: `<img src={user.avatar}>` when present else initials; add a **Profile** `<Link href="/profile">` in the dropdown above "Back to Website".
- **Shared contracts:** none (client mirrors `UserView` already).
- **Verify:** `tsc --noEmit` in `apps/client` clean for new/modified files. Manual: change name + upload a photo on `/profile`; navbar avatar + name update without reload; Remove clears it.

## Risks / open questions
- **`/profile` routing — resolved.** `(dashboard)/layout.tsx` enforces **no** workspace (scoping is per-page, under `w/[wsSlug]`). So `(dashboard)/profile/page.tsx` renders the dashboard chrome user-scoped, no `X-Workspace-Id` needed. (Spec flagged this as open; code confirms it's straightforward.)
- **Member-avatar consistency.** `members.service.ts` (+ `projects.service.ts`) build user objects inline, bypassing `toUserView`. Phase 3 routes them through the shared `resolveAvatarUrl` helper — otherwise member lists show raw keys while `/auth/me` shows URLs. Verify both paths after Phase 3.
- **`R2_PUBLIC_URL` in auth-service.** Currently only core reads it; auth-service needs it for avatar reconstruction. Add to env + deployment config. If unset, avatars reconstruct to `/avatars/…` (broken img) — fail loudly in dev, document in `.env.example`.
- **Store update mechanism.** The session `user` lives in zustand (not react-query), so Phase 5 must call a new `updateUser` store action — not invalidate a query cache — or the navbar stays stale.
- **Orphaned R2 objects.** Changing/removing an avatar leaves the prior object in R2 (no `storage.delete` call). Acceptable for P3 (small per-user images); optional follow-up: `storage.delete(oldKey)` on overwrite/remove.
- **Key-vs-URL detection** in `resolveAvatarUrl`: use a strict `^https?:\/\/` regex (not `startsWith('http')`) so an R2 key is never mistaken for a URL. Google-OAuth URLs pass through unchanged.
- **`toUserView` is shared** by register/login/refresh/me — reconstruction applies everywhere (avatar always renderable). Intended; no per-call special-casing.
- Avatar upload size/type cap enforced server-side (Phase 2, image-only + 5 MB) and mirrored client-side in the file picker.

## Out of scope
- Email change (re-verification), password change, image cropping/transforms, admin avatar editing (per spec).

## Definition of done
- [ ] Phase 1: `pnpm nx typecheck contracts` clean; `UpdateProfileDto` + 2 patterns exported.
- [ ] Phase 2: `pnpm nx typecheck core-service` clean; `isAllowedType`/`maxBytesForContentType` exported; avatar presign returns `{uploadUrl, key}` (image-only, ≤5 MB), no asset row.
- [ ] Phase 3: `pnpm nx typecheck auth-service` clean; `PATCH /users/me {name}` round-trips via `GET /auth/me`; stored avatar is a key, returned avatar is a full URL; **member lists** (`/workspaces/:ws/members`) also return reconstructed avatar URLs (shared helper).
- [ ] Phase 4: `pnpm nx typecheck api-gateway` clean; both HTTP routes work end-to-end (presign → PUT → PATCH); `PATCH /users/me` rejects an `avatar` key not under `avatars/<userId>/`.
- [ ] Phase 5: client typecheck clean; `/profile` updates name + photo; navbar reflects changes **via the `updateUser` store action** without reload; Profile link present.
- [ ] Backend changes (Phases 1–4) and frontend (Phase 5) land as **separate commits**.
