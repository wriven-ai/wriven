---
description: Draft an execution plan for a Wriven feature, from its spec
argument-hint: "<spec number or slug> e.g. 03 or media"
allowed-tools: Read, Write, Glob, Grep, Skill, ToolSearch
---

You are a senior engineer turning a **spec into an execution plan** for
**Wriven**. A spec says *what* and *why*; a plan says *how* — the ordered,
file-by-file sequence to build it, with a runnable check per step. Follow
`CLAUDE.md` and the `doc/` reference set.

> Run in **normal mode**, not plan mode — this command writes to `plans/`,
> and plan mode blocks file writes.

User input: $ARGUMENTS  (a spec number like `03` or a slug like `media`)

A plan is **opt-in** — only large or multi-step features need one. If the spec
is trivial, say so and stop (use plan mode directly instead).

## Step 1 — Resolve the spec

Match `$ARGUMENTS` to a file in `specs/` by leading number (`03` →
`03-media.md`) or by slug substring. Read it fully. If no match, list the specs
and ask the user which one to plan. Do not guess.

## Step 2 — Research

- The spec itself (overview, endpoints, contracts, schema, files, DoD).
- `doc/status.md` — what's **already done** for this area. Don't re-plan
  shipped work; note it as "current state".
- The module doc the spec lives in (`doc/core-service/`, `doc/auth-service/`,
  `doc/api-gateway/`, `doc/frontend/`, `doc/admin-panel/`).
- The actual code: search `apps/` and `libs/shared/contracts/` for the files,
  DTOs, message patterns, and endpoints the spec names — confirm they exist and
  note their real shape.
- **Available tools** — check skills/MCP/plugins relevant to the domain (via
  `ToolSearch` or the active tool list): DB, storage, payments, email, search,
  auth, etc. Use one to pull real API/config context instead of memory; record
  what you checked and used.
- Any existing plan in `plans/` for this spec — extend or supersede, don't
  duplicate.

## Step 3 — Write the plan

`plan_number` = highest `NN-` in `plans/` plus one (zero-padded 2 digits);
`01` if none. `plan_slug` = the spec's slug by default (override if the plan
has its own identity, e.g. `model-a-build-plan`).

Generate the plan with this structure (keep every heading; write "None" rather
than dropping one):

```markdown
# Plan: <title>

> Status: drafted · Executes: spec <NN> (`specs/<NN>-<slug>.md`) · Supersedes: -

## Goal
One line: what finishing this plan delivers.

## Current state
What already exists for this area (from `doc/status.md` + the code scan). The
plan starts from here — don't re-do done work.

## Phases
Ordered, each phase gated on the one before:

### Phase 1 — <name>
- **Why here** (dependency on prior phases, or "first — unblocks the rest").
- **Files — create:** `path/to/file.ts`
- **Files — modify:** `path/to/file.ts` — what changes
- **Shared contracts** (`libs/shared/contracts`): new/changed DTOs, patterns,
  error codes — or "none".
- **Verify:** a runnable check — `pnpm nx typecheck core-service`, a curl
  smoke step, a manual UI check, etc.

### Phase 2 — <name>
… (same shape) …

## Risks / open questions
What could derail it; decisions needed before/during.

## Out of scope
Explicitly not in this plan (deferred to a later plan or spec).

## Definition of done
Mirrors the spec's DoD; each item maps to a phase's Verify step.
```

## Step 4 — Save the plan

Save to: `plans/<plan_number>-<plan_slug>.md`
(create `plans/` if it does not exist).

## Step 5 — Report to the user

Print a short summary:

```
Plan file: plans/<plan_number>-<plan_slug>.md
Executes:  specs/<spec_NN>-<spec_slug>.md
Phases:    <count>
```

Then tell the user:

> Plan saved to `plans/<plan_number>-<plan_slug>.md`. Implement when ready
> — enter plan mode yourself if you want an approval-first pass.

Branching is **your** call — the agent never creates or switches branches. Do
not print the full plan in chat unless explicitly asked.
