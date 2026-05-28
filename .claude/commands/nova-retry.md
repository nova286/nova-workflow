---
description: Nova retry — retry a single failed or completed task without rolling back the phase
---

# Nova Retry Task

Retry a single task from the implement phase.

## Step 0: Context Gate

Check if `.nova.yaml` exists in the project root.
- If NO: "This project isn't using Nova. Run `nova init` first."
- If YES and valid: Proceed.
- If YES but corrupted: Report and stop.

## Step 1: Locate Task

Read `.nova.yaml`. Find the task in `phases.build.tasks.<taskId>`.
- Not found → error: "Task `<taskId>` not found. Available: <list task IDs>"
- Found with status `done` → "Task `<taskId>` is already done. Re-run anyway?"
- Found with status `failed` or `skipped` → Proceed
- Found with status `in-progress` → "Task is already in progress. Continue?"

## Step 2: Execute

Set task status to `in-progress`. Execute using the same routing rules as
`/nova-implement` Step 3b:
- `implementation` → direct implementation, follow project conventions
- `testing` → use the **test-driven-development skill**
- `design` → update design documents

Read the task's `files`, `acceptance`, and the design document for context.

## Step 3: Verify

After implementing:
1. Run type check (`npx tsc --noEmit` or project equivalent)
2. Run tests (`npx jest --no-coverage` or project equivalent)
3. If checks fail, fix before marking complete

## Step 4: Update State

Update `.nova.yaml`:
- `phases.build.tasks.<taskId>.status = 'done' | 'failed'`
- `phases.build.tasks.<taskId>.completedAt = now`

## Step 5: Output Status Bar

```
[Nova] implement · <N/M done> · next: <suggestion>
```
