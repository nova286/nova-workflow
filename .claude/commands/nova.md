---
description: Nova — unified entry point. Shows progress and suggests next action.
---

# Nova

Read `.nova.yaml` and present a compact overview with a clear next action.

## Step 1: Read State

Parse `.nova.yaml`. For each phase, determine status (pending / in-progress / done).

If `.nova.yaml` does not exist, say: "Nova not initialized. Run `nova init` in
your terminal first."

## Step 2: Show Overview

```
Nova · <project-name>
────────────────────────────────────────
propose   [done]       docs/proposals/proposal.md
design    [done]       docs/designs/design.md · 6 tasks
implement [in-progress] 3/6 tasks done
verify    [pending]
archive   [pending]
────────────────────────────────────────
```

## Step 3: Suggest Next Action

Based on the first phase that is NOT done:

| Current State | Suggestion |
|---------------|------------|
| propose: pending | "/nova-propose — Start with a proposal" |
| propose: in-progress | "/nova-propose — Continue the proposal" |
| design: pending | "/nova-design — Create technical design" |
| design: in-progress | "/nova-design — Continue the design" |
| implement: pending | "/nova-implement — Start implementing (N tasks)" |
| implement: in-progress | "/nova-implement — Continue (N tasks remaining)" |
| verify: pending | "/nova-verify — Run review pipeline" |
| verify: in-progress | "/nova-verify — Continue verification" |
| all done (archive pending) | "nova archive — Finalize project" |
| all done (archive done) | "Project complete." |

Show: "Next: <suggestion>"

Also list available actions:
- `/nova-propose` `/nova-design` `/nova-implement` `/nova-verify`
- `/nova-iterate` — roll back to earlier phase
- `/nova-status` — detailed view with durations

## Step 4: Act

Ask the user: "Run the suggested action, pick another, or do something else?"
Act on their choice.

## Constraints

- Read-only unless the user explicitly confirms an action.
- Keep the overview compact — one line per phase.
