# Nova v2.1: Skill Ecosystem Routing + Interaction Upgrades

## Problem Statement

Nova faces two fundamental interaction problems:

1. **Routing Ambiguity**: When multiple skill ecosystems coexist (Nova, Superpowers, OpenSpec), there is no mechanism to decide which skill handles a user intent like "我要设计XX方案". Superpowers' `brainstorming` skill claims "MUST use this before ANY creative work" — Nova's skills have no equivalent claim. The result: AI routing is arbitrary.

2. **Passive State Machine**: Nova knows everything about the workflow state, but never proactively surfaces it. Users must remember to type `/nova` to check progress. After a long session or returning to a project, context is lost despite all state being persisted.

## Design Goals

- **Route by Context, Not by Wording**: `.nova.yaml` existence determines routing priority, not who wrote the stronger skill description
- **Push, Not Pull**: State visibility is ambient — every Nova interaction outputs a status bar
- **Validate at Boundaries**: Phase transitions validate not just binary conditions (doc exists?) but quality conditions (are tasks actionable?)
- **Fine-Grained Control**: Retry/skip individual tasks without rolling back entire phases

---

## 1. Routing Protocol: Three-Layer Architecture

```
User Intent ("我要设计登录")
    │
    ▼
Layer 1: Skill Description Priority
    ├─ .nova.yaml exists? → Nova skills claim priority in descriptions
    └─ .nova.yaml absent?  → Superpowers handles directly
    │
    ▼
Layer 2: Context Gate (Step 0 in every Nova skill)
    ├─ Verify .nova.yaml exists and phase is correct
    ├─ Not applicable? → Fall back to Superpowers
    └─ Applicable? → Continue
    │
    ▼
Layer 3: Internal Delegation
    ├─ /nova-propose  → calls brainstorming
    ├─ /nova-design   → calls brainstorming → calls writing-plans
    ├─ /nova-implement → calls TDD skill → calls code-review
    └─ /nova-verify   → calls code-review + security-review
```

Nova does not replace Superpowers. It wraps Superpowers with state management, phase sequencing, and traceability.

### 1.1 Step 0: Context Gate

Every Nova skill file gets a Step 0 before the existing Step 1:

```markdown
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
```

### 1.2 Skill Description Convention

Each skill's `description` frontmatter declares context-dependent priority:

| Skill | New Description |
|-------|----------------|
| `/nova` | "Nova — unified project command center. Shows phase progress and routes to the correct phase skill. Use this FIRST when .nova.yaml exists." |
| `/nova-propose` | "Nova propose phase — when .nova.yaml exists, handles ALL proposal/requirements requests through Nova's state machine (wraps brainstorming)" |
| `/nova-design` | "Nova design phase — when .nova.yaml exists, handles ALL design requests through Nova's state machine (wraps brainstorming + writing-plans)" |
| `/nova-implement` | "Nova implement phase — when .nova.yaml exists, handles ALL implementation requests through Nova's state machine (wraps TDD + code-review)" |
| `/nova-verify` | "Nova verify phase — when .nova.yaml exists, handles ALL review requests through Nova's state machine (wraps code-review + security-review)" |
| `/nova-iterate` | "Nova iterate — roll back to a previous phase for rework" |

### 1.3 `/nova` as Intent Router

`/nova` is upgraded from a static status display to an active router:

```markdown
## Step 3 (new): Route Intent

Based on the first phase that is NOT done:
- propose pending/in-progress → route to /nova-propose
- design pending/in-progress → route to /nova-design
- implement pending/in-progress → route to /nova-implement
- verify pending/in-progress → route to /nova-verify
- all done → suggest `nova archive`

Ask user to confirm, then invoke the target skill.
```

---

## 2. Push Status Bar

Every Nova skill outputs a one-line status bar after updating `.nova.yaml`. No user action required — state visibility is ambient.

### 2.1 Format Protocol

```
[Nova] <phase> · <completion> · next: <suggestion>
```

Examples:
```
[Nova] propose · done · next: /nova-design
[Nova] design · done · 6 tasks · next: /nova-implement
[Nova] implement · 3/6 done · next: "add rate limiting" (task-4)
[Nova] verify · failed · 2 issues · next: fix then /nova-verify
[Nova] all done · next: nova archive
```

