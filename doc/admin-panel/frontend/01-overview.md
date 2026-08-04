# Admin Panel — Frontend Overview

Build guide for the agent building the **Wriven Admin Panel SPA** in its **own
separate repository**. Read the whole `frontend/` folder before writing code.

You are building a React + React Router single-page app that talks to the
`/admin/*` API on the Wriven gateway (`https://api.wriven.com`). The backend
contract is in [../backend/06-endpoints.md](../backend/06-endpoints.md) and
[../api-contract.md](../api-contract.md); product context in
[../README.md](../README.md).

> You will NOT have access to the Wriven monorepo or `@wriven/contracts`. This is
> a standalone repo. All API types are **hand-maintained here**
> ([03-data-layer.md](./03-data-layer.md)), mirroring the backend DTOs.

## Module docs (this folder)

| File | Covers |
|------|--------|
| **01-overview.md** (this) | What you're building, screen order, definition of done |
| [02-stack-structure.md](./02-stack-structure.md) | Tech stack, project structure, env |
| [03-data-layer.md](./03-data-layer.md) | API client, hand-maintained types, auth bootstrap, query conventions, layout/nav |
| [04-screens.md](./04-screens.md) | Every screen, detailed spec |
| [05-design-system.md](./05-design-system.md) | Wriven brand tokens (light+dark), typography, components |

---

## 1. What you are building

An internal, staff-only **operations console**. Cross-tenant, table-heavy,
god-mode. Three admin roles drive what's visible/enabled: **`admin`** (full),
**`moderator`** (oversight + moderation, no admin-user/plan/settings mgmt),
**`member`** (read-only). Role comes from `GET /admin/auth/me`; gate UI on it —
but remember the **server enforces** it too, so never rely on hiding alone.

Screens (build in this order): Login → Overview → Users → Workspaces → Projects →
Content → Media → API Keys → Webhooks → Plans → Admins → Audit Log → Settings.
Full spec per screen in [04-screens.md](./04-screens.md).

---

## 2. Definition of done

- Login (+TOTP) works against `/admin/auth/*`; `member`/`moderator`/`admin` see the
  correct subset of nav and actions; server still rejects forbidden writes.
- Every list is server-paginated/filterable with URL-synced params; every
  destructive action goes through confirm+reason and shows a result toast.
- Brand palette (light + dark) matches the tenant app; Manrope everywhere.
- No raw secrets ever rendered; no tenant-app code or `@wriven/contracts` imported.
- Talks only to `/admin/*`; `credentials: 'include'`; 401 → `/login`.
