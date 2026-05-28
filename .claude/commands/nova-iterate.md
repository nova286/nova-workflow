---
description: Nova iterate — roll back to a previous phase for rework
---

# Nova Iterate Phase

You are handling a **phase iteration** in a Nova workflow. Software development is
iterative — implementation reveals design gaps, verification reveals spec issues.
This command safely rolls back state so you can re-enter an earlier phase without
losing your work.

## Step 0: Context Gate

Check if `.nova.yaml` exists in the project root.
- If NO: "This project isn't using Nova. Run `nova init` first, or I'll
  use raw Superpowers skills directly." Let user choose.
- If YES: Parse it. If YAML is corrupted or unreadable, say:
  ".nova.yaml exists but is corrupted. Run `nova init --force` to
  reinitialize, or fix the file manually." Stop — do not proceed.
- If YES and valid: Nova owns this workflow. Verify phase is correct
  for this command:
  * `/nova-propose` — reject if past propose (design/build/verify done
    or in-progress). Suggest `/nova-iterate` to roll back first.
  * `/nova-design` — reject if propose not done, or if build/verify done.
  * `/nova-implement` — reject if design not done.
  * `/nova-verify` — reject if build not done.
  * `/nova-iterate` — always allowed.
  If the phase is correct, proceed.

## Step 1: Detect Current Phase

Read `.nova.yaml`. Determine which phase is currently active.

- If `in-progress` — show current state before rollback:

  ```
  [Nova] Iteration in progress
    Current phase: <phase> (status)
    Ready to roll back. Which phase should we return to?
  ```

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

## Step 6: Output Status Bar

After all work is done and `.nova.yaml` is updated, output a one-line status summary:

```
[Nova] <phase> · <completion> · next: <suggestion>
```

Read `.nova.yaml` to determine:
- `<phase>`: the current phase name (propose / design / implement / verify / archive)
- `<completion>`: phase status (done / in-progress / N/M done / failed)
- `<suggestion>`: the logical next action

Examples:
[Nova] propose · done · next: /nova-design
[Nova] design · done · 6 tasks · next: /nova-implement
[Nova] implement · 3/6 done · next: "add rate limiting" (task-4)
[Nova] verify · 2 issues · next: fix then /nova-verify
[Nova] all done · next: nova archive

## Constraints

- Never delete code files without explicit user confirmation
- Always record the iteration reason in metadata.history
- Reset state is reversible (old state is in history)
- If the project is not a git repository, warn the user that file revert is
  not available and only state reset will be performed
