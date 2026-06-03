# Nova Hybrid Kernel Plan

## Summary

Nova should become a hybrid workflow system:

- Skills are the execution surface for long-running, interactive Agent work.
- The CLI is the deterministic kernel for fast state inspection, validation,
  guard checks, context generation, checkpointing, and archive.
- The bare `nova` command is equivalent to `nova next`.
- `/nova` uses the same next-action semantics inside the active Agent session.

This keeps slow Agent work inside the environment that already has context,
tools, streaming, and user interaction, while keeping the workflow contract
testable and predictable in TypeScript.

## Execution Boundary

### Skills Own Long Work

The following actions remain skill-first:

- `/nova-propose`
- `/nova-design`
- `/nova-implement`
- `/nova-verify`
- `/nova-iterate`

These commands may ask questions, inspect broad context, write source files, run
tests, and interact with the user. They should use CLI kernel commands to
validate and record workflow state instead of manually editing `.nova.yaml`
whenever possible.

### CLI Owns Fast Determinism

The CLI should avoid spawning long-running Agent work. It owns:

- `nova` and `nova next`: decide the next action.
- `nova status`: inspect the full workflow dashboard.
- `nova validate`: validate state, artifacts, tasks, and evidence.
- `nova guard`: check phase transitions.
- `nova context`: emit TaskContext JSON.
- `nova checkpoint`: record phase/task state and evidence.
- `nova archive`: finalize artifacts after verification.

## CLI Surface

Existing commands stay:

```bash
nova init
nova status
nova context --task-id <id>
nova guard <from> <to>
nova archive
```

New commands:

```bash
nova validate [--json]
nova next [--json]
nova checkpoint phase <phase> --status <status>
nova checkpoint task <task-id> --status <status> [--files <csv>] [--tests <csv>] [--trace-id <id>] [--note <text>]
```

Bare command:

```bash
nova
```

is equivalent to:

```bash
nova next
```

## Command Semantics

### `nova status`

`status` is a dashboard. It answers:

- Which phase is each part of the workflow in?
- How many tasks are complete?
- Has any phase been in progress for too long?
- Are there obvious failed or skipped tasks?

It should not be responsible for choosing the single next action.

### `nova next`

`next` is a router. It answers:

- What should the user or Agent run now?
- Is the workflow blocked?
- Which validation or guard error explains the block?

Human output should show a compact overview and exactly one recommended next
action. JSON output should be stable enough for scripts and `/nova` to consume.

### `nova checkpoint`

`checkpoint` is the write path for skills. It records progress without running
the long phase itself.

Phase checkpoint behavior:

- Update phase status.
- Maintain phase timestamps through `StateManager.update()`.
- Validate before marking a phase `done`.

Task checkpoint behavior:

- Require the task to exist in `phases.design.tasks`.
- Merge evidence instead of replacing it wholesale.
- Record `status`, `filesChanged`, `tests`, `traceIds`, `notes`, and `updatedAt`.
- Preserve unknown task result fields.

## Internal Interfaces

Validation result:

```ts
interface ValidationResult {
  pass: boolean;
  errors: Array<{ code: string; message: string; path?: string }>;
  warnings: Array<{ code: string; message: string; path?: string }>;
}
```

Next-action result:

```ts
interface NextActionResult {
  phase: 'propose' | 'design' | 'implement' | 'verify' | 'archive' | 'complete';
  status: 'ready' | 'blocked' | 'complete';
  command: string;
  reason: string;
  errors: ValidationResult['errors'];
  warnings: ValidationResult['warnings'];
}
```

## State And Guard Rules

- `.nova.yaml` remains backward-compatible.
- State validation is additive and conservative.
- Unknown metadata fields are preserved.
- Unknown transitions fail by default.
- Rollback transitions are explicit allowlist entries.
- `design -> implement` continues to enforce task quality.
- `implement -> verify` requires implementation status and task evidence.

## Skill Integration

Generated skills should say:

> Nova installs skill entrypoints and maintains a local workflow state machine.
> Long-running AI work happens inside your active Agent session; the CLI provides
> fast validation, context, guard, checkpoint, and archive commands.

Skill updates:

- `/nova` aligns with `nova next`.
- `/nova-propose` checkpoints phase start and done.
- `/nova-design` validates generated tasks before marking done.
- `/nova-implement` checkpoints each task's evidence.
- `/nova-verify` checkpoints verification report completion.
- `/nova-iterate` keeps interactive rollback decisions and records history.

## Test Plan

Add tests for:

- `nova` equals `nova next`.
- `nova next --json` returns a stable result.
- `nova validate` passes on fresh state and fails on invalid state.
- Unknown guard transitions fail.
- Checkpoint updates phase status, task status, evidence, and timestamps.
- Generated skill text references `nova validate`, `nova next`, and
  `nova checkpoint`.

Regression checks:

```bash
npm test
npx tsc --noEmit
npm run build
```
