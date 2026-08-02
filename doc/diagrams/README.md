# Diagrams

Visual mental models of the Wriven system. Each entry is an `.svg` (the diagram) + an `.md` (embeds it with context). SVGs are hand-written text — edit directly; they render in GitHub, VS Code, and any browser.

| # | Diagram | What it shows |
|---|---------|---------------|
| 00 | [System Overview](./00-system-overview.md) | services, ports, protocols, external deps, shared libs |
| 01 | [Auth & RBAC](./01-auth-rbac.md) | request flow · permission cascade · enforcement layers |
| 02 | [Tenancy Data Model](./02-tenancy-data-model.md) | users → workspaces → projects → members |
| 04 | [Core-Service (CMS)](./04-core-cms.md) | content model · entry lifecycle · delivery API · media |
| 05 | [Billing (Stripe)](./05-billing.md) | checkout/portal · webhook reconciler → entitlements |
| 06 | [Webhooks](./06-webhooks.md) | signed dispatch · retry/backoff |
| 07 | [Admin Panel](./07-admin-panel.md) | platform console · separate RBAC axis |
| 08 | [Frontend](./08-frontend.md) | cookie auth · URL scope · nav brain · RBAC mirror |
| 09 | [Usage Metering](./09-usage-metering.md) | Delivery request counter · batched flush · `/usage` read · soft overage gate |

> Start at [00](./00-system-overview.md), then [01](./01-auth-rbac.md) (the RBAC mental model). Numbers skip 03 — the request lifecycle is covered by 01a (backend flow) + 08 (client 401-refresh).

## Conventions

- **Format:** Mermaid-free hand-written SVG (no build step, version-controllable).
- **Palette:** dark `#0b1120` canvas; blue = gateway/edge, teal = NestJS services, amber = data/gateway-permission, rose = external/forbidden, indigo = client, slate = shared/unbuilt.
- **Legend:** each diagram carries its own; arrows are solid (sync call) / dashed (async, webhook, or dependency).
- **Edit a diagram:** open the `.svg` and modify the shapes/text directly.
