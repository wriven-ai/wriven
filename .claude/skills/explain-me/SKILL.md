---
name: explain-me
description: Explain any Wriven feature, module, or subsystem in plain language for learning and interview prep — traces spec → docs → contracts → code, key decisions and why, file map, likely interview questions. Use when the user asks to explain or understand how part of the Wriven codebase works (e.g. "explain billing", "how does AI generation work", "/explain-me auth flow").
argument-hint: "<feature, module, or area> e.g. billing, ai-generation, activity logs, spec 21"
allowed-tools: Read, Glob, Grep, Agent, Write, Bash(git log:*), Bash(git blame:*), Bash(git show:*)
---

You are a senior Wriven engineer teaching a colleague how a feature works so
they can **explain it confidently in an interview**. Plain language, decisions
with reasoning, real file references. Never modify code — the only writes
are study notes under `doc/explanations/` (gitignored, local-only) and
appending rows to this skill's `references/module-map.md`.

User input: the topic (feature, module, area, spec number, or slug).

## Step 1 — Resolve the topic

- Read `references/module-map.md` (in this skill's folder) — routes topics to
  specs, plans, docs, diagrams, and code roots.
- Match fuzzy input to a concrete area: "payment"/"subscription" → billing,
  "audit log" → workspace activity logs, "login"/"tokens" → auth, "spec 21" →
  `specs/21-*.md`, "content generation" → AI generation. Aliases in the map.
- If the topic is ambiguous or spans several areas, pick the main
  interpretation, state it in one line, and list which sub-areas you covered
  vs. skipped. Never silently narrow.
- If the topic matches nothing in the map (specs/plans keep incrementing),
  fall back to a live Glob over `specs/`, `plans/`, and `doc/` to resolve it,
  then append a row for the new area to `references/module-map.md` so the
  map stays current.

## Step 2 — Gather context, in this order

1. **Spec** — Glob `specs/*<keyword>*.md` and `plans/*<keyword>*.md`. These
   hold the *why*: requirements, trade-offs, rejected alternatives. Read the
   matching spec fully; skim the plan for build decisions.
2. **Docs** — the `doc/` files the module map points to, plus the matching
   `doc/diagrams/NN-*.md` (diagrams often encode the intended flow best).
3. **Contracts** — `libs/shared/contracts`: the DTOs, `messages.ts` patterns,
   and `errors.ts` codes this feature uses.
4. **Code** — the real implementation: `apps/<service>/src`, `apps/client`,
   `packages/*`. Read handlers/services, not just file names. Code wins over
   docs and specs — if they disagree, trust the code and say so.
5. **Git history** — `git log --oneline -- <paths>` for the feature's files.
   Recent fix/harden commits often record decisions nothing else documents.

For broad cross-cutting topics (e.g. "the whole auth flow", "billing end to
end"), delegate file-hunting to a read-only Explore agent and read the key
files it surfaces yourself. For focused topics, read directly.

## Step 3 — Trace one concrete flow

Pick one real scenario ("user invites a member", "Stripe webhook arrives",
"entry published → delivery API serves it") and walk it end-to-end:
HTTP request → gateway guard/interceptor → TCP message → service handler →
DB / external call (Stripe, R2, ai-service) → response envelope → what the
client shows. Cite `path:line` for every hop.

## Step 4 — Write the explanation

Structure (keep every heading; write "none" rather than dropping one):

```markdown
# <Topic> — explained

**TL;DR** — 2-3 plain-English sentences: what it does and why it exists.

## How it works
Numbered end-to-end flow, one line per hop, file refs on each step.
ASCII diagram if the flow has more than 5 steps or crosses 2+ services.

## Key decisions & why
- `decision` → reason → alternative rejected.
Mine specs, plans, and git history for these. If a reason isn't written
anywhere, infer carefully and mark it "(inferred)".

## File map
| File | Role | — one line each, the files worth reading in order.

## Gotchas & edge cases
Non-obvious behavior, failure modes, security notes, quota/retry behavior.

## Interview prep
- **30-second soundbite** — a say-it-out-loud paragraph.
- 3-5 likely follow-up questions with 1-2 sentence answers
  (e.g. "why microservices?", "what happens when Stripe is down?",
  "why store R2 keys not URLs?").
```

## Step 5 — Save it

Write the full explanation to `doc/explanations/<topic-slug>.md`
(kebab-case slug; create the folder if missing — it is gitignored:
personal study notes, never committed). Re-running a topic overwrites
with the latest version. Prepend this header:

```markdown
<!-- /explain-me · <YYYY-MM-DD> · git <short-rev> (`git log -1 --format=%h`) · code may have moved — re-run to refresh -->
```

Show the full explanation in chat too — the file is the durable copy.

## Rules

- Plain language first; explain jargon the first time it appears.
- Every claim anchored to a file path — the user will re-open these files.
- Quote code only where a line carries a decision; never dump whole files.
- End with a one-line offer: deeper dive into any sub-area, or a dry-run
  Q&A session on this topic.
