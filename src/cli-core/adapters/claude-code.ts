import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { EnvironmentAdapter, AdapterSetupOptions, McpServers } from '../types';
import { FIGMA_STEP, MOBILE_STEP, SkillTemplateFn } from './skill-templates';

const SKILL_TEMPLATES: Record<string, SkillTemplateFn> = {
  'nova.md': () => `---
description: Nova — unified entry point. Shows progress and suggests next action.
---

# Nova

Read \`.nova.yaml\` and present a compact overview with a clear next action.
If the \`nova\` CLI is available, prefer \`nova next\` for the deterministic
next-action decision.

## Step 1: Read State
Run \`nova next\` when available, or parse \`.nova.yaml\`. For each phase, determine status (pending / in-progress / done).
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
Also list: /nova-propose /nova-design /nova-implement /nova-verify /nova-iterate /nova-status and CLI helpers \`nova next\`, \`nova validate\`, \`nova checkpoint\`.

## Step 4: Act
Ask: "Run the suggested action, pick another, or do something else?"

## Constraints
Read-only unless the user explicitly confirms an action.
`,

  'nova-propose.md': () => `---
description: Nova propose phase — specify an OpenSpec-compatible change contract
---

# Nova Propose Phase

You are executing the **propose phase** of a Nova workflow. Your role is to
orchestrate requirements exploration and produce an OpenSpec-compatible change
contract. Native OpenSpec is optional; if unavailable, write compatible artifacts.

## Step 1: Verify State
Read \`.nova.yaml\`. Check \`phases.propose.status\`. If pending, update to
\`in-progress\` with \`nova checkpoint phase propose --status in-progress\` when available.

## Step 2: Gather Context
Read \`AGENTS.md\`, \`CLAUDE.md\`, \`README.md\`, \`package.json\`, \`src/\` to
understand the project.

## Step 3: Explore Requirements
Use the **brainstorming skill** to explore the problem space: clarify the problem,
explore alternatives, identify risks, define success criteria. Summarize for the
user and ask them to confirm before proceeding.

## Step 4: Generate Proposal
Write \`.openspec/changes/<change-id>/proposal.md\`, compatible spec files under
\`.openspec/changes/<change-id>/specs/\`, and \`docs/proposals/proposal.md\` as
a summary. Include requirement ids and acceptance ids for later task references.

## Step 5: Update State
Set \`activeChange\`, \`artifacts.openspecChange\`, \`artifacts.proposal\`,
\`artifacts.specDelta\`, \`phases.propose.status\`, and
\`phases.propose.proposal\`. Run \`nova validate\`, then mark completion with
\`nova checkpoint phase propose --status done\` when validation passes.

## Constraints
- Read any file for context. Write only to \`docs/proposals/\` and \`.nova.yaml\`.
- Do not modify source code — the implement phase handles that.
`,

  'nova-design.md': (mcp) => `---
description: Nova design phase — plan spec-bound work from an approved change
---

# Nova Design Phase

You are executing the **design phase** of a Nova workflow. Your role is to turn
the OpenSpec-compatible change into a Superpowers-compatible plan and task graph.

## Step 1: Verify State
Read \`.nova.yaml\`. Require \`phases.propose.status: done\` with a non-empty proposal.
Update \`phases.design.status\` to \`in-progress\` with
\`nova checkpoint phase design --status in-progress\` when available.

## Step 2: Load Context
Read the proposal/spec delta (\`artifacts.proposal\`, \`artifacts.openspecChange\`),
\`AGENTS.md\`, \`package.json\`, \`src/\`.

## Step 3: Explore Architecture Options
Use the **brainstorming skill** to explore at least 2 architectural approaches.
For each: architecture pattern, tech stack rationale, component structure, data
flow, key trade-offs. Present alternatives to the user for selection.
${mcp?.figma ? FIGMA_STEP : ''}

## Step 4: Generate Design Document
Based on the user-selected approach, use the **writing-plans skill** to produce
\`docs/designs/design.md\` and \`docs/superpowers/plans/<change-id>.md\`.
Tasks must include \`method\`, \`specRefs\`, \`acceptanceRefs\`, and
\`verification.commands\`.

## Step 5: Validate Tasks
Verify each task has all required fields (id, title, type, description, files,
acceptance, priority, estimatedComplexity).

## Step 6: Update State
Set \`designDoc\` and \`tasks\` from parsed YAML. Run \`nova validate\`, then
mark completion with \`nova checkpoint phase design --status done\`.

## Constraints
- Design and plan only — no implementation code.
- Tasks must be concrete: specific file paths, verifiable acceptance criteria.
`,

  'nova-implement.md': () => `---
description: Nova implement phase — execute spec-bound tasks with evidence
---

# Nova Implement Phase

You are executing the **implement phase** of a Nova workflow. Your role is to
execute each task as a spec-bound unit of work: resolve spec refs, apply the
task method, verify the result, and record evidence for review.

## Step 1: Verify State
Read \`.nova.yaml\`. Require \`phases.design.status: done\` with non-empty tasks.
Update \`phases.implement.status\` to \`in-progress\` with
\`nova checkpoint phase implement --status in-progress\` when available.

## Step 2: Load Task List
Show task summary (id, title, method, specRefs, priority). Ask user to confirm before
proceeding.

## Step 3: Execute Each Task
For each task in priority order:

### Route by Method
- **tdd** — use the **test-driven-development skill** when available
- **implementation** — write scoped production code with tests or no-test rationale
- **refactor** — preserve referenced spec behavior and run regression checks
- **docs** — update docs/specs and validate references
- **migration** — require dry-run, rollback notes, and compatibility evidence

### Verify After Each Task
1. Run \`task.verification.commands\` if present
2. Run type check (\`npx tsc --noEmit\`)
3. Run tests (\`npm test\` or project equivalent)
4. Confirm specRefs and acceptanceRefs have evidence before marking complete

### Record Result
Record task status and evidence with \`nova checkpoint task <task-id> --status done --files <csv> --tests <csv> --trace-id <id>\` when available.
On failure, ask user: abort, skip, or retry.

## Step 4: Final Verification
Run full test suite and type check. Report summary.

## Step 5: Update State
Run \`nova guard implement verify\`, then set \`phases.implement.status = 'done'\`
with \`nova checkpoint phase implement --status done\`.

## Constraints
- Follow existing project conventions. Never leave TODOs or stubs.
- Run checks after EACH task, not just at the end.
`,

  'nova-verify.md': (mcp) => `---
description: Nova verify phase — run spec conformance, code, and security review
---

# Nova Verify Phase

You are executing the **verify phase** of a Nova workflow. Your role is to
orchestrate an ECC (Everything Claude Code) compatible verification pipeline.

## Step 1: Verify State
Read \`.nova.yaml\`. Require \`phases.implement.status: done\`.
Update \`phases.verify.status\` to \`in-progress\` with
\`nova checkpoint phase verify --status in-progress\` when available.

## Step 2: Gather Context
Load completed tasks from \`phases.design.tasks\`. Read changed files, task
evidence, the design document, and \`artifacts.openspecChange\`.

## Step 3: Run Spec-Conformance Review
Compare task evidence against \`specRefs\` and \`acceptanceRefs\`. Verdict:
PASS / CHANGES_REQUESTED / BLOCKED.

## Step 4: Run Code Review
Use the **ecc:code-reviewer** skill to review each task's changed files:
correctness, conventions, error handling, test coverage, type safety.
Verdict: PASS / CHANGES_REQUESTED / COMMENT.

## Step 5: Run Security Review
Use the **ecc:security-reviewer** skill to audit each task's changed files:
injection risks, secret exposure, insecure dependencies, input validation.
Verdict: PASS / VULNERABILITY_FOUND. Include severity and remediation.
${mcp?.mobile ? MOBILE_STEP : ''}

## Step 6: Generate Report
Write \`docs/reports/verification-report.md\` with summary, spec-conformance results, per-task results,
overall assessment (PASS / NEEDS_FIXES / BLOCKED), and recommendations.

## Step 7: Update State
Set \`phases.verify.status = 'done'\`, \`pipelineResult\` with stage results.
Set \`artifacts.verificationReport = 'docs/reports/verification-report.md'\`.
Run \`nova validate\`, then mark completion with
\`nova checkpoint phase verify --status done\`.

## Constraints
- Be specific — reference file paths and line numbers.
- Security findings must include severity and remediation.
`,

  'nova-iterate.md': () => `---
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

  'nova-status.md': () => `---
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

  'nova-detect.md': () => `---
description: Nova detect — check installation status of tools and provide install instructions
---

# Nova Detect

Run \`nova detect --agent claude-code\` to check required, recommended, and
optional Nova-enhancing tools from a Claude Code session. Use
\`nova detect --agent claude-code --json\` when the user wants structured output.

## What To Report

- **Required**: Nova project state such as \`.nova.yaml\`. Missing required items
  block the current project until fixed.
- **Recommended**: OpenSpec, Superpowers, and affaan-m/ECC. Missing recommended items do
  not block Nova; compatible mode will be used.
- **Optional**: CodeGraph, Figma MCP, and Mobile MCP. Missing optional items only
  limit enhanced context, design, or UI verification workflows.

For each missing or partial item, show the install guidance from \`nova detect\`.
Do not imply that every tool must be installed before Nova can be used.

## Fallback

If the \`nova\` CLI is unavailable, explain that \`nova detect\` is the preferred
deterministic check and ask the user to run \`npm install -g @nova286/nova-workflow\`
or use the local project build.

## Constraints
- Never auto-install without user confirmation
- Always show what will be installed before running commands
- Respect existing configurations — don't overwrite
`,
};

