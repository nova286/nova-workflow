---
description: Nova iterate — roll back to a previous phase for iteration
---

# Nova Iterate Phase

You are handling a **phase iteration** in a Nova workflow. Software development is
iterative — implementation reveals design gaps, verification reveals spec issues.
This command safely rolls back state so you can re-enter an earlier phase without
losing your work.

## Step 1: Detect Current Phase

Read `.nova.yaml`. Determine which phase is currently active:

| Phase Status | Current Phase | Can Iterate Back To |
|---|---|---|
| `design.status: done/in-progress` | design | open |
| `build.status: done/in-progress` | build | design, open |
| `verify.status: done/in-progress` | verify | build, design |
| `archive.status: done` | archive | verify, build (via re-open) |

If all phases are `pending` or only `open` is active, report:
"No active later phase to iterate from. You're already at the earliest stage."

## Step 2: Present Iteration Options

Based on the current phase, present valid rollback targets. For each target,
explain what will happen:

```
Current phase: build (implement)
Iterate back to:
  1. design — "Design needs changes. Tasks and build status will reset."
  2. open   — "Proposal needs rethinking. Everything resets."
```

Ask the user:
- Which phase to iterate back to?
- Why? (brief reason, recorded in history)
- Keep or discard the work done in the current phase?

## Step 3: Execute Rollback

### If user chose to KEEP work:

Reset state only — preserve all files:
```yaml
# Example: build to design
phases.build.status: pending
phases.build.tasks: {}         # Clear task results
phases.build.startedAt: null
phases.build.completedAt: null
phases.design.status: pending   # Re-open design for editing
phases.design.completedAt: null
```

### If user chose to DISCARD work:

Additionally revert changed files:
- Use `git diff --name-only` to find changed files
- Ask user to confirm file revert list before executing
- Revert files with `git checkout -- <file>` or equivalent

## Step 4: Record Iteration

Update `.nova.yaml` metadata.history:

```yaml
metadata:
  history:
    - version: N
      timestamp: <now>
      change: "Iterated build to design: [user's reason]"
```

## Step 5: Report Next Steps

Clear summary of what happened and what to do next:

```
Iteration recorded: build to design
Reason: "Component split needs adjusting"
Files preserved: src/**, docs/**

Next: run /nova-design to update the design, then /nova-implement to rebuild.
```

## Constraints

- Never delete code files without explicit user confirmation
- Always record the iteration reason in metadata.history
- Reset state is reversible (old state is in history)
- If the project is not a git repository, warn the user that file revert is
  not available and only state reset will be performed
