---
description: Nova implement phase — execute design tasks with retry and tracing
---

# Nova Implement Phase

You are executing the **implement phase** of a Nova workflow. Your role is to
execute each task from the design phase, routing to the appropriate approach
based on task type, and recording results with traceability.

## Step 1: Verify State

Read `.nova.yaml`. Check:
- `phases.design.status` is `done` — must have a completed design. Reject if not.
- `phases.design.tasks` is non-empty — must have tasks. Reject if empty.
- `phases.build.status` is NOT `done` — if done, ask user if they want to re-run.

Update `phases.build.status` to `in-progress` and set `startedAt` to now.

## Step 2: Load Task List

Read the task list from `.nova.yaml` (`phases.design.tasks`). Show the user:
- Total task count
- Task summary (id, title, type, priority, estimatedComplexity)
- Execution order (by priority, then by dependency)

Ask user to confirm before proceeding.

## Step 3: Execute Each Task

For each task in order:

### 3a. Prepare Context
Read files referenced in `task.files`. Read the design document
(`phases.design.designDoc`) for architecture context.

### 3b. Route by Task Type

**`implementation` tasks** — direct implementation:
- Write production code following existing project conventions
- Read existing similar files first to match patterns
- Cover edge cases and error states

**`testing` tasks** — use the **test-driven-development skill**:
- Activate TDD skill with the task's acceptance criteria
- Target 80%+ coverage on new code
- Ensure tests verify behavior, not implementation details

**`design` tasks** — update design documents:
- Modify or extend the design doc based on findings during implementation
- Note design changes in the task's output artifacts

**`review` / `security` tasks** — these are handled by `/nova-verify`; skip here

### 3c. Verify After Each Task
After implementing:
1. Run type check (`npx tsc --noEmit` or project equivalent)
2. Run tests (`npx jest --no-coverage` or project equivalent)
3. If checks fail, fix before marking task complete

### 3d. Record Result

After each task, update `.nova.yaml`:
```yaml
phases.build.tasks.<taskId>:
  status: done | failed
  completedAt: <timestamp>
```
On failure, record the error and ask user: abort, skip, or retry.

## Step 4: Final Verification

After all tasks:
- Run full test suite
- Run type check
- Report summary: tasks completed/failed, tests passed, type check status

## Step 5: Update State

Set `phases.build.status` to `done` and `phases.build.completedAt` to now.

## Constraints

- Follow existing project conventions — read existing code before writing
- Never leave TODOs, placeholders, or stubs
- Run type check and tests after EACH task, not just at the end
- If a task requires modifying a file not listed in `task.files`, note it in
  the task result but proceed only if the change is clearly necessary
- Task failure on a non-blocking task should not abort the entire phase —
  ask the user how to proceed
