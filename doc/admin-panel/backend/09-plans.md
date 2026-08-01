# Admin Panel — Plans + Subscriptions + Enforcement

Plan definitions, per-workspace subscriptions, and how plan limits are enforced
across auth + core. Schema in [02-schema.md](./02-schema.md). Status: **Phase D (done)**.

---

## 1. Admin plan management

- `GET /admin/plans` — list definitions.
- `POST /admin/plans` `[admin]` — create.
- `PATCH /admin/plans/:id` `[admin]` — update.
- `PUT /admin/workspaces/:id/plan` `[admin]` — assign a plan to a workspace
  (+ overrides). **Atomic upsert** (`onConflictDoUpdate` on `subscriptions.workspaceId`)
  — no assign race.

Plans/subscriptions live in auth-service `admin-plans.service.ts`.

---

## 2. Effective-limit resolution

`EntitlementsService.resolveLimits(workspaceId)`:
- base = `plan.limits` (from the workspace's subscription, else the `free` plan),
- merged with `subscription.overrides` (per-workspace admin bumps),
- **fails closed** to baked-in `FREE_FALLBACK` defaults if the `free` plan isn't
  seeded (enforcement never silently turns off).

`auth.entitlements.resolve` RPC returns `{ limits, usage }` for a workspace.

---

## 3. Auth-side enforcement (TOCTOU-safe)

Counts run **inside the create transaction** under a per-workspace advisory lock
(`pg_advisory_xact_lock(hashtextextended(workspaceId, 0))`) so concurrent creates
can't both pass the check:

- **projects** — `assertProjectQuotaTx(tx, ws)` on direct create + workspace create.
- **members** — `assertMemberQuotaTx(tx, ws)` on add-member, **invitation accept**
  (new seats only), and **project-invite guest auto-add** (`ensureWorkspaceMember`,
  counting guests — closes the invite seat bypass).

Over-limit throws `PLAN_LIMIT_REACHED` (403). Free = 2 projects.

---

## 4. Core-side enforcement (`CoreEntitlementsService`)

Limits live in auth-service, so core fetches them over TCP
(`auth.entitlements.resolve`) and counts its own resources:

- **entries**, **contentTypes**, **apiKeys**, **webhooks** — asserted on create.
- **media storage** (`storageMb`) — enforced at presign against the plan (replaced
  the old hardcoded `WORKSPACE_MEDIA_QUOTA_BYTES`).

**Resilience:** the resolve call is **timed out (4s) + short-cached (30s) + fails
open** — if auth-service is unreachable and there's no cached value, the write is
**allowed** rather than blocked. Plan caps are soft; a limit-check outage must not
break content creation.

> Webhook quota counts only `active=true` rows. Core-side counts are point-in-time
> (not advisory-locked) — minor race on soft caps; the hard storage cap is checked
> pre-upload.

See [apps/core-service/src/entitlements/core-entitlements.service.ts](../../../apps/core-service/src/entitlements/core-entitlements.service.ts).
