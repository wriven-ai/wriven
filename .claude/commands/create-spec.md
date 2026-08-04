---
description: Draft a feature spec for Wriven
argument-hint: "<feature name> e.g. content scheduling"
allowed-tools: Read, Write, Glob, Grep, Skill, ToolSearch
---

You are a senior engineer scoping a new feature for **Wriven** — an AI-native
headless CMS SaaS (Nx monorepo: NestJS microservices + Next.js client).
Follow the project rules in `CLAUDE.md` and the maintained reference docs
under `doc/` before writing anything.

> Run in **normal mode**, not plan mode — this command writes to `specs/`,
> and plan mode blocks file writes.

User input: $ARGUMENTS

## Step 1 — Parse the arguments

From `$ARGUMENTS` derive:

1. `feature_title` — human-readable, Title Case (e.g. "Content Scheduling").
2. `feature_slug` — file/git safe:
   - lowercase kebab-case, only `a-z 0-9 -`
   - max 40 chars (e.g. `content-scheduling`)
3. `spec_number` — auto-increment: scan every `NN-*.md` in `specs/`
   (only specs are numbered — reference docs are not), take the highest `NN`,
   add one, zero-pad to 2 digits. Run `ls specs/` to find the current highest —
   never assume a number from memory.

If you cannot infer the title/slug from `$ARGUMENTS`, ask the user to clarify
before proceeding. Do not guess.

## Step 2 — Research the codebase

Read before writing the spec:

- `CLAUDE.md` — Wriven overview, hard rules, workflow.
- `doc/overview.md` — product + tech stack.
- `doc/conventions.md` — response envelope, error codes, message patterns,
  commands, git/commit style.
- `doc/status.md` — confirm the feature (or its module) is not already
  marked ✅ done. If it is, warn the user and stop.
- `doc/market-readiness.md` — pick the priority (P0–P3) this maps to.
- The relevant module doc under `doc/` (e.g. `doc/core-service/`,
  `doc/auth-service/`, `doc/api-gateway/`, `doc/frontend/`,
  `doc/admin-panel/`).
- All existing specs in `specs/` — avoid duplicating scope.
- The code the feature will touch: search `apps/` and `libs/shared/contracts/`
  for existing DTOs, types, message patterns, or endpoints you can reuse.
- **Available tools** — check which skills, MCP servers, or plugins are
  currently available (via `ToolSearch` or the active tool list) that are
  relevant to this feature's domain: messaging, email, payments, storage,
  auth providers, DB, search, etc. If one exists, **use it** to pull real
  context (API shapes, current config, docs) instead of recalling from memory.
  Record what you checked and what you actually used — it goes in the spec's
  "Tooling context" section.

## Step 3 — Write the spec

Generate a spec document with this structure (keep every heading; write
"None" / "No changes" rather than dropping a section so the layout stays stable):

```markdown
# Spec: <feature_title>

> Priority: P0 | P1 | P2 | P3 · Area: gateway | auth | core | ai | client | admin | cross · Status: drafted

## Overview
One paragraph: what this feature does and why it matters now. Tie it to a
module in `doc/status.md` or a gap in `doc/market-readiness.md`.

## Depends on
Prior features/specs that must be complete first. Link the spec files in
`specs/` or the doc section. Write "None" if greenfield.

## Tooling context (skills / MCP / plugins)
External tools checked for this feature's domain (messaging, email, payments,
storage, auth, DB, search, …). For each: whether it was used and the real
context it yielded (API shapes, config, docs) — prefer tool-sourced facts over
memory. If none relevant: "No domain tools available / used."
- <tool> — checked, used: yes/no — <what it gave>

## Scope
- In scope:
- Out of scope:

## API / endpoints
Every new or changed endpoint:
- `METHOD /path` — what it does — auth level
  (public | access-token | workspace-member | project-admin | api-key)

If none: "No new endpoints."

## Shared contracts (@wriven/contracts)
New/changed DTOs, response types, TCP message patterns, or error codes that
must land in `libs/shared/contracts`. Or "No new contracts."

## Database / schema
Drizzle table/column changes and which migration to run
(`auth_svc` | `core_svc`). Include the `pnpm db:*` command. Or "No schema changes."

## Backend changes
Per service (api-gateway / auth-service / core-service / ai-service):
- **Create:** new files
- **Modify:** existing files + what changes

## Frontend changes (apps/client)
Pages, components, stores, TanStack Query hooks, or API client methods to
create/modify. Or "No frontend changes."

## Files to create
## Files to modify
## New dependencies
New npm/pip packages and where they go. Or "No new dependencies."

## Rules for implementation
Base rules (always include) plus any feature-specific ones.

Base:
- Define shared DTOs/types/patterns/errors in `libs/shared/contracts`
  (`@wriven/contracts`) — check it before creating new ones.
- Store only R2 object **keys** in the DB; reconstruct URLs at runtime.
- Respect microservice boundaries — do not collapse auth/core/ai logic.
- Endpoints return the response envelope; use error codes from
  `@wriven/contracts/errors.ts`; never leak stack traces or DB errors.
- Use dot-namespaced patterns from `@wriven/contracts/messages.ts`, never
  hardcoded strings.
- Frontend (`apps/client`) and backend changes go in **separate commits**;
  stage selectively, never `git add -A` across both.
- Run tasks through `pnpm nx <target> <project>`. Commits are one-line
  Conventional Commits with no body.

## Definition of done
A concrete, verifiable checklist. Each item must be checkable by running the
app or a `pnpm nx …` command (build/lint/typecheck/test or a manual smoke step).
```

## Step 4 — Save the spec

Save to: `specs/<spec_number>-<feature_slug>.md`
(create `specs/` if it does not exist).

## Step 5 — Report to the user

Print a short summary in this format:

```
Spec file: specs/<spec_number>-<feature_slug>.md
Title:     <feature_title>
Priority:  <P0–P3>
```

Branching is **your** call — the agent never creates or switches branches.

Then tell the user:

> Review the spec at `specs/<spec_number>-<feature_slug>.md`, then
> switch to plan mode (Shift+Tab) to begin implementation.

Do not print the full spec in chat unless explicitly asked.