export class ClaudeCodeAdapter implements EnvironmentAdapter {
  name = 'claude-code';
  async setup(cwd: string, options?: AdapterSetupOptions) {
    if (options?.skillsDir === 'user') {
      await this.writeToSharedSkills(options?.mcpServers, options.homeDir);
    } else {
      await this.writeToProjectSkills(cwd, options?.mcpServers);
    }
  }

  private async writeToSharedSkills(mcpServers?: McpServers, homeDir = os.homedir()) {
    const agentsSkillsDir = path.join(homeDir, '.agents', 'skills');
    const claudeSkillsDir = path.join(homeDir, '.claude', 'skills');
    await ensureSharedSkillsDirs(agentsSkillsDir, claudeSkillsDir);
    for (const [filename, templateFn] of Object.entries(SKILL_TEMPLATES)) {
      const skillName = filename.replace('.md', '');
      const skillDir = path.join(agentsSkillsDir, skillName);
      await fs.mkdir(skillDir, { recursive: true });
      await this.writeSkillFile(path.join(skillDir, 'SKILL.md'), templateFn(mcpServers));
      const linkPath = path.join(claudeSkillsDir, skillName);
      try { await fs.access(linkPath); continue; } catch {}
      try {
        await fs.symlink(skillDir, linkPath);
      } catch {}
    }
  }

