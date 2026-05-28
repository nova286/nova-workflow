---
description: Nova skip — skip a non-blocking task without rolling back the phase
---

# Nova Skip Task

Skip a single task in the implement phase.

## Step 0: Context Gate

Check if `.nova.yaml` exists in the project root.
- If NO: "This project isn't using Nova. Run `nova init` first."
- If YES and valid: Proceed.
- If YES but corrupted: Report and stop.

## Step 1: Locate Task

Read `.nova.yaml`. Find the task in `phases.build.tasks.<taskId>`.
- Not found → error: "Task `<taskId>` not found. Available: <list task IDs>"
- Found → proceed

## Step 2: Safety Check

If `task.guardConditions?.blocking === true`, warn:
"This task is marked as blocking. Skipping it may cause downstream issues.
Skip anyway?"

Ask user to confirm.

## Step 3: Skip

Set `phases.build.tasks.<taskId>.status = 'skipped'`.
Set `phases.build.tasks.<taskId>.completedAt = now`.

## Step 4: Output Status Bar

```
[Nova] implement · <taskId> skipped · <N/M effective> · next: <suggestion>
```
