import * as fs from 'fs/promises';
import * as path from 'path';
import { EnvironmentAdapter } from '../types';

const SKILL_TEMPLATES: Record<string, string> = {
  'nova.md': `---
description: Nova — unified entry point. Shows progress and suggests next action.
---

# Nova

Read \`.nova.yaml\` and present a compact overview with a clear next action.

## Step 1: Read State
Parse \`.nova.yaml\`. For each phase, determine status (pending / in-progress / done).
If \`.nova.yaml\` does not exist, say: "Nova not initialized. Run \`nova init\` first."

## Step 2: Show Overview
\`\`\`
Nova · <project-name>
────────────────────────────────────────
propose   [done]       docs/proposals/proposal.md
design    [done]       docs/designs/design.md · 6 tasks
implement [in-progress] 3/6 tasks done
verify    [pending]
archive   [pending]
────────────────────────────────────────
\`\`\`

## Step 3: Suggest Next Action
Based on the first phase that is NOT done:
- propose: pending → "/nova-propose — Start with a proposal"
- design: pending → "/nova-design — Create technical design"
- implement: pending → "/nova-implement — Start implementing"
- verify: pending → "/nova-verify — Run review pipeline"
- all done → "nova archive — Finalize project"

Show: "Next: <suggestion>"
Also list: /nova-propose /nova-design /nova-implement /nova-verify /nova-iterate /nova-status

## Step 4: Act
Ask: "Run the suggested action, pick another, or do something else?"

## Constraints
Read-only unless the user explicitly confirms an action.
`,

  'nova-propose.md': `---
description: Nova propose phase — generate a feature proposal from interactive Q&A
---

# Nova Propose Phase

You are executing the **propose phase** of a Nova workflow. Your role is to
orchestrate requirements exploration and produce a structured proposal document.

## Step 1: Verify State
Read \`.nova.yaml\`. Check \`phases.open.status\`. If pending, update to
\`in-progress\` and set \`startedAt\`.

## Step 2: Gather Context
Read \`AGENTS.md\`, \`CLAUDE.md\`, \`README.md\`, \`package.json\`, \`src/\` to
understand the project.

## Step 3: Explore Requirements
Use the **brainstorming skill** to explore the problem space: clarify the problem,
explore alternatives, identify risks, define success criteria. Summarize for the
user and ask them to confirm before proceeding.

## Step 4: Generate Proposal
Write \`docs/proposals/proposal.md\` with: Problem Statement, Proposed Solution,
User Stories (prioritized), Scope & Deliverables (in/out), Success Criteria
(measurable), Risks & Constraints.

## Step 5: Update State
Set \`phases.open.status = 'in-progress'\`,
\`phases.open.proposal = 'docs/proposals/proposal.md'\`.

## Constraints
- Read any file for context. Write only to \`docs/proposals/\` and \`.nova.yaml\`.
- Do not modify source code — the implement phase handles that.
`,

  'nova-design.md': `---
description: Nova design phase — generate technical design from approved proposal
---

# Nova Design Phase

You are executing the **design phase** of a Nova workflow. Your role is to
orchestrate architecture exploration and produce a design document with an
actionable task list.

## Step 1: Verify State
Read \`.nova.yaml\`. Require \`phases.open.status: done\` with a non-empty proposal.
Update \`phases.design.status\` to \`in-progress\` and set \`startedAt\`.

## Step 2: Load Context
Read the proposal (\`phases.open.proposal\`), \`AGENTS.md\`, \`package.json\`, \`src/\`.

## Step 3: Explore Architecture Options
Use the **brainstorming skill** to explore at least 2 architectural approaches.
For each: architecture pattern, tech stack rationale, component structure, data
flow, key trade-offs. Present alternatives to the user for selection.

## Step 4: Generate Design Document
Based on the user-selected approach, use the **writing-plans skill** to produce
\`docs/designs/design.md\` with: Architecture Overview, Tech Stack, Component
Breakdown, Data Flow, Implementation Plan (YAML task list), Risks & Mitigations.

## Step 5: Validate Tasks
Verify each task has all required fields (id, title, type, description, files,
acceptance, priority, estimatedComplexity).

## Step 6: Update State
Set \`phases.design.status = 'done'\`, \`designDoc\`, \`tasks\` from parsed YAML.

## Constraints
- Design and plan only — no implementation code.
- Tasks must be concrete: specific file paths, verifiable acceptance criteria.
`,

  'nova-implement.md': `---
description: Nova implement phase — execute design tasks with retry and tracing
---

# Nova Implement Phase

You are executing the **implement phase** of a Nova workflow. Your role is to
execute each task from the design phase, routing by task type.

## Step 1: Verify State
Read \`.nova.yaml\`. Require \`phases.design.status: done\` with non-empty tasks.
Update \`phases.build.status\` to \`in-progress\` and set \`startedAt\`.

## Step 2: Load Task List
Show task summary (id, title, type, priority). Ask user to confirm before
proceeding.

## Step 3: Execute Each Task
For each task in priority order:

### Route by Task Type
- **implementation** — write production code following project conventions
- **testing** — use the **test-driven-development skill**
- **design** — update design documents (noted for user review)

### Verify After Each Task
1. Run type check (\`npx tsc --noEmit\`)
2. Run tests (\`npx jest --no-coverage\`)
3. Fix before marking complete

### Record Result
Update \`.nova.yaml\` with task status (done/failed) and timestamp.
On failure, ask user: abort, skip, or retry.

## Step 4: Final Verification
Run full test suite and type check. Report summary.

## Step 5: Update State
Set \`phases.build.status = 'done'\`.

## Constraints
- Follow existing project conventions. Never leave TODOs or stubs.
- Run checks after EACH task, not just at the end.
`,

  'nova-verify.md': `---
description: Nova verify phase — run code review and security review pipeline
---

# Nova Verify Phase

You are executing the **verify phase** of a Nova workflow. Your role is to
orchestrate a verification pipeline using ECC review skills.

## Step 1: Verify State
Read \`.nova.yaml\`. Require \`phases.build.status: done\`.
Update \`phases.verify.status\` to \`in-progress\` and set \`startedAt\`.

## Step 2: Gather Context
Load completed tasks from \`phases.design.tasks\`. Read changed files and the
design document.

## Step 3: Run Code Review
Use the **ecc:code-reviewer** skill to review each task's changed files:
correctness, conventions, error handling, test coverage, type safety.
Verdict: PASS / CHANGES_REQUESTED / COMMENT.

## Step 4: Run Security Review
Use the **ecc:security-reviewer** skill to audit each task's changed files:
injection risks, secret exposure, insecure dependencies, input validation.
Verdict: PASS / VULNERABILITY_FOUND. Include severity and remediation.

## Step 5: Generate Report
Write \`docs/designs/verification-report.md\` with summary, per-task results,
overall assessment (PASS / NEEDS_FIXES / BLOCKED), and recommendations.

## Step 6: Update State
Set \`phases.verify.status = 'done'\`, \`pipelineResult\` with stage results.

## Constraints
- Be specific — reference file paths and line numbers.
- Security findings must include severity and remediation.
`,

  'nova-iterate.md': `---
description: Nova iterate — roll back to a previous phase for iteration
---

# Nova Iterate Phase

You are handling a **phase iteration** in a Nova workflow. Software development
is iterative — implementation reveals design gaps, verification reveals spec issues.

## Step 1: Detect Current Phase
Read \`.nova.yaml\`. Determine which phase is active and which earlier phases are
valid rollback targets.

## Step 2: Present Options
Show valid rollback targets. For each, explain what will be reset.
Ask user: which phase, why (recorded in history), keep or discard work?

## Step 3: Execute Rollback
- **Keep work**: Reset state only — preserve all files. Set target phase and all
  subsequent phases to \`pending\`, clear task results and timestamps.
- **Discard work**: Additionally revert changed files via \`git checkout\`.

## Step 4: Record Iteration
Add to \`.nova.yaml\` metadata.history:
\`"Iterated <from> to <target>: <user's reason>"\`

## Step 5: Report Next Steps
Summarize what changed and which command to run next.

## Constraints
- Never delete code files without explicit user confirmation.
- Always record the iteration reason.
`,

  'nova-status.md': `---
description: Nova status — display phase progress, task completion, and stuck detection
---

# Nova Status

Display current project status from \`.nova.yaml\`.

## Step 1: Load State
Read \`.nova.yaml\`. Parse all phase statuses and task results.

## Step 2: Display Summary
Show each phase with status icon (pending/in-progress/done), timestamps, and
key artifacts. For the build phase, show per-task completion.

## Step 3: Detect Issues
Flag: phases stuck in-progress, failed tasks, skipped guard conditions,
missing artifacts.
`,
};

export class ClaudeCodeAdapter implements EnvironmentAdapter {
  name = 'claude-code';
  async setup(cwd: string) {
    const dir = path.join(cwd, '.claude', 'commands');
    await fs.mkdir(dir, { recursive: true });
    for (const [filename, content] of Object.entries(SKILL_TEMPLATES)) {
      await this.writeCommand(dir, filename, content);
    }
  }
  private async writeCommand(dir: string, file: string, content: string) {
    const filePath = path.join(dir, file);
    try { await fs.access(filePath); return; } catch {}
    await fs.writeFile(filePath, content);
  }
}
