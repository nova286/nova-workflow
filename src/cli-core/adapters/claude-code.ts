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

  'nova-propose.md': () => `---
description: Nova propose phase — specify an OpenSpec-compatible change contract
---

# Nova Propose Phase

You are executing the **propose phase** of a Nova workflow. Your role is to
orchestrate requirements exploration and produce an OpenSpec-compatible change
contract. Native OpenSpec is optional; if unavailable, write compatible artifacts.

## Step 1: Verify State
Read \`.nova.yaml\`. Check \`phases.propose.status\`. If pending, update to
\`in-progress\` and set \`startedAt\`.

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
\`phases.propose.proposal\`.

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
Update \`phases.design.status\` to \`in-progress\` and set \`startedAt\`.

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
Set \`phases.design.status = 'done'\`, \`designDoc\`, \`tasks\` from parsed YAML.

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
Update \`phases.implement.status\` to \`in-progress\` and set \`startedAt\`.

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
Update \`.nova.yaml\` with task status, specRefs, acceptanceRefs, tests,
filesChanged, traceIds, and timestamp.
On failure, ask user: abort, skip, or retry.

## Step 4: Final Verification
Run full test suite and type check. Report summary.

## Step 5: Update State
Set \`phases.implement.status = 'done'\`.

## Constraints
- Follow existing project conventions. Never leave TODOs or stubs.
- Run checks after EACH task, not just at the end.
`,

  'nova-verify.md': (mcp) => `---
description: Nova verify phase — run spec conformance, code, and security review
---

# Nova Verify Phase

You are executing the **verify phase** of a Nova workflow. Your role is to
orchestrate an ECC-compatible verification pipeline.

## Step 1: Verify State
Read \`.nova.yaml\`. Require \`phases.implement.status: done\`.
Update \`phases.verify.status\` to \`in-progress\` and set \`startedAt\`.

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

Check which Nova-enhancing tools are installed and provide setup guidance.

## Step 1: Detect Tools

For each tool below, run the detection check and report status:

### CodeGraph
\`\`\`bash
# Check: .codegraph/ directory exists in project, or codegraph command available
test -d .codegraph && echo "INSTALLED" || echo "NOT_FOUND"
which codegraph 2>/dev/null && echo "CLI_AVAILABLE" || echo "CLI_NOT_FOUND"
\`\`\`

### OpenSpec
\`\`\`bash
# Check: .openspec/ directory exists in project
test -d .openspec && echo "INSTALLED" || echo "NOT_FOUND"
\`\`\`

### Superpowers
\`\`\`bash
# Check: ~/.agents/skills/brainstorming exists
test -d ~/.agents/skills/brainstorming && echo "INSTALLED" || echo "NOT_FOUND"
\`\`\`

### ECC (Engineering Competence Center)
\`\`\`bash
# Check: ~/.agents/skills/ecc:* or ~/.claude/skills/ecc:* exists
ls ~/.agents/skills/ 2>/dev/null | grep -q "^ecc:" && echo "INSTALLED" || echo "NOT_FOUND"
\`\`\`

### Figma MCP
\`\`\`bash
# Check: figma MCP server configured in Claude settings
cat ~/.claude/settings.json 2>/dev/null | grep -qi figma && echo "CONFIGURED" || echo "NOT_CONFIGURED"
cat .claude/settings.json 2>/dev/null | grep -qi figma && echo "PROJECT_CONFIGURED" || echo "PROJECT_NOT_CONFIGURED"
\`\`\`

### Mobile MCP
\`\`\`bash
# Check: mobile/simulator MCP server configured
cat ~/.claude/settings.json 2>/dev/null | grep -qi "mobile\|simulator\|maestro" && echo "CONFIGURED" || echo "NOT_CONFIGURED"
\`\`\`

## Step 2: Report Results

Display a summary table:

\`\`\`
Nova Environment Detection
─────────────────────────────────────────
Tool          Status      Install
─────────────────────────────────────────
CodeGraph     [status]    [command or "—"]
OpenSpec      [status]    [command or "—"]
Superpowers   [status]    [command or "—"]
ECC           [status]    [command or "—"]
Figma MCP     [status]    [command or "—"]
Mobile MCP    [status]    [command or "—"]
─────────────────────────────────────────
\`\`\`

## Step 3: Provide Install Instructions

For each NOT_FOUND / NOT_CONFIGURED tool, show the install command:

### CodeGraph
\`\`\`bash
npm install -g codegraph
cd <project-dir> && codegraph init -i
\`\`\`

### OpenSpec
\`\`\`bash
# OpenSpec artifacts are generated by nova init
# If .openspec/ is missing, run: nova init --force
\`\`\`

### Superpowers
\`\`\`bash
# Install to ~/.agents/skills/ and symlink to ~/.claude/skills/
# Source: https://github.com/nicholasgriffintn/superpowers
git clone https://github.com/nicholasgriffintn/superpowers /tmp/superpowers
cp -r /tmp/superpowers/skills/* ~/.agents/skills/
for skill in ~/.agents/skills/*/; do
  name=$(basename "$skill")
  ln -sf "$skill" ~/.claude/skills/"$name"
done
\`\`\`

### ECC
\`\`\`bash
# Install ECC skills to ~/.agents/skills/
# Source: https://github.com/nicholasgriffintn/ecc
git clone https://github.com/nicholasgriffintn/ecc /tmp/ecc
cp -r /tmp/ecc/skills/* ~/.agents/skills/
for skill in ~/.agents/skills/ecc:*/; do
  name=$(basename "$skill")
  ln -sf "$skill" ~/.claude/skills/"$name"
done
\`\`\`

### Figma MCP
\`\`\`bash
# Add to ~/.claude/settings.json under mcpServers:
{
  "mcpServers": {
    "figma-mcp": {
      "command": "npx",
      "args": ["-y", "figma-mcp"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "<your-figma-token>"
      }
    }
  }
}
\`\`\`

### Mobile MCP
\`\`\`bash
# Add to ~/.claude/settings.json under mcpServers:
{
  "mcpServers": {
    "mobile-mcp": {
      "command": "npx",
      "args": ["-y", "mobile-mcp"]
    }
  }
}
\`\`\`

## Step 4: Offer Auto-Install

Ask user: "Would you like me to install any of the missing tools? Pick which ones."

Only install what the user confirms. For each selected tool:
1. Run the install command
2. Verify installation
3. Report success or failure

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
      await this.writeToSharedSkills(options?.mcpServers);
    } else {
      await this.writeToProjectSkills(cwd, options?.mcpServers);
    }
  }

  private async writeToSharedSkills(mcpServers?: McpServers) {
    const agentsSkillsDir = path.join(os.homedir(), '.agents', 'skills');
    const claudeSkillsDir = path.join(os.homedir(), '.claude', 'skills');
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
