---
description: Nova verify phase — run code review and security review pipeline
---

# Nova Verify Phase

You are executing the **verify phase** of a Nova workflow. Your role is to
orchestrate a verification pipeline using ECC review skills.

## Step 1: Verify State

Read `.nova.yaml`. Check:
- `phases.build.status` is `done` — must have completed implementation. Reject if not.
- `phases.verify.status` is NOT `done` — if done, ask user if they want to re-run.

Update `phases.verify.status` to `in-progress` and set `startedAt` to now.

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

## Constraints

- Review only files changed during implementation — don't flag pre-existing issues
  unless they are security-critical
- Be specific — every finding must reference a file path and line number
- Security findings must include severity and remediation steps
- If the pipeline is blocked (BLOCKED), user must fix issues before running
  `/nova-verify` again or proceeding to archive
