---
description: Nova verify phase — when .nova.yaml exists, handles ALL review requests through Nova's state machine (wraps code-review + security-review)
---

# Nova Verify Phase

You are executing the **verify phase** of a Nova workflow. Your role is to
orchestrate a verification pipeline using ECC review skills.

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

## Step 1: Verify State

Read `.nova.yaml`. Check:
- `phases.build.status` is `done` — must have completed implementation. Reject if not.
- `phases.verify.status` is NOT `done` — if done, ask user if they want to re-run.
- If `in-progress` — generate a resume summary:

  ```
  [Nova] Resuming verify phase
    Last active: <relative time>
    Build completed with <N> tasks
    Verification in progress — continue review?
  ```

Update `phases.verify.status` to `in-progress` and set `startedAt` to now. Skip this update if already `in-progress`.

## Step 2: Gather Review Context

From `.nova.yaml`, collect:
- Task list from `phases.design.tasks` (only tasks with `status: done`)
- For each task: id, title, description, files changed, acceptance criteria
- Design document reference: `phases.design.designDoc`

Read the changed files to understand what was implemented.

## Step 3: Run Code Review

Use the **ecc:code-reviewer** skill (or **code-review** skill) to review each
implemented task's changed files. For each task, assess:

- **Correctness** — does the code fulfill the task description and acceptance criteria?
- **Conventions** — does it follow existing project patterns and coding standards?
- **Error handling** — are edge cases and error states properly handled?
- **Test coverage** — are there tests? Do they verify the acceptance criteria?
- **Type safety** — are types correct and complete?

For each task, produce a verdict: **PASS**, **CHANGES_REQUESTED**, or **COMMENT**.
Be specific — reference file paths and line numbers.

## Step 4: Run Security Review

Use the **ecc:security-reviewer** skill (or **security-review** skill) to audit
each implemented task's changed files. Check for:

- **Injection risks** — unsanitized input, command injection, SQL injection
- **Secret exposure** — hardcoded keys, tokens, credentials
- **Insecure dependencies** — usage of dangerous or deprecated APIs
- **Input validation** — missing validation on user or external input
- **Path traversal** — unsafe file path handling

For each task, produce a verdict: **PASS** or **VULNERABILITY_FOUND**.
Security findings must include severity (critical/high/medium/low) and
remediation guidance.

## Step 5: Generate Verification Report

Write `docs/designs/verification-report.md`:

```markdown
# Verification Report

## Summary
- Tasks reviewed: N
- Code review: X passed, Y changes requested, Z comments
- Security review: X passed, Y vulnerabilities found

## Code Review Results
| Task | Verdict | Notes |
|------|---------|-------|
| task-id | PASS | ... |

## Security Review Results
| Task | Verdict | Severity | Issue |
|------|---------|----------|-------|
| task-id | VULNERABILITY_FOUND | medium | ... |

## Overall Assessment
[PASS / NEEDS_FIXES / BLOCKED]

## Recommendations
...
```

## Step 6: Update State

Update `.nova.yaml`:
- `phases.verify.status = 'done'`
- `phases.verify.completedAt = now`
- `phases.verify.pipelineResult.status` = `success` | `partial` | `failed`
- `phases.verify.pipelineResult.stages` = per-stage result summary

Report summary to user with pass/fail counts and overall verdict.

## Step 7: Output Status Bar

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

- Review only files changed during implementation — don't flag pre-existing issues
  unless they are security-critical
- Be specific — every finding must reference a file path and line number
- Security findings must include severity and remediation steps
- If the pipeline is blocked (BLOCKED), user must fix issues before running
  `/nova-verify` again or proceeding to archive
