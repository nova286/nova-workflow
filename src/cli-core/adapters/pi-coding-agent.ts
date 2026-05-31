import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { EnvironmentAdapter, AdapterSetupOptions, McpServers } from '../types';
import { FIGMA_STEP, MOBILE_STEP, SkillTemplateFn } from './skill-templates';

const PI_SKILL_TEMPLATES: Record<string, SkillTemplateFn> = {
  'nova.md': () => `---
description: Nova — unified entry point for Pi. Shows progress and suggests next action.
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
propose   [status]     docs/proposals/proposal.md
design    [status]     docs/designs/design.md
implement [status]     X/Y tasks done
verify    [status]
archive   [status]
────────────────────────────────────────
\`\`\`

## Step 3: Suggest Next Action
Based on the first phase that is NOT done:
- propose: pending → "Run propose phase"
- design: pending → "Run design phase"
- implement: pending → "Run implement phase"
- verify: pending → "Run verify phase"
- all done → "Run nova archive"
`,

  'nova-propose.md': () => `---
description: Nova propose phase — generate a feature proposal
---

# Nova Propose Phase

## Step 1: Verify State
Read \`.nova.yaml\`. Check \`phases.propose.status\`. If pending, update to \`in-progress\`.

## Step 2: Gather Context
Read \`AGENTS.md\`, \`README.md\`, \`package.json\`, \`src/\` to understand the project.

## Step 3: Explore Requirements
Clarify the problem, explore alternatives, identify risks, define success criteria.

## Step 4: Generate Proposal
Write \`docs/proposals/proposal.md\` with problem, solution, user stories, scope, success criteria.

## Step 5: Update State
Update \`.nova.yaml\`: phases.propose.status = done, proposal path.
`,

  'nova-design.md': (mcp) => `---
description: Nova design phase — create technical design and task list
---

# Nova Design Phase

## Step 1: Verify State
Read \`.nova.yaml\`. Require phases.propose.status = done. Update phases.design.status to in-progress.

## Step 2: Load Context
Read proposal, AGENTS.md, package.json, src/.

## Step 3: Explore Architecture
Explore at least 2 architectural approaches. Present alternatives.
${mcp?.figma ? FIGMA_STEP : ''}

## Step 4: Generate Design
Write \`docs/designs/design.md\` with architecture, tech stack, components, data flow, and task list in YAML.

## Step 5: Update State
Update .nova.yaml: phases.design.status = done, designDoc, tasks.
`,

  'nova-implement.md': () => `---
description: Nova implement phase — execute tasks with evidence
---

# Nova Implement Phase

## Step 1: Verify State
Read .nova.yaml. Require phases.design.status = done. Update phases.implement.status to in-progress.

## Step 2: Load Tasks
Show task summary. Confirm before proceeding.

## Step 3: Execute Each Task
For each task: implement, verify, record evidence (tests, filesChanged).
On failure: abort, skip, or retry.

## Step 4: Final Verification
Run full test suite and type check.

## Step 5: Update State
Set phases.implement.status = done.
`,

  'nova-verify.md': (mcp) => `---
description: Nova verify phase — run code review and security review
---

# Nova Verify Phase

## Step 1: Verify State
Read .nova.yaml. Require phases.implement.status = done. Update phases.verify.status to in-progress.

## Step 2: Gather Context
Load tasks, changed files, design document.

## Step 3: Code Review
Review changed files for correctness, conventions, error handling, test coverage.

## Step 4: Security Review
Audit for injection risks, secret exposure, insecure dependencies.
${mcp?.mobile ? MOBILE_STEP : ''}

## Step 5: Generate Report
Write docs/reports/verification-report.md.

## Step 6: Update State
Set phases.verify.status = done.
`,

  'nova-iterate.md': () => `---
description: Nova iterate — roll back to a previous phase
---

# Nova Iterate Phase

## Step 1: Detect Current Phase
Read .nova.yaml. Determine active phase and valid rollback targets.

## Step 2: Present Options
Show rollback targets. Ask: which phase, why, keep or discard work?

## Step 3: Execute Rollback
Reset target phase and subsequent phases to pending.

## Step 4: Record Iteration
Add to .nova.yaml metadata.history.
`,

  'nova-status.md': () => `---
description: Nova status — display phase progress
---

# Nova Status

## Step 1: Load State
Read .nova.yaml. Parse all phase statuses.

## Step 2: Display Summary
Show each phase with status icon and key artifacts.

## Step 3: Detect Issues
Flag: stuck phases, failed tasks, missing artifacts.
`,

  'nova-detect.md': () => `---
description: Nova detect — check installation status of tools and provide install instructions
---

# Nova Detect

Check which Nova-enhancing tools are installed and provide setup guidance.

## Step 1: Detect Tools

For each tool, run the detection check:

- **CodeGraph**: test -d .codegraph || which codegraph
- **OpenSpec**: test -d .openspec/changes
- **Superpowers**: test -d ~/.agents/skills/brainstorming
- **ECC**: ls ~/.agents/skills/ | grep -q "^ecc:"
- **Figma MCP**: grep -qi figma ~/.claude/settings.json
- **Mobile MCP**: grep -qi "mobile\|simulator" ~/.claude/settings.json

## Step 2: Report Results

Display a summary table with status and install command for each tool.

## Step 3: Provide Install Instructions

For missing tools, show install commands:

- CodeGraph: npm install -g codegraph && codegraph init -i
- OpenSpec: mkdir -p .openspec/changes (part of Nova, not a separate tool)
- Superpowers: git clone + cp to ~/.agents/skills/ + symlink to ~/.claude/skills/
- ECC: git clone + cp to ~/.agents/skills/ + symlink to ~/.claude/skills/
- Figma MCP: Add mcpServers entry to ~/.claude/settings.json
- Mobile MCP: Add mcpServers entry to ~/.claude/settings.json

## Step 4: Offer Auto-Install

Ask user which missing tools to install. Only install with confirmation.
`,
};

export class PiCodingAgentAdapter implements EnvironmentAdapter {
  name = 'pi-coding-agent';

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
    for (const [filename, templateFn] of Object.entries(PI_SKILL_TEMPLATES)) {
      const skillName = filename.replace('.md', '');
      const skillDir = path.join(agentsSkillsDir, skillName);
      await fs.mkdir(skillDir, { recursive: true });
      await this.writeSkillFile(path.join(skillDir, 'SKILL.md'), templateFn(mcpServers));
      const linkPath = path.join(claudeSkillsDir, skillName);
      try { await fs.access(linkPath); continue; } catch {}
      try { await fs.symlink(skillDir, linkPath); } catch {}
    }
  }

  private async writeToProjectSkills(cwd: string, mcpServers?: McpServers) {
    const skillsDir = path.join(cwd, '.claude', 'skills');
    for (const [filename, templateFn] of Object.entries(PI_SKILL_TEMPLATES)) {
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
