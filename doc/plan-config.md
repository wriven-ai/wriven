# Plan Configuration

Plans are **not seeded** — they live in the `auth_svc.plans` table and are created/managed from the admin panel (`POST /admin/plans`). This doc is the intended configuration reference (originally specs/15). If the DB and this doc disagree, the DB wins — fix this doc (or the plan in the admin panel).

- 3 plans: `free` / `starter` / `pro`
- Prices stored in **cents**; yearly = 10% discount (all paid tiers). The admin panel create form sends **USD dollars**; `CreatePlanDto` (`@wriven/contracts`) carries dollars and the **auth-service `AdminPlansService` converts to cents** (not in the DTO); read paths (`AdminPlanView`) return cents.
- Paid-plan create also creates the Stripe Product + monthly/yearly Prices server-side and stores their ids; prices are read-only after create (Stripe owns them)
- `free` is the default plan for every workspace — until a `free` row exists, `EntitlementsService` fails closed to its baked-in `FREE_FALLBACK` limits, which are **stricter than the configured Free tier**: projects 2, members **3**, environments 1, contentTypes **10**, entries **1000**, storageMb **100**, apiKeys **3** (plus `revisionsPerEntry`/`aiTextRequestsPerMonth`/`aiImageRequestsPerMonth` defaults — see `auth/entitlements.service.ts`). Keep the `free` plan row healthy; the fallback is a safety net, not a mirror.
- Limits sized to free-tier infra (R2 + Supabase) + indie pricing

## Pricing

| | Free | Starter | Pro |
|---|---|---|---|
| Monthly | $0 | $10 (1000¢) | $18 (1800¢) |
| Yearly | $0 | $108 (10 800¢) | $194.40 (19 440¢) |
| Yearly discount | — | 10% (−1200¢) | 10% (−2160¢) |
| Trial days | 0 | 0 | 0 |
| sortOrder | 0 | 1 | 2 |

## Limits

| Limit | Free | Starter | Pro |
|---|---|---|---|
| `projects` | 2 | 5 | 15 |
| `members` | 4 | 10 | 25 |
| `environments` | 0 | 0 | 0 |
| `contentTypes` | 50 | 250 | 500 |
| `entries` | 500 | 2 000 | 10 000 |
| `locales` | 1 | 1 | 1 |
| `storageMb` | 1 024 (1 GB) | 10 240 (10 GB) | 51 200 (50 GB) |
| `assetBandwidthGb` | 10 | null (unlimited) | null (unlimited) |
| `apiRequestsPerMonth` | 100 000 | 500 000 | 2 000 000 |
| `apiKeys` | 2 | 10 | 25 |
| `webhooks` | 2 | 10 | 20 |
| `revisionsPerEntry` | 5 | 10 | 15 |
| `aiTextRequestsPerMonth` | 50 | 500 | 2 000 |
| `aiImageRequestsPerMonth` | 5 | 50 | 200 |

`null` = no cap (enforcement disabled).

## Features

| Feature | Free | Starter | Pro |
|---|---|---|---|
| `scheduledPublishing` | false | false | false |
| `revisionHistory` | false | true | true |
| `customRoles` | false | false | false |
| `auditLog` | false | false | false |
| `previewApi` | true | true | true |
| `supportTier` | community | email | priority |

## Descriptions

- **Free** — "For trying Wriven and small personal projects."
- **Starter** — "For small teams shipping production content."
- **Pro** — "For bigger teams: higher limits, more AI, priority support."

## Creating the plans

Via the admin panel (Plans → Create). The seed no longer touches plans — `pnpm db:auth:seed` only bootstraps the admin user from `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD`.

- Enter the monthly price in **USD dollars** (e.g. `10`) — converted to cents server-side
- Optional yearly discount % — the server computes `priceYearly` and the saved amount
- Key must be exactly `free` for the free tier (workspace signup, entitlements fallback, and checkout all look the key up by string)
- Order of operations on a fresh environment: run migrations → seed the admin → create `free` first, then `starter`/`pro`