### 2.2 Implementation

Added as the final step in each skill file, after state update:

```markdown
## Step N: Output Status Bar

After updating .nova.yaml, output:
[Nova] <current phase> · <status> · next: <suggestion>
```

---

## 3. Context Resume

When entering a phase that is already `in-progress`, generate a resume summary before proceeding.

### 3.1 Format

```
[Nova] Resuming implement phase
  Last active: 2 hours ago (2026-05-28 14:30)
  Completed: task-1 (login endpoint), task-2 (auth middleware)
  Failed:    task-3 (type error in auth.ts:42)
  Remaining: task-4, task-5, task-6
Continue with task-3, or skip to task-4?
```

### 3.2 Data Source

All information is already in `.nova.yaml`:
- `metadata.lastModified` → "Last active"
- `phases.build.tasks.<id>.status` → completed/failed/remaining
- `metadata.history[]` → what changed and when

### 3.3 Integration

Extended into each phase skill's Step 1 (Verify State):

```markdown
## Step 1: Verify State

Read `.nova.yaml`. Check phase status:
- `done` → ask if regenerate or move to next phase
- `pending` → proceed normally
- `in-progress` → **generate resume summary** (see format above),
  ask user how to proceed, then continue
```

---

## 4. Handoff Quality Validation

Phase transitions validate not just binary conditions, but the quality of artifacts being handed off.

### 4.0 Task Data Shape (Important Distinction)

Tasks exist in two different shapes in `.nova.yaml`, used at different lifecycle stages:

```
phases.design.tasks    → Array<TaskDefinition>      (design output, validated at design→build gate)
phases.build.tasks     → Record<taskId, TaskStatus>  (build execution state, keyed by task ID)
```

Section 4 validates the **design-phase array** (`phases.design.tasks`), ensuring the task list is well-formed before build starts. Section 5 operates on the **build-phase record** (`phases.build.tasks.<taskId>`), modifying individual task execution status.

### 4.1 Validation Matrix

```
open → design:
  □ proposal.md exists
  □ Problem Statement is non-empty
  □ At least 1 success criterion

design → build:
  □ design.md exists
  □ Each task has all required fields (id, title, type, files, acceptance)
  □ All task IDs are unique kebab-case
  □ task.type is a valid value
  □ task.files is a non-empty array; each file has path + action
  □ task.acceptance is a non-empty array with verifiable criteria

build → verify:
  □ All non-skipped, blocking tasks are done
  □ Or eccReviewPassed = true
```

### 4.2 Implementation

New file: `src/cli-core/quality-check.ts`

```typescript
interface QualityReport {
  pass: boolean;
  errors: string[];
}

function validateTaskSchema(tasks: any[]): QualityReport;
function validateTaskIds(tasks: any[]): QualityReport;
function validateAcceptance(tasks: any[]): QualityReport;
function validateFiles(tasks: any[]): QualityReport;
```

All functions receive `phases.design.tasks` (the array form), not the build Record.

### 4.3 Guard Interface Change

The existing `guardPhaseTransition(from, to)` returns `Promise<boolean>`. To surface structured quality-check errors, the signature changes to:

```typescript
interface GuardFailure {
  label: string;
  errors: string[];
}

interface GuardResult {
  pass: boolean;
  failures: GuardFailure[];
}

async function guardPhaseTransition(from: string, to: string): Promise<GuardResult>;
```

Backward compatibility: the boolean `.pass` field preserves the old contract. Callers that only check `pass` are unaffected. New callers can inspect `.failures` for per-rule error detail.

Quality checks map `QualityReport.errors` → `GuardFailure.errors`:

```typescript
'design:build': [
  // ... existing rules ...
  { label: 'All tasks have required fields',
    check: (s) => { const r = validateTaskSchema(s.phases.design?.tasks);
                    return { pass: r.pass, errors: r.errors }; }},
],
```

On failure, output is specific to the task-id level:

```
Guard failed: design → build
  ✗ task-3 missing field: files
  ✗ task-5 acceptance criteria is empty
  ✗ task-7 has duplicate id
Fix docs/designs/design.md and re-run guard.
```