  private async writeToProjectSkills(cwd: string, mcpServers?: McpServers) {
    const skillsDir = path.join(cwd, '.claude', 'skills');
    for (const [filename, templateFn] of Object.entries(SKILL_TEMPLATES)) {
      const skillName = filename.replace('.md', '');
      const skillDir = path.join(skillsDir, skillName);
      await fs.mkdir(skillDir, { recursive: true });
      await this.writeSkillFile(path.join(skillDir, 'SKILL.md'), templateFn(mcpServers));
    }
  }

  private async writeSkillFile(filePath: string, content: string) {
    const newHash = crypto.createHash('md5').update(content).digest('hex');
    try {
      const existing = await fs.readFile(filePath, 'utf-8');
      const oldHash = crypto.createHash('md5').update(existing).digest('hex');
      if (oldHash === newHash) return;
    } catch {}
    await fs.writeFile(filePath, content);
  }
}

async function ensureSharedSkillsDirs(agentsSkillsDir: string, claudeSkillsDir: string) {
  await fs.mkdir(agentsSkillsDir, { recursive: true });
  try {
    await fs.lstat(claudeSkillsDir);
    return;
  } catch {}

  await fs.mkdir(path.dirname(claudeSkillsDir), { recursive: true });
  try {
    await fs.symlink(agentsSkillsDir, claudeSkillsDir, 'dir');
  } catch {
    await fs.mkdir(claudeSkillsDir, { recursive: true });
  }
}