---

## 5. Single-Task Retry & Skip

### 5.1 `/nova-retry <taskId>`

A lightweight skill that resets and re-executes a single task:

1. Locate task in `.nova.yaml` → `phases.build.tasks.<taskId>`
2. Reset status to `in-progress`
3. Execute using same type-routing rules as `/nova-implement` Step 3b
4. Update state and output status bar

### 5.2 `/nova-skip <taskId>`

State-only operation:

1. Locate task. If `guardConditions.blocking === true`, warn user
2. Set status to `skipped`
3. Output status bar

### 5.3 TaskStatus Extension

`src/cli-core/types.ts`:

```
pending | in-progress | done | failed | skipped  (add "skipped")
```

### 5.4 Guard Update

`build → verify` treats `skipped` non-blocking tasks as done-equivalent. Blocking tasks (`guardConditions.blocking === true`) still require `done` status.

---

## 6. Change Summary

| # | Change | Files | Complexity |
|---|--------|-------|------------|
| 1 | Step 0: Context Gate | 6 skill files | Low (~15 lines each) |
| 2 | Skill description rewrite | 6 skill file frontmatters | Low (1 line each) |
| 3 | Push status bar | 6 skill files, final step | Low (~10 lines each) |
| 4 | Context resume | 5 phase skills, Step 1 extension | Medium (read state + format) |
| 5 | Handoff quality validation | `guard.ts` (signature change) + new `quality-check.ts` | Medium (~80 lines) |
| 6 | Retry/skip skills | 2 new skill files | Medium (2 new files) |
| 7 | TaskStatus extension | `types.ts` | Low (1 line) |
| 8 | Edge cases & migration | Design spec (no code changes, but informs implementation) | — |

**Unchanged**: StateManager, CLI commands, Pipeline/Dispatcher, adapters.

---

## 7. What This Does NOT Change

- Nova remains a thin orchestration shell — it does not write content
- The 5-phase workflow structure is preserved
- Superpowers skills (brainstorming, writing-plans, TDD) continue to run at full capability — Nova wraps, never neuters
- CLI layer (`nova init`, `nova status`, etc.) remains as fallback for non-Claude-Code environments

---

## 8. Edge Cases

### 8.1 Corrupted State File

If `.nova.yaml` exists but cannot be parsed (malformed YAML, truncated write), Context Gate (Step 0) must catch this before any operation proceeds. The skill reports the corruption and stops — no partial reads, no best-effort recovery. User fixes manually or runs `nova init --force`.

### 8.2 Migration from Pre-v2.1 State Files

Existing `.nova.yaml` files may lack the `skipped` task status. On first load, `StateManager` normalizes: any task status not in the current enum defaults to `failed`. No explicit migration script needed — normalization on read is sufficient.

### 8.3 Cross-Phase Skill Invocation

If a user runs `/nova-design` while the implement phase is already done, Step 0 must reject:
- "Design phase is already complete and implementation has started. Use `/nova-iterate build:design` to roll back first."
Cross-phase validation table:

| Current State | User runs | Behavior |
|---------------|-----------|----------|
| propose done, design pending | `/nova-design` | Proceed |
| design done, build in-progress | `/nova-design` | Reject — suggest `/nova-iterate build:design` |
| build done | `/nova-design` | Reject — suggest `/nova-iterate` |
| build done | `/nova-implement` | Reject — already done, suggest `/nova-verify` |
| verify done | `/nova-implement` | Reject — suggest `/nova-iterate` |

### 8.4 /nova-iterate Behavior

`/nova-iterate` rolls a phase back to `pending`, clearing that phase's outputs. It has a Step 0 Context Gate (same as all Nova skills). Its Step 1 confirms: "This will discard the design doc and task list for the design phase. Continue?" No quality validation applies (iterate is destructive by design). After rollback, it outputs the status bar showing the new current phase.

### 8.5 Empty Task List After Skip

If all tasks are skipped, `build → verify` guard treats it as: all non-blocking tasks resolved. The guard passes. But `/nova-implement` should warn before proceeding: "All remaining tasks are skipped. Proceed to verify?"
